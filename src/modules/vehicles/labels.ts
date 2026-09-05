import type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
  VehicleStatus,
} from "./types";

/**
 * Deutschsprachige Beschriftungen der Fahrzeug-Enums.
 *
 * Bewusst als vollständige Records typisiert: Kommt im Prisma-Schema ein
 * neuer Enum-Wert dazu, schlägt der Typecheck hier fehl, statt dass in der
 * UI ein roher Wert wie "PLUGIN_HYBRID" auftaucht.
 */

/**
 * Verfügbarkeit im eigenen Bestand.
 *
 * Nicht zu verwechseln mit `active`: Das steuert nur, ob ein Fahrzeug im
 * Admin ausgeblendet ist. Der Status beschreibt, ob es noch zu haben ist.
 */
export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  IN_STOCK: "Im Bestand",
  RESERVED: "Reserviert",
  SOLD: "Verkauft",
};

/** Auswahlreihenfolge im Admin. */
export const VEHICLE_STATUS_ORDER: VehicleStatus[] = [
  "IN_STOCK",
  "RESERVED",
  "SOLD",
];

export const FUEL_LABELS: Record<FuelType, string> = {
  PETROL: "Benzin",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  PLUGIN_HYBRID: "Plug-in-Hybrid",
  ELECTRIC: "Elektro",
  LPG: "Autogas (LPG)",
  CNG: "Erdgas (CNG)",
  HYDROGEN: "Wasserstoff",
  OTHER: "Sonstige",
};

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  MANUAL: "Schaltgetriebe",
  AUTOMATIC: "Automatik",
  SEMI_AUTOMATIC: "Halbautomatik",
};

/**
 * Kurzform für enge Stellen wie die Fahrzeugkarte, wo "Schaltgetriebe" neben
 * dem Icon nicht in die Spalte passt und abgeschnitten würde.
 */
export const TRANSMISSION_LABELS_SHORT: Record<TransmissionType, string> = {
  MANUAL: "Schaltung",
  AUTOMATIC: "Automatik",
  SEMI_AUTOMATIC: "Halbautom.",
};

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  SMALL_CAR: "Kleinwagen",
  SEDAN: "Limousine",
  ESTATE: "Kombi",
  SUV: "SUV / Geländewagen",
  COUPE: "Coupé",
  CONVERTIBLE: "Cabrio / Roadster",
  VAN: "Van / Kleinbus",
  TRANSPORTER: "Transporter",
  PICKUP: "Pick-up",
  OTHER: "Sonstige",
};

export const CONDITION_LABELS: Record<VehicleCondition, string> = {
  NEW: "Neuwagen",
  USED: "Gebrauchtwagen",
  DEMO: "Vorführwagen",
  ANNUAL_CAR: "Jahreswagen",
};

/** Reihenfolge in Filtern und Auswahllisten – häufigstes zuerst. */
export const FUEL_ORDER: FuelType[] = [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUGIN_HYBRID",
  "ELECTRIC",
  "LPG",
  "CNG",
  "HYDROGEN",
  "OTHER",
];

export const TRANSMISSION_ORDER: TransmissionType[] = [
  "MANUAL",
  "AUTOMATIC",
  "SEMI_AUTOMATIC",
];

export const BODY_TYPE_ORDER: BodyType[] = [
  "SMALL_CAR",
  "SEDAN",
  "ESTATE",
  "SUV",
  "COUPE",
  "CONVERTIBLE",
  "VAN",
  "TRANSPORTER",
  "PICKUP",
  "OTHER",
];

const WEEKDAY_LABELS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

/** weekday: 1 = Montag … 7 = Sonntag (ISO-8601) */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday - 1] ?? "";
}

export function weekdayLabelShort(weekday: number): string {
  return weekdayLabel(weekday).slice(0, 2);
}

const monthYearFormatter = new Intl.DateTimeFormat("de-AT", {
  month: "2-digit",
  year: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Erstzulassung wird händlerüblich als "MM/JJJJ" angegeben. */
export function formatRegistration(date: Date | null): string {
  return date ? monthYearFormatter.format(date) : "–";
}

export function formatDate(date: Date | null): string {
  return date ? dateFormatter.format(date) : "–";
}

export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormatter.format(date) : "–";
}
