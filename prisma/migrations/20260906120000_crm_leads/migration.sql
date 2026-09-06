-- CRM: Leads aus Website-Anfragen und manuell erfassten Kontakten.
--
-- Rein additiv: neue Enums, eine neue Tabelle, keine Änderung an
-- bestehenden Tabellen. Vorhandene Ankaufanfragen bleiben unberührt und
-- behalten ihre Daten; die Verknüpfung ist optional (purchaseInquiryId
-- darf NULL sein), sodass Altbestand ohne Lead weiter funktioniert.

CREATE TYPE "CrmLeadType" AS ENUM ('BUY', 'SELL', 'FINANCING', 'TEST_DRIVE', 'GENERAL');

CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'APPOINTMENT', 'IN_PROGRESS', 'WON', 'LOST');

CREATE TYPE "CrmLeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'INSTAGRAM', 'WILLHABEN', 'AUTOSCOUT', 'GEBRAUCHTWAGEN', 'MANUAL');

CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "type" "CrmLeadType" NOT NULL,
    "source" "CrmLeadSource" NOT NULL DEFAULT 'WEBSITE',
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "lastContactAt" TIMESTAMP(3),
    "purchaseInquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmLead_purchaseInquiryId_key" ON "CrmLead"("purchaseInquiryId");

CREATE INDEX "CrmLead_status_createdAt_idx" ON "CrmLead"("status", "createdAt");

CREATE INDEX "CrmLead_type_createdAt_idx" ON "CrmLead"("type", "createdAt");

CREATE INDEX "CrmLead_source_createdAt_idx" ON "CrmLead"("source", "createdAt");

CREATE INDEX "CrmLead_createdAt_idx" ON "CrmLead"("createdAt");

-- SetNull statt Cascade: Wird eine Ankaufanfrage gelöscht, bleibt der Lead
-- als Vertriebskontakt bestehen – nur die Verknüpfung entfällt.
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_purchaseInquiryId_fkey"
    FOREIGN KEY ("purchaseInquiryId") REFERENCES "VehiclePurchaseInquiry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
