import { equipmentLines, mergeEquipment } from "./equipment";
import type { FuelType, TransmissionType } from "@/generated/prisma/enums";

import { parseEuroToCents, parseGermanInteger } from "./csv-import";
import type { PriceSheetFields } from "./price-sheet";

/**
 * Preisblattfelder auf Fahrzeugdaten abbilden – als reine Berechnung.
 *
 * Zwei Regeln tragen dieses Modul:
 *
 *   1. Was nicht dasteht, wird nicht gesetzt. Ein leeres Preisblattfeld ergibt
 *      `null` und kann später keinen gepflegten Wert überschreiben.
 *   2. Händlertext ist keine Fahrzeugangabe. Name, Anschrift, Fußzeile,
 *      Finanzierungsparameter und die Beschriftungsfelder der Vorlage
 *      (FD1…FD6, FB1…FB4) werden bewusst nicht übernommen.
 *
 * Die Zahlenformate sind dieselben wie im Bestandsimport, deshalb werden
 * dessen Parser mitbenutzt statt nachgebaut.
 */

/** Felder, die niemals zu Fahrzeugdaten werden. */
export const IGNORED_FIELDS = [
  // Beschriftungen der Vorlage, keine Werte.
  "FD1", "FD2", "FD3", "FD4", "FD5", "FD6",
  "FB1", "FB2", "FB3", "FB4",
  // Händlerangaben.
  "Dealer_Name", "Dealer_Footer",
  // Finanzierung – gehört nicht ins Fahrzeug.
  "Anzahlung", "Rate", "Laufzeit", "Restwert",
  // Interne Kennungen und Händlerangaben des Verkaufsangebots.
  "wh_code", "novamwst",
  "VKName", "VKTelefon", "VKAdresse[0]", "Ort 1", "Datum", "Interessent", "gueltig",
  "FD7", "Abgasnorm",
] as const;

// ---------------------------------------------------------------------------
// Einzelwerte
// ---------------------------------------------------------------------------

/** "03.2015", "03/2015", "2015" → 1. des Monats. Tag gibt das Blatt nicht her. */
export function parseRegistration(raw: string): Date | null {
  const monthYear = /(\d{1,2})\s*[.\/-]\s*(\d{4})/.exec(raw);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month >= 1 && month <= 12 && year >= 1900) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }

  const yearOnly = /\b(19|20)\d{2}\b/.exec(raw);
  if (yearOnly) return new Date(Date.UTC(Number(yearOnly[0]), 0, 1));

  return null;
}

/**
 * "140 KW (190 PS)" → 140.
 *
 * Gespeichert wird ausschließlich die Leistung in kW. PS sind dieselbe Größe
 * in einer anderen Einheit; beide zu speichern hieße, zwei Zahlen zu führen,
 * die einander widersprechen können. Die Anzeige rechnet um.
 */
export function parsePowerKw(raw: string): number | null {
  const kw = /(\d+(?:[.,]\d+)?)\s*kw/i.exec(raw);
  if (kw) return Math.round(Number(kw[1].replace(",", ".")));

  const ps = /(\d+(?:[.,]\d+)?)\s*(?:ps|hp)/i.exec(raw);
  if (ps) return Math.round(Number(ps[1].replace(",", ".")) / 1.35962);

  // Nackte Zahl: Im Feld "Leistung" ist kW die übliche Einheit.
  const plain = /^\s*(\d{2,4})\s*$/.exec(raw);
  return plain ? Number(plain[1]) : null;
}

/** kW → PS, nur für die Anzeige. */
export function kwToPs(kw: number): number {
  return Math.round(kw * 1.35962);
}

const FUEL_BY_LABEL: Record<string, FuelType> = {
  diesel: "DIESEL",
  benzin: "PETROL",
  super: "PETROL",
  otto: "PETROL",
  elektro: "ELECTRIC",
  elektrisch: "ELECTRIC",
  strom: "ELECTRIC",
  hybrid: "HYBRID",
  vollhybrid: "HYBRID",
  "plug-in-hybrid": "PLUGIN_HYBRID",
  "plugin hybrid": "PLUGIN_HYBRID",
  plugin: "PLUGIN_HYBRID",
  lpg: "LPG",
  autogas: "LPG",
  flüssiggas: "LPG",
  cng: "CNG",
  erdgas: "CNG",
  wasserstoff: "HYDROGEN",
};

export function parseFuel(raw: string): FuelType | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  // Längste Übereinstimmung zuerst, damit "plug-in-hybrid" nicht als "hybrid"
  // durchgeht.
  const keys = Object.keys(FUEL_BY_LABEL).sort((a, b) => b.length - a.length);
  const hit = keys.find((key) => value.includes(key));

  return hit ? FUEL_BY_LABEL[hit] : null;
}

const TRANSMISSION_BY_LABEL: Record<string, TransmissionType> = {
  automatik: "AUTOMATIC",
  automatisch: "AUTOMATIC",
  dsg: "AUTOMATIC",
  tiptronic: "AUTOMATIC",
  "s-tronic": "AUTOMATIC",
  halbautomatik: "SEMI_AUTOMATIC",
  automatisiert: "SEMI_AUTOMATIC",
  schaltgetriebe: "MANUAL",
  schaltung: "MANUAL",
  manuell: "MANUAL",
  handschaltung: "MANUAL",
};

export function parseTransmission(raw: string): TransmissionType | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  const keys = Object.keys(TRANSMISSION_BY_LABEL).sort((a, b) => b.length - a.length);
  const hit = keys.find((key) => value.includes(key));

  return hit ? TRANSMISSION_BY_LABEL[hit] : null;
}

// ---------------------------------------------------------------------------
// Beschreibung
// ---------------------------------------------------------------------------

/**
 * Zeilen, an denen ein Absatz als Händlertext erkennbar ist.
 *
 * Das Feld "Details" der Vorlage ist überwiegend Werbung: Begrüßung,
 * Finanzierungsangebot, Inzahlungnahme, Anschrift, E-Mail. Nichts davon
 * beschreibt das Fahrzeug, und als Fahrzeugbeschreibung gespeichert ginge es
 * später in den Instagram-Text ein.
 */
const DEALER_TEXT_MARKERS = [
  /finanzier/i,
  /inzahlungnahme/i,
  // Der Preis ist ein eigenes Feld. In der Beschreibung wiederholt, liefe er
  // bei der nächsten Preisänderung dem tatsächlichen Wert hinterher.
  /fahrzeugpreis/i,
  /^preis\s*:/i,
  /bonität/i,
  /anzahlung/i,
  /monatliche rate/i,
  /laufzeit/i,
  /besuchen sie uns/i,
  /willkommen bei/i,
  /wir freuen uns/i,
  /probefahrt nach vereinbarung/i,
  /besichtigung nach termin/i,
  /unsere leidenschaft/i,
  /ihr partner für/i,
  // Kontaktdaten
  /@[\w.-]+\.\w{2,}/,
  /\b\d{4,}\s*\d{3,}/,
  /e-?mail/i,
  /hauptstra(ß|ss)e/i,
  /\b\d{4}\s+[A-ZÄÖÜ]/,
];

export type DescriptionProposal = {
  /** Nur die fahrzeugbezogenen Zeilen. */
  text: string;
  /** Wie viele Absätze als Händlertext ausgeschieden wurden. */
  droppedParagraphs: number;
};

/**
 * Weist sich diese ZEILE als Fahrzeugangabe aus?
 *
 * Bewusst eine Positivauswahl Zeile für Zeile statt einer Sperrliste über
 * Absätze. Zwei Gründe:
 *
 *   Eine Sperrliste lässt zu viel durch. "Persönliche Beratung" und "Faire und
 *   transparente Preise" beschreiben kein Fahrzeug, sind aber in keiner
 *   sinnvollen Sperrliste zu fassen.
 *
 *   Absätze sind zu grob. Der Werbeblock der Vorlage beginnt mit der Zeile
 *   "| FINANZIERUNG MÖGLICH |" – zwei senkrechte Striche, die einen ganzen
 *   Absatz als Datenzeile durchgehen ließen.
 *
 * Der Preis dafür: Eine mehrzeilige, frei formulierte Fahrzeugbeschreibung
 * würde gekürzt. Das ist hier das kleinere Übel, denn der Vorschlag wird nie
 * vorausgewählt und ist im Formular frei bearbeitbar – während Händlerwerbung,
 * einmal als Beschreibung gespeichert, in den Instagram-Text geriete.
 */
function isVehicleLine(line: string, make: string | null): boolean {
  // Datenzeile der Vorlage: "|2.0 TDI | 03/2015 | 245.858 km| Automatik"
  if ((line.match(/\|/g)?.length ?? 0) >= 2 && /\d/.test(line)) return true;

  if (/\d[\d.]{2,}\s*km\b/i.test(line)) return true;

  if (make && make.length >= 2) {
    const pattern = new RegExp(`\\b${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(line)) return true;
  }

  return false;
}

/**
 * Aus dem Details-Feld einen Beschreibungsvorschlag gewinnen.
 *
 * Was durchkommt, ist ein *Vorschlag* und nie vorausgewählt: Auch eine Zeile
 * mit Fahrzeugbezug kann noch Händlersprache enthalten.
 */
export function proposeDescription(
  details: string,
  make: string | null = null,
): DescriptionProposal {
  const paragraphs = details
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const kept: string[] = [];
  let dropped = 0;

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => isVehicleLine(line, make))
      // Auch innerhalb einer Fahrzeugzeile: Werbung und Kontaktdaten raus.
      .filter((line) => !DEALER_TEXT_MARKERS.some((marker) => marker.test(line)))
      // Auszeichnungsüberschriften wie "—UNSER FAHRZEUGANGEBOT—".
      .filter((line) => !/^[—|\s]*[A-ZÄÖÜ\s|—-]{6,}$/.test(line));

    if (lines.length === 0) {
      dropped += 1;
      continue;
    }

    kept.push(lines.join("\n"));
  }

  return { text: kept.join("\n\n").trim(), droppedParagraphs: dropped };
}

// ---------------------------------------------------------------------------
// Gesamtabbildung
// ---------------------------------------------------------------------------

export type PriceSheetValues = {
  make: string | null;
  variant: string | null;
  firstRegistration: Date | null;
  mileageKm: number | null;
  powerKw: number | null;
  fuel: FuelType | null;
  transmission: TransmissionType | null;
  /** Hubraum in cm³ – im Verkaufsangebot als "1.995 ccm" ausgewiesen. */
  displacementCcm: number | null;
  color: string | null;
  /** Bestandsnummer, falls das Blatt sie ausweist. */
  stockNumber: string | null;
  priceCents: number | null;
  features: string[];
  description: string | null;
  descriptionDropped: number;
};

/** Bis zu zwölf Highlights, in der Reihenfolge der Vorlage. */
function collectHighlights(fields: PriceSheetFields): string[] {
  const found: { index: number; value: string }[] = [];

  for (const [name, value] of Object.entries(fields)) {
    const match = /^(?:Highlights?|Features?|Ausstattung)_(\d+)$/i.exec(name);
    if (!match) continue;

    const trimmed = value.trim();
    if (trimmed !== "") found.push({ index: Number(match[1]), value: trimmed });
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.value)
    .filter((value, index, all) => all.indexOf(value) === index);
}

export function mapPriceSheet(fields: PriceSheetFields): PriceSheetValues {
  const read = (name: string): string => fields[name]?.trim() ?? "";

  const make = read("Marke") || null;
  const details = read("Details");
  const description = details === "" ? null : proposeDescription(details, make);

  return {
    make,
    // "Bezeichnung" ist die Modellbezeichnung, nicht das Modell. Das Modell
    // bleibt unangetastet – es aus der Bezeichnung zu schneiden wäre geraten.
    variant: read("Bezeichnung") || null,
    firstRegistration: read("Erstzulassung") ? parseRegistration(read("Erstzulassung")) : null,
    mileageKm: read("Kilometer") ? parseGermanInteger(read("Kilometer")) : null,
    powerKw: read("Leistung") ? parsePowerKw(read("Leistung")) : null,
    fuel: read("Treibstoff") ? parseFuel(read("Treibstoff")) : null,
    transmission: read("Getriebe") ? parseTransmission(read("Getriebe")) : null,
    displacementCcm: read("Hubraum") ? parseGermanInteger(read("Hubraum")) : null,
    // Farbangaben bleiben Freitext – das Datenmodell führt sie ebenso.
    color: read("Farbe") || null,
    stockNumber: read("GW-Nr") || null,
    priceCents: read("Preis") ? parseEuroToCents(read("Preis")) : null,
    features: mergeEquipment(
      equipmentLines(read("Ausstattung")), equipmentLines(read("Features")),
      equipmentLines(read("Highlights")), collectHighlights(fields),
    ),
    description: description && description.text !== "" ? description.text : null,
    descriptionDropped: description?.droppedParagraphs ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Plausibilität
// ---------------------------------------------------------------------------

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Gehört das Preisblatt überhaupt zu diesem Fahrzeug?
 *
 * Das Zielfahrzeug steht durch die Seite fest, eine Suche ist nicht nötig.
 * Aber eine verwechselte Datei würde sonst unbemerkt fremde Daten einspielen –
 * deshalb ein Hinweis, der eine bewusste Bestätigung verlangt und nichts
 * blockiert.
 */
export function checkPlausibility(
  values: PriceSheetValues,
  vehicle: { make: string; model: string; variant: string | null },
): string[] {
  const warnings: string[] = [];

  if (values.make) {
    const pdfMake = normalizeForCompare(values.make);
    const ownMake = normalizeForCompare(vehicle.make);

    if (pdfMake !== "" && ownMake !== "" && !pdfMake.includes(ownMake) && !ownMake.includes(pdfMake)) {
      warnings.push(
        `Das Preisblatt nennt die Marke „${values.make}“, das Fahrzeug ist als ` +
          `„${vehicle.make}“ erfasst. Das Preisblatt scheint möglicherweise zu ` +
          `einem anderen Fahrzeug zu gehören.`,
      );
    }
  }

  if (values.variant) {
    const pdfText = normalizeForCompare(values.variant);
    const ownModel = normalizeForCompare(vehicle.model);

    // Das Modell steckt fast immer in der Bezeichnung ("X3 xDrive 20d" zu
    // "X3 Reihe"). Fehlt jede Überschneidung, lohnt der Hinweis.
    const modelCore = ownModel.replace(/reihe|serie|klasse/g, "");

    if (modelCore.length >= 2 && !pdfText.includes(modelCore)) {
      warnings.push(
        `Die Bezeichnung im Preisblatt („${values.variant}“) enthält das erfasste ` +
          `Modell „${vehicle.model}“ nicht. Bitte prüfen Sie, ob das Blatt zu ` +
          `diesem Fahrzeug gehört.`,
      );
    }
  }

  return warnings;
}
