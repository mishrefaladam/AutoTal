import type {
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadType,
} from "@/generated/prisma/enums";

/**
 * Beschriftungen des CRM.
 *
 * Wie bei den übrigen Enums bewusst als vollständiger Record typisiert: Kommt
 * im Schema ein Wert dazu, schlägt der Typecheck hier fehl, statt dass im
 * Admin ein roher Wert wie "IN_PROGRESS" steht.
 */

export const CRM_LEAD_TYPE_LABELS: Record<CrmLeadType, string> = {
  BUY: "Fahrzeug kaufen",
  SELL: "Fahrzeug verkaufen",
  FINANCING: "Finanzierung",
  TEST_DRIVE: "Probefahrt",
  GENERAL: "Allgemeine Anfrage",
};

export const CRM_LEAD_STATUS_LABELS: Record<CrmLeadStatus, string> = {
  NEW: "Neu",
  CONTACTED: "Kontaktiert",
  APPOINTMENT: "Termin",
  IN_PROGRESS: "In Bearbeitung",
  WON: "Gewonnen",
  LOST: "Verloren",
};

export const CRM_LEAD_SOURCE_LABELS: Record<CrmLeadSource, string> = {
  WEBSITE: "Website",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  WILLHABEN: "willhaben",
  AUTOSCOUT: "AutoScout24",
  GEBRAUCHTWAGEN: "gebrauchtwagen.at",
  MANUAL: "Manuell erfasst",
};

/** Reihenfolge im Vertriebsablauf – bestimmt die Sortierung der Auswahl. */
export const CRM_LEAD_STATUS_ORDER: CrmLeadStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "IN_PROGRESS",
  "WON",
  "LOST",
];

export const CRM_LEAD_TYPE_ORDER: CrmLeadType[] = [
  "BUY",
  "SELL",
  "FINANCING",
  "TEST_DRIVE",
  "GENERAL",
];

export const CRM_LEAD_SOURCE_ORDER: CrmLeadSource[] = [
  "WEBSITE",
  "WHATSAPP",
  "INSTAGRAM",
  "WILLHABEN",
  "AUTOSCOUT",
  "GEBRAUCHTWAGEN",
  "MANUAL",
];

/**
 * Abgeschlossene Zustände.
 *
 * Nur diese beiden zählen in die Conversion Rate: Ein Lead, der noch in
 * Bearbeitung ist, ist weder gewonnen noch verloren – ihn mitzuzählen würde
 * die Quote künstlich drücken.
 */
export const CRM_LEAD_CLOSED_STATUSES: CrmLeadStatus[] = ["WON", "LOST"];

/** Zustände, die aktive Arbeit bedeuten – für die Übersichtszahlen. */
export const CRM_LEAD_ACTIVE_STATUSES: CrmLeadStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "IN_PROGRESS",
];
