import type {
  CrmLeadStatus,
  PurchaseInquiryStatus,
} from "@/generated/prisma/enums";

/**
 * Übersetzung zwischen dem früheren Status der Ankaufsanfrage und dem
 * gemeinsamen Bearbeitungsstand am Lead.
 *
 * VORGESCHICHTE: Anfrage und Lead trugen je ein eigenes Statusfeld. Wer im
 * Ankauf auf „Angekauft“ stellte, sah im CRM weiterhin „Neu“ – derselbe
 * Vorgang, zwei Wahrheiten. Seit der Vereinheitlichung führt der Lead den
 * Stand; die Spalte an der Anfrage wird nicht mehr gelesen und nicht mehr
 * geschrieben.
 *
 * Diese Zuordnung wird trotzdem gebraucht:
 *
 *   1. Die Migration hat die Altwerte damit übertragen (wortgleich in SQL).
 *   2. Anfragen aus einer Zeit ohne Lead lassen sich damit noch anzeigen.
 *   3. Ein Test hält fest, dass die Abbildung in beide Richtungen verlustfrei
 *      ist – sonst wäre beim Zusammenlegen etwas verschwunden.
 *
 * „Angebot gemacht“ (OFFER_MADE) hat im gemeinsamen Feld keinen eigenen Wert,
 * sondern liegt auf IN_PROGRESS. Für Ankauf- und Verkaufs-Leads wird es dort
 * auch wieder als „Angebot gemacht“ beschriftet – siehe ./labels.ts.
 */

export const PURCHASE_TO_CRM_STATUS: Record<
  PurchaseInquiryStatus,
  CrmLeadStatus
> = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  APPOINTMENT: "APPOINTMENT",
  OFFER_MADE: "IN_PROGRESS",
  PURCHASED: "WON",
  REJECTED: "LOST",
};

/**
 * Rückrichtung – nur noch für Altbestände und den Verlustfreiheits-Test.
 *
 * IN_PROGRESS wird bewusst auf OFFER_MADE zurückgeführt: Bei einer
 * Ankaufsanfrage bedeutet „in Bearbeitung“ genau das.
 */
export const CRM_TO_PURCHASE_STATUS: Record<
  CrmLeadStatus,
  PurchaseInquiryStatus
> = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  APPOINTMENT: "APPOINTMENT",
  IN_PROGRESS: "OFFER_MADE",
  WON: "PURCHASED",
  LOST: "REJECTED",
};
