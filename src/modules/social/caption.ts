import { formatKilometers, kwToPs } from "@/lib/money";
import { buildVehicleTitle } from "@/modules/vehicles/slug";

/**
 * Instagram-Text nach der AutoTal-Vorlage.
 *
 * Nach Rücksprache mit dem Kunden besteht der Beitrag aus einem festen Gruß,
 * vier Fahrzeugzeilen, drei festen Servicepunkten und einem festen Abschluss:
 *
 *   Herzlich willkommen bei Autotal! 🚗
 *
 *   Porsche Panamera 4S
 *   Kilometer: 85.000 km
 *   Baujahr: 2019
 *   Leistung: 440 PS
 *
 *   • Fahrzeugankauf & -verkauf
 *   • Inzahlungnahme möglich
 *   • Österreichweite Zustellung gegen Aufpreis
 *
 *   Weitere Details zum Fahrzeug:
 *   www.autotal.at
 *
 * WARUM KEINE KI: In diesem Text gibt es nichts zu formulieren. Jede Zeile ist
 * entweder fest oder ein Fahrzeugwert in fester Schreibweise. Ein Sprachmodell
 * könnte hier nur abweichen – ein anderes Wort, eine gerundete Zahl, eine
 * erfundene Ausstattung –, aber nichts beitragen. Die Vorlage ist in jedem
 * Lauf gleich, braucht keinen Schlüssel, keine Verbindung und keine
 * nachträgliche Faktenprüfung. Die OpenAI-Anbindung bleibt für andere
 * Social-Media-Funktionen bestehen; für diesen Beitrag wird sie nicht
 * aufgerufen.
 *
 * FEHLENDE WERTE: Fehlt Kilometerstand, Baujahr oder Leistung, entfällt die
 * ganze Zeile. Kein "unbekannt", kein Platzhalter, keine Schätzung – ein
 * Beitrag mit drei Zeilen ist richtig, einer mit "[XXX PS]" nicht.
 *
 * Alles hier ist rein: keine Datenbank, kein Server-Import. So lässt es sich
 * ohne Umgebung testen.
 */

export const AUTOTAL_GREETING = "Herzlich willkommen bei Autotal! 🚗";

export const AUTOTAL_SERVICE_LINES = [
  "• Fahrzeugankauf & -verkauf",
  "• Inzahlungnahme möglich",
  "• Österreichweite Zustellung gegen Aufpreis",
] as const;

export const AUTOTAL_CLOSING = "Weitere Details zum Fahrzeug:\nwww.autotal.at";

/** Kennung im Entwurf, an der sich Vorlage und KI-Text unterscheiden lassen. */
export const CAPTION_TEMPLATE_ID = "AutoTal-Vorlage";

/** Die vier Angaben, die der Beitrag braucht – mehr liest er nicht. */
export type CaptionVehicleFacts = {
  make: string;
  model: string;
  variant?: string | null;
  /** null oder 0 = keine Angabe; die Zeile entfällt dann. */
  mileageKm: number | null;
  /** Das Baujahr ist das Jahr der Erstzulassung. */
  firstRegistration: Date | null;
  /** Gespeichert wird kW; der Beitrag nennt PS. */
  powerKw: number | null;
};

/**
 * Fahrzeugname aus Marke, Modell und Variante.
 *
 * Leere Bestandteile fallen weg, doppelter Leerraum wird zu einem – auch
 * wenn er aus einem Import mit "Panamera  4S" stammt.
 */
export function buildVehicleName(vehicle: {
  make: string;
  model: string;
  variant?: string | null;
}): string {
  return buildVehicleTitle(vehicle).replace(/\s+/g, " ").trim();
}

/** Jahr der Erstzulassung, in UTC gelesen – wie beim Speichern gesetzt. */
export function buildYear(firstRegistration: Date | null): number | null {
  if (!firstRegistration || Number.isNaN(firstRegistration.getTime())) {
    return null;
  }
  return firstRegistration.getUTCFullYear();
}

/**
 * Leistung in PS aus kW – über dieselbe Umrechnung wie im Formular und im
 * Preisblatt (1 kW = 1,35962 PS, auf ganze PS gerundet).
 */
export function buildPowerPs(powerKw: number | null): number | null {
  if (powerKw === null || !Number.isFinite(powerKw) || powerKw <= 0) {
    return null;
  }
  return kwToPs(powerKw);
}

/** Die Fahrzeugzeilen des Beitrags – nur die, für die es einen Wert gibt. */
export function buildVehicleFactLines(vehicle: CaptionVehicleFacts): string[] {
  const lines: string[] = [];

  if (
    vehicle.mileageKm !== null &&
    Number.isFinite(vehicle.mileageKm) &&
    vehicle.mileageKm > 0
  ) {
    lines.push(`Kilometer: ${formatKilometers(vehicle.mileageKm)}`);
  }

  const year = buildYear(vehicle.firstRegistration);
  if (year !== null) lines.push(`Baujahr: ${year}`);

  const ps = buildPowerPs(vehicle.powerKw);
  if (ps !== null) lines.push(`Leistung: ${ps} PS`);

  return lines;
}

/** Der vollständige Beitragstext ohne Hashtags. */
export function buildInstagramCaption(vehicle: CaptionVehicleFacts): string {
  return [
    AUTOTAL_GREETING,
    "",
    buildVehicleName(vehicle),
    ...buildVehicleFactLines(vehicle),
    "",
    ...AUTOTAL_SERVICE_LINES,
    "",
    AUTOTAL_CLOSING,
  ].join("\n");
}

/**
 * Hashtags: die drei festen von AutoTal plus Marke und Modell.
 *
 * Nur aus Werten, die das Fahrzeug tatsächlich trägt – nichts wird geraten.
 * Sonderzeichen fallen weg, weil Instagram sie im Tag nicht zulässt:
 * "Mercedes-Benz" wird zu "MercedesBenz".
 */
export function buildInstagramHashtags(vehicle: {
  make: string;
  model: string;
}): string[] {
  const tag = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");
  const make = tag(vehicle.make);
  const model = tag(vehicle.model);

  const tags = ["AutoTal", "AutoTalWien", "GebrauchtwagenWien"];
  if (make) tags.push(make);
  if (make && model) tags.push(`${make}${model}`);

  return tags.filter((value, index, all) => all.indexOf(value) === index);
}
