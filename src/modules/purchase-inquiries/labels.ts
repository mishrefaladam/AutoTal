import type { PurchaseInquiryStatus } from "@/generated/prisma/enums";

/**
 * Beschriftungen für den Bearbeitungsstand einer Ankaufanfrage.
 *
 * Wie bei den Fahrzeug-Enums bewusst als vollständiger Record typisiert:
 * Kommt im Schema ein Status dazu, schlägt der Typecheck hier fehl, statt
 * dass im Admin ein roher Wert wie "OFFER_MADE" steht.
 */
export const PURCHASE_INQUIRY_STATUS_LABELS: Record<
  PurchaseInquiryStatus,
  string
> = {
  NEW: "Neu",
  CONTACTED: "Kontaktiert",
  APPOINTMENT: "Termin vereinbart",
  OFFER_MADE: "Angebot gemacht",
  PURCHASED: "Angekauft",
  REJECTED: "Abgelehnt",
};

/**
 * Reihenfolge im Bearbeitungsablauf – bestimmt die Sortierung der Auswahl
 * im Admin. REJECTED steht am Ende, weil es kein Fortschritt ist.
 */
export const PURCHASE_INQUIRY_STATUS_ORDER: PurchaseInquiryStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "OFFER_MADE",
  "PURCHASED",
  "REJECTED",
];

/** Anfragen in diesen Zuständen sind abgeschlossen. */
export const PURCHASE_INQUIRY_CLOSED_STATUSES: PurchaseInquiryStatus[] = [
  "PURCHASED",
  "REJECTED",
];
