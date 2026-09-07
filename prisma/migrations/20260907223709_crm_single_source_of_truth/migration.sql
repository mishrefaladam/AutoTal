-- AlterTable
ALTER TABLE "CrmLead" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CrmLead_archivedAt_createdAt_idx" ON "CrmLead"("archivedAt", "createdAt");

-- ---------------------------------------------------------------------------
-- Datenzusammenführung: eine Ankaufsanfrage = ein Lead
-- ---------------------------------------------------------------------------
--
-- Bisher trugen Anfrage und Lead je ein eigenes Statusfeld. Wer im Ankauf auf
-- "Angekauft" stellte, sah im CRM weiterhin "Neu" – derselbe Vorgang, zwei
-- Wahrheiten. Ab hier ist der Lead die führende Zeile.
--
-- Es wird NICHTS gelöscht: Die Spalten der Anfrage bleiben unverändert stehen,
-- ihre Werte werden lediglich zusätzlich auf den Lead übertragen.

-- 1. Anfragen ohne Lead nachtragen.
--    Betrifft Anfragen aus der Zeit vor Einführung des CRM. Ohne diesen
--    Schritt wären sie im CRM unsichtbar und ihr Status nirgends führbar.
INSERT INTO "CrmLead" (
  "id", "name", "phone", "email", "type", "source", "status",
  "message", "internalNotes", "purchaseInquiryId", "createdAt", "updatedAt"
)
SELECT
  'mig_' || replace(gen_random_uuid()::text, '-', ''),
  i."customerName",
  i."customerPhone",
  i."customerEmail",
  'SELL'::"CrmLeadType",
  'WEBSITE'::"CrmLeadSource",
  -- Der bisher im Ankauf gepflegte Stand wird übernommen.
  (CASE i."status"
     WHEN 'NEW'         THEN 'NEW'
     WHEN 'CONTACTED'   THEN 'CONTACTED'
     WHEN 'APPOINTMENT' THEN 'APPOINTMENT'
     -- "Angebot gemacht" heißt im gemeinsamen Feld IN_PROGRESS und wird für
     -- Ankauf-Leads auch wieder so beschriftet.
     WHEN 'OFFER_MADE'  THEN 'IN_PROGRESS'
     WHEN 'PURCHASED'   THEN 'WON'
     WHEN 'REJECTED'    THEN 'LOST'
   END)::"CrmLeadStatus",
  i."message",
  i."internalNotes",
  i."id",
  i."createdAt",
  NOW()
FROM "VehiclePurchaseInquiry" i
WHERE NOT EXISTS (
  SELECT 1 FROM "CrmLead" l WHERE l."purchaseInquiryId" = i."id"
);

-- 2. Bei bereits verknüpften Paaren gewinnt der Stand aus dem Ankauf.
--    Begründung: Das ist die Ansicht, in der bisher tatsächlich gearbeitet
--    wurde. Der Lead-Status stand dort unverändert auf seinem Anfangswert.
UPDATE "CrmLead" l
SET
  "status" = (CASE i."status"
     WHEN 'NEW'         THEN 'NEW'
     WHEN 'CONTACTED'   THEN 'CONTACTED'
     WHEN 'APPOINTMENT' THEN 'APPOINTMENT'
     WHEN 'OFFER_MADE'  THEN 'IN_PROGRESS'
     WHEN 'PURCHASED'   THEN 'WON'
     WHEN 'REJECTED'    THEN 'LOST'
   END)::"CrmLeadStatus",
  -- Notizen nur übernehmen, wenn am Lead noch keine steht: Vorhandenes
  -- darf nicht überschrieben werden.
  "internalNotes" = CASE
    WHEN btrim(l."internalNotes") = '' THEN i."internalNotes"
    ELSE l."internalNotes"
  END,
  "updatedAt" = NOW()
FROM "VehiclePurchaseInquiry" i
WHERE l."purchaseInquiryId" = i."id"
  -- Nur anfassen, wo der Ankauf tatsächlich weiter ist als der Lead.
  AND i."status" <> 'NEW';
