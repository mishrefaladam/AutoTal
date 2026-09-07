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

/**
 * Allgemeine Beschriftung eines Bearbeitungsstands.
 *
 * Gilt, wenn das Anliegen unbekannt oder unspezifisch ist – etwa in
 * Filterlisten, die über alle Leads gehen. Für einen konkreten Lead ist
 * `crmStatusLabel(status, type)` zu verwenden: „Gewonnen“ sagt einem
 * Fahrzeughändler nichts, „Angekauft“ dagegen sehr wohl.
 */
export const CRM_LEAD_STATUS_LABELS: Record<CrmLeadStatus, string> = {
  NEW: "Neu",
  CONTACTED: "Kontaktiert",
  APPOINTMENT: "Termin vereinbart",
  IN_PROGRESS: "In Bearbeitung",
  WON: "Abgeschlossen",
  LOST: "Nicht zustande gekommen",
};

/**
 * Beschriftungen, die vom Anliegen abhängen.
 *
 * Derselbe technische Zustand heißt je nach Geschäftsvorfall anders. Ein
 * abgeschlossener Ankauf ist „Angekauft“, ein abgeschlossener Verkauf
 * „Verkauft“ – beides ist intern WON. Nur die Abweichungen stehen hier; alles
 * Übrige kommt aus CRM_LEAD_STATUS_LABELS.
 *
 * Der Zustand IN_PROGRESS trägt bei Ankauf und Verkauf die Bedeutung, die
 * die Ankaufsanfrage früher als eigenen Wert OFFER_MADE führte. Dadurch geht
 * beim Zusammenlegen der beiden Statusfelder nichts verloren.
 */
const STATUS_LABELS_BY_TYPE: Partial<
  Record<CrmLeadType, Partial<Record<CrmLeadStatus, string>>>
> = {
  SELL: {
    IN_PROGRESS: "Angebot gemacht",
    WON: "Angekauft",
    LOST: "Nicht angekauft",
  },
  BUY: {
    IN_PROGRESS: "Angebot gemacht",
    WON: "Verkauft",
    LOST: "Nicht verkauft",
  },
  FINANCING: {
    WON: "Finanzierung zustande gekommen",
    LOST: "Nicht zustande gekommen",
  },
  TEST_DRIVE: {
    WON: "Probefahrt stattgefunden",
    LOST: "Nicht zustande gekommen",
  },
};

/** Beschriftung eines Bearbeitungsstands im Licht des jeweiligen Anliegens. */
export function crmStatusLabel(
  status: CrmLeadStatus,
  type: CrmLeadType,
): string {
  return STATUS_LABELS_BY_TYPE[type]?.[status] ?? CRM_LEAD_STATUS_LABELS[status];
}

/**
 * Erklärt den Zustand in einem Halbsatz – für die Auswahl im Admin.
 *
 * Der Anlass: „Gewonnen“ und „Verloren“ waren nicht verständlich. Eine
 * Beschriftung allein reicht nicht, wenn unklar bleibt, wann man sie setzt.
 */
export function crmStatusHint(
  status: CrmLeadStatus,
  type: CrmLeadType,
): string {
  switch (status) {
    case "NEW":
      return "Eingegangen, noch niemand hat sich darum gekümmert.";
    case "CONTACTED":
      return "Sie haben sich beim Kunden gemeldet.";
    case "APPOINTMENT":
      return "Ein Termin steht fest.";
    case "IN_PROGRESS":
      return type === "SELL" || type === "BUY"
        ? "Ein Angebot liegt beim Kunden, die Entscheidung steht aus."
        : "Wird gerade bearbeitet.";
    case "WON":
      return type === "SELL"
        ? "Das Fahrzeug wurde angekauft. Der Vorgang ist erledigt."
        : type === "BUY"
          ? "Das Fahrzeug wurde verkauft. Der Vorgang ist erledigt."
          : "Das Anliegen wurde erfolgreich erledigt.";
    case "LOST":
      return type === "SELL"
        ? "Kein Ankauf – abgelehnt oder der Kunde hat sich anders entschieden."
        : "Kam nicht zustande. Der Vorgang ist erledigt.";
  }
}

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
 * Nur diese beiden zählen in die Abschlussquote: Ein Lead, der noch in
 * Bearbeitung ist, ist weder erledigt noch gescheitert – ihn mitzuzählen
 * würde die Quote künstlich drücken.
 */
export const CRM_LEAD_CLOSED_STATUSES: CrmLeadStatus[] = ["WON", "LOST"];

/** Zustände, die aktive Arbeit bedeuten – für die Übersichtszahlen. */
export const CRM_LEAD_ACTIVE_STATUSES: CrmLeadStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "IN_PROGRESS",
];
