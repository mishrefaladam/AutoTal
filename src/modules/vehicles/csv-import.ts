/**
 * Bestandsimport aus einer CSV-Datei des Händlersystems (WillhabenPro /
 * Motornetzwerk-Export).
 *
 * WOHER DIE DATEN KOMMEN – und woher nicht:
 * Der öffentliche Fahrzeugbestand läuft unverändert über das eingebettete
 * willhaben-Widget. Dieses Modul liest AUSSCHLIESSLICH eine vom Händler selbst
 * exportierte Datei. Es gibt keinen Abruf des Widgets, keine Widget-JSON-URL
 * und keine inoffizielle Schnittstelle – die CSV ist die einzige Quelle.
 *
 * Das Modul ist bewusst frei von Datenbank- und Framework-Bezügen: Parsen,
 * Normalisieren und Planen sind reine Funktionen und damit vollständig
 * testbar. Geschrieben wird erst in `import-service.ts`.
 */

import { mergeEquipment } from "./equipment";

// ---------------------------------------------------------------------------
// Datei einlesen
// ---------------------------------------------------------------------------

/**
 * Rohbytes in Text wandeln.
 *
 * Exporte aus Windows-Programmen kommen regelmäßig als Windows-1252 statt
 * UTF-8. Ohne Erkennung stünde dann Unsinn statt "Grün" in der Datenbank.
 * Erst UTF-8 streng versuchen; scheitert das, ist es kein UTF-8, und
 * Windows-1252 ist die richtige Annahme – es kennt jedes Byte.
 */
export function decodeCsv(bytes: Uint8Array): string {
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }

  // Byte Order Mark entfernen – sonst hieße die erste Spalte "﻿GW-Nr".
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Trennzeichen bestimmen.
 *
 * Deutsche Excel-Exporte nutzen das Semikolon, weil das Komma das
 * Dezimaltrennzeichen ist. Gezählt wird nur außerhalb von Anführungszeichen,
 * damit ein Semikolon in einem Freitextfeld nicht zum Trennzeichen erklärt
 * wird.
 */
export function detectDelimiter(firstLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = 0;

  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;

    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count += 1;
    }

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * CSV nach RFC 4180: Doppelte Anführungszeichen maskieren ein
 * Anführungszeichen, Zeilenumbrüche innerhalb von Anführungszeichen gehören
 * zum Feld.
 *
 * Eine eigene Umsetzung statt einer Abhängigkeit: Das Format ist hier klein
 * und vollständig abgedeckt, und der Parser muss ohnehin genau das tun, was
 * die Tests festhalten.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const sep = delimiter ?? detectDelimiter(normalized.split("\n")[0] ?? "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };

  const endRow = () => {
    endField();
    // Vollständig leere Zeilen entstehen durch Trennzeilen am Dateiende.
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === sep) endField();
    else if (char === "\n") endRow();
    else field += char;
  }

  if (field !== "" || row.length > 0) endRow();

  return rows;
}

// ---------------------------------------------------------------------------
// Werte normalisieren
// ---------------------------------------------------------------------------

/**
 * Zeichen, mit denen Tabellenprogramme eine Zelle als Formel auffassen.
 *
 * Ein Wert wie =HYPERLINK("http://…") würde beim späteren Öffnen eines
 * Exports in Excel ausgeführt. Solche Werte gar nicht erst zu speichern ist
 * wirksamer, als sie beim Export zu entschärfen: Der Export muss dann nichts
 * mehr wissen und kann es auch nicht vergessen.
 *
 * Das Minuszeichen steht bewusst NICHT in der Liste – es ist in Zahlenfeldern
 * ein gültiger Wert und wird dort ohnehin numerisch ausgewertet.
 */
const FORMULA_PREFIX = /^[=+@\t\r]+/;

/** Steuerzeichen, die in keinem der übernommenen Felder etwas zu suchen haben. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export type Sanitized = { value: string; neutralized: boolean };

/** Trimmen, Steuerzeichen entfernen, Formelzeichen am Anfang abschneiden. */
export function sanitizeCell(raw: string): Sanitized {
  const cleaned = raw.replace(CONTROL_CHARS, "").trim();
  const value = cleaned.replace(FORMULA_PREFIX, "").trim();

  return { value, neutralized: value !== cleaned };
}

/**
 * Deutsche Zahlen: "12.500,50", "12 500", "EUR 12.500,-", "145.000 km".
 *
 * Die Unterscheidung Tausender-/Dezimaltrennzeichen ist nicht geraten, sondern
 * ableitbar: Kommt beides vor, ist das letzte das Dezimaltrennzeichen. Kommt
 * nur ein Punkt vor und stehen dahinter genau drei Ziffern, ist es ein
 * Tausenderpunkt – "12.500" sind zwölftausendfünfhundert, nicht 12,5.
 */
export function parseGermanNumber(raw: string): number | null {
  const negative = /^\s*-/.test(raw);
  // Trennzeichen am Ende stammen aus Schreibweisen wie "12.500,-" und tragen
  // keine Information. Ohne sie zu entfernen, ergäbe "12.500." keine Zahl.
  const cleaned = raw.replace(/[^\d,.]/g, "").replace(/[.,]+$/, "");
  if (cleaned === "") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalAt = Math.max(lastComma, lastDot);
    normalized =
      cleaned.slice(0, decimalAt).replace(/[.,]/g, "") +
      "." +
      cleaned.slice(decimalAt + 1).replace(/[.,]/g, "");
  } else if (lastComma !== -1) {
    // Ein einzelnes Komma ist im Deutschen immer das Dezimaltrennzeichen.
    normalized = cleaned.replace(/,/g, ".");
  } else if (lastDot !== -1) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals === 3 ? cleaned.replace(/\./g, "") : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

/** Ganzzahl (Kilometer, Standzeit). */
export function parseGermanInteger(raw: string): number | null {
  const value = parseGermanNumber(raw);
  return value === null ? null : Math.round(value);
}

/** Euro-Betrag in Cent – die Konvention des Projekts. */
export function parseEuroToCents(raw: string): number | null {
  const value = parseGermanNumber(raw);
  return value === null ? null : Math.round(value * 100);
}

/**
 * Preisspalte lesen. `null` heißt "kein Preis angegeben".
 *
 * Der Nullwert ist der Kern: WillhabenPro schreibt in den Angebotspreis eine
 * 0, wenn es keinen Aktionspreis gibt – in einem echten Bestandsexport steht
 * das in jeder einzelnen Zeile. Als Betrag gelesen ergäbe das ein Fahrzeug für
 * 0 €, das die Website so auch anzeigen und die KI so auch bewerben würde.
 * Ein Preis von null Euro ist im Fahrzeughandel keine Angabe, sondern das
 * Fehlen einer Angabe.
 *
 * Negative Beträge werden ebenso verworfen statt auf 0 gekappt – auch das
 * wäre eine erfundene Zahl.
 */
export function parsePriceColumn(raw: string): number | null {
  if (raw.trim() === "") return null;

  const cents = parseEuroToCents(raw);
  if (cents === null || cents <= 0) return null;

  return cents;
}

/**
 * FIN normalisieren. Genormt sind 17 Zeichen; kürzere Werte werden trotzdem
 * zur Zuordnung genutzt (Altbestand führt sie mitunter verkürzt), aber
 * gemeldet.
 */
export function normalizeVin(raw: string): string | null {
  const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return value === "" ? null : value;
}

// ---------------------------------------------------------------------------
// Spaltenzuordnung
// ---------------------------------------------------------------------------

export type VehicleCsvField =
  | "stockNumber"
  | "vin"
  | "make"
  | "model"
  | "color"
  | "mileageKm"
  | "year"
  | "salePrice"
  | "offerPrice"
  | "listedOn"
  | "features"
  | "highlights"
  | "standingDays";

export const FIELD_LABELS: Record<VehicleCsvField, string> = {
  stockNumber: "GW-Nr",
  vin: "FIN",
  make: "Marke",
  model: "Modell",
  color: "Farbe",
  mileageKm: "KM-Stand",
  year: "Baujahr",
  salePrice: "Verkaufspreis",
  offerPrice: "Angebotspreis",
  listedOn: "online auf",
  features: "Ausstattung",
  highlights: "Bisherige Ausstattung",
  standingDays: "Standzeit (Tage)",
};

/**
 * Erlaubte Schreibweisen je Feld.
 *
 * Verglichen wird über `normalizeHeader`, also ohne Leerzeichen,
 * Sonderzeichen und Groß-/Kleinschreibung. "GW-Nr", "GW Nr.", "gwnr" und
 * "Gebrauchtwagen-Nummer" landen damit alle auf demselben Feld.
 */
const HEADER_ALIASES: Record<VehicleCsvField, string[]> = {
  stockNumber: [
    "GW-Nr",
    "GW Nummer",
    "Gebrauchtwagen-Nummer",
    "Bestandsnummer",
    "Fahrzeugnummer",
    "Interne Nr",
  ],
  vin: ["FIN", "VIN", "Fahrgestellnummer", "Fahrgestell-Nr", "Chassisnummer"],
  make: ["Marke", "Hersteller", "Make", "Brand"],
  model: ["Modell", "Model", "Typ", "Fahrzeugmodell"],
  color: ["Farbe", "Außenfarbe", "Color", "Lackierung"],
  mileageKm: ["KM-Stand", "KM", "Kilometerstand", "Laufleistung", "Mileage"],
  year: ["Baujahr", "Erstzulassung", "EZ", "Jahr", "Year"],
  salePrice: ["Verkaufspreis", "Preis", "VK-Preis", "Listenpreis", "Price"],
  offerPrice: ["Angebotspreis", "Aktionspreis", "Internetpreis"],
  listedOn: ["online auf", "online", "Plattform", "Plattformen", "inseriert auf"],
  features: ["Ausstattung", "Features", "Serienausstattung", "Ausstattungen"],
  highlights: ["Highlights", "Highlight"],
  standingDays: ["Standzeit (Tage)", "Standzeit", "Standtage", "Tage im Bestand"],
};

/** Kopfzeilen vergleichbar machen: nur Buchstaben und Ziffern, klein. */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMapping = {
  /** Zugeordnete Spalten: Feld, Spaltenindex und Originalüberschrift. */
  matched: { field: VehicleCsvField; index: number; header: string }[];
  /** Überschriften ohne Entsprechung. Werden übersprungen, nicht verworfen. */
  ignored: string[];
};

export function mapColumns(headerRow: string[]): ColumnMapping {
  const matched: ColumnMapping["matched"] = [];
  const ignored: string[] = [];
  const taken = new Set<VehicleCsvField>();

  headerRow.forEach((rawHeader, index) => {
    const header = sanitizeCell(rawHeader).value;
    const normalized = normalizeHeader(header);
    if (normalized === "") return;

    const field = (Object.keys(HEADER_ALIASES) as VehicleCsvField[]).find(
      (candidate) =>
        !taken.has(candidate) &&
        HEADER_ALIASES[candidate].some(
          (alias) => normalizeHeader(alias) === normalized,
        ),
    );

    if (field) {
      taken.add(field);
      matched.push({ field, index, header });
    } else {
      ignored.push(header);
    }
  });

  return { matched, ignored };
}

// ---------------------------------------------------------------------------
// Zeilen auswerten
// ---------------------------------------------------------------------------

export type ParsedVehicleRow = {
  features?: string[];
  /** Zeilennummer in der Datei, 1-basiert inklusive Kopfzeile. */
  line: number;
  stockNumber: string | null;
  vin: string | null;
  make: string;
  model: string;
  color: string | null;
  mileageKm: number | null;
  year: number | null;
  /** Beworbener Preis in Cent. null = keine Angabe, niemals 0. */
  priceCents: number | null;
  /** Listenpreis, nur wenn er vom beworbenen Preis abweicht. */
  listPriceCents: number | null;
  /** Plattformen, auf denen das Fahrzeug inseriert ist – leer = nicht aktiv. */
  listedOn: string | null;
  standingDays: number | null;
  warnings: string[];
};

export type RowError = { line: number; message: string };

export type ParsedCsv = {
  mapping: ColumnMapping;
  rows: ParsedVehicleRow[];
  /** Zeilen, die kein Fahrzeug ergeben. Nie stillschweigend übergangen. */
  errors: RowError[];
  /** Auffälligkeiten der Datei als Ganzes. */
  fileWarnings: string[];
  totalDataRows: number;
  /**
   * Zeilen ohne Inserat, die deshalb nicht importiert werden.
   *
   * Der Bestandsexport enthält auch Fahrzeuge, die nirgends online stehen –
   * bereits verkauft, noch nicht freigegeben oder aus dem Angebot genommen.
   * Erkennbar an einer leeren Spalte "online auf". Sie gehören nicht auf die
   * Website und nicht in den Beitragsassistenten; sie werden deshalb schon
   * hier ausgesondert und nur gezählt. Gilt nur, wenn die Datei die Spalte
   * überhaupt führt – ohne sie gilt jede Zeile als aktiv.
   */
  inactiveRows: number;
};

/** Ohne diese Spalten ergibt eine Zeile kein Fahrzeug. */
const REQUIRED_FIELDS: VehicleCsvField[] = ["make", "model"];

/** Baujahr aus "2019", "03/2019" oder "01.03.2019". */
function parseYear(raw: string): number | null {
  const match = raw.match(/(19|20)\d{2}/);
  if (!match) return null;

  const year = Number(match[0]);
  const nextYear = new Date().getFullYear() + 1;

  return year >= 1900 && year <= nextYear ? year : null;
}

export function parseVehicleCsv(text: string): ParsedCsv {
  const table = parseCsv(text);
  const fileWarnings: string[] = [];

  if (table.length === 0) {
    return {
      mapping: { matched: [], ignored: [] },
      rows: [],
      errors: [{ line: 0, message: "Die Datei enthält keine Zeilen." }],
      fileWarnings,
      totalDataRows: 0,
      inactiveRows: 0,
    };
  }

  const mapping = mapColumns(table[0]);
  const byField = new Map(
    mapping.matched.map((entry) => [entry.field, entry.index]),
  );

  const missingRequired = REQUIRED_FIELDS.filter((field) => !byField.has(field));
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((field) => FIELD_LABELS[field]).join(", ");
    const found = mapping.matched.map((entry) => entry.header).join(", ");

    return {
      mapping,
      rows: [],
      errors: [
        {
          line: 1,
          message:
            `In der Kopfzeile fehlen Pflichtspalten: ${labels}. ` +
            `Erkannt wurden: ${found || "keine"}.`,
        },
      ],
      fileWarnings,
      totalDataRows: Math.max(table.length - 1, 0),
      inactiveRows: 0,
    };
  }

  if (!byField.has("vin") && !byField.has("stockNumber")) {
    fileWarnings.push(
      "Die Datei enthält weder eine FIN- noch eine GW-Nr-Spalte. Ohne eines " +
        "dieser Merkmale lässt sich keine Zeile einem bestehenden Fahrzeug " +
        "zuordnen.",
    );
  }

  if (mapping.ignored.length > 0) {
    fileWarnings.push(
      `Nicht zugeordnete Spalten werden übersprungen: ${mapping.ignored.join(", ")}.`,
    );
  }

  const rows: ParsedVehicleRow[] = [];
  const errors: RowError[] = [];

  const cell = (row: string[], field: VehicleCsvField): Sanitized => {
    const index = byField.get(field);
    if (index === undefined) return { value: "", neutralized: false };
    return sanitizeCell(row[index] ?? "");
  };

  for (let i = 1; i < table.length; i += 1) {
    const row = table[i];
    const line = i + 1;

    try {
      const warnings: string[] = [];

      const read = (field: VehicleCsvField): string => {
        const input = cell(row, field);
        if (input.neutralized) {
          warnings.push(
            `${FIELD_LABELS[field]}: führende Formelzeichen wurden entfernt.`,
          );
        }
        return input.value;
      };

      const make = read("make");
      const model = read("model");

      if (make === "" || model === "") {
        errors.push({
          line,
          message:
            "Marke und Modell sind Pflichtangaben – die Zeile wurde übersprungen.",
        });
        continue;
      }

      const vin = normalizeVin(read("vin"));
      if (vin && vin.length !== 17) {
        warnings.push(
          `FIN „${vin}“ hat ${vin.length} statt 17 Zeichen. Sie wird trotzdem zur Zuordnung verwendet.`,
        );
      }

      const mileageRaw = read("mileageKm");
      const mileageKm = mileageRaw === "" ? null : parseGermanInteger(mileageRaw);
      if (mileageRaw !== "" && mileageKm === null) {
        warnings.push(
          `Kilometerstand „${mileageRaw}“ ist keine Zahl und wurde ausgelassen.`,
        );
      }

      const yearRaw = read("year");
      const year = yearRaw === "" ? null : parseYear(yearRaw);
      if (yearRaw !== "" && year === null) {
        warnings.push(`Baujahr „${yearRaw}“ konnte nicht gelesen werden.`);
      }

      // --- Preise ---------------------------------------------------------
      // Der Angebotspreis ist der tatsächlich beworbene Preis und gewinnt.
      // Der Verkaufspreis wird zum Listenpreis, aber nur, wenn er davon
      // abweicht – sonst stünden zwei gleiche Zahlen in zwei Feldern.
      const offerRaw = read("offerPrice");
      const saleRaw = read("salePrice");

      const offerPriceCents = parsePriceColumn(offerRaw);
      const salePriceCents = parsePriceColumn(saleRaw);

      const priceCents = offerPriceCents ?? salePriceCents;
      const listPriceCents =
        offerPriceCents !== null &&
        salePriceCents !== null &&
        salePriceCents !== offerPriceCents
          ? salePriceCents
          : null;

      // Stand etwas in der Spalte, ließ sich aber nicht als Betrag lesen.
      const unreadable = [offerRaw, saleRaw].filter(
        (value) => value !== "" && parseEuroToCents(value) === null,
      );

      if (unreadable.length > 0) {
        warnings.push(
          `Preis „${unreadable[0]}“ ist keine Zahl und wurde ausgelassen.`,
        );
      }

      if (priceCents === null) {
        warnings.push(
          "Kein Preis angegeben. Ein bestehendes Fahrzeug behält seinen " +
            "bisherigen Preis; ein neues lässt sich ohne Preis nicht anlegen.",
        );
      }

      const standingRaw = read("standingDays");
      // Keep commas within equipment names. Lists use newlines, semicolons or pipes.
      const features = mergeEquipment(...(["features", "highlights"] as const).map((field) => {
        const index = byField.get(field);
        return index === undefined ? [] : (row[index] ?? "")
          .split(/[\r\n;|]+/).map((entry) => sanitizeCell(entry).value);
      }));

      rows.push({
        ...(features.length > 0 ? { features } : {}),
        line,
        stockNumber: read("stockNumber") || null,
        vin,
        make,
        model,
        color: read("color") || null,
        mileageKm: mileageKm === null ? null : Math.max(mileageKm, 0),
        year,
        priceCents,
        listPriceCents,
        listedOn: read("listedOn") || null,
        standingDays: standingRaw === "" ? null : parseGermanInteger(standingRaw),
        warnings,
      });
    } catch {
      // Eine kaputte Zeile darf den Import nicht abbrechen. Der Grund bleibt
      // bewusst allgemein – interne Fehlertexte gehören nicht in die Anzeige.
      errors.push({
        line,
        message: "Die Zeile konnte nicht gelesen werden und wurde übersprungen.",
      });
    }
  }

  // --- Nicht inserierte Fahrzeuge aussondern --------------------------------
  // Nur wenn die Datei die Spalte führt. Fehlt sie, gibt es keine Grundlage
  // für die Unterscheidung, und jede Zeile gilt als aktiv.
  const hasListingColumn = byField.has("listedOn");
  const active = hasListingColumn
    ? rows.filter((row) => row.listedOn !== null)
    : rows;

  return {
    mapping,
    rows: active,
    errors,
    fileWarnings,
    totalDataRows: Math.max(table.length - 1, 0),
    inactiveRows: rows.length - active.length,
  };
}
