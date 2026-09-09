-- ---------------------------------------------------------------------------
-- Vollständige Fahrzeugpflege und Preisblatt-Übernahme (additiv)
-- ---------------------------------------------------------------------------
--
-- Alle Spalten sind nullable oder haben eine Voreinstellung. Es wird nichts
-- gelöscht, nichts umbenannt und kein bestehender Wert überschrieben.
--
-- Bewusst KEINE Standardwerte für die technischen Felder: Weder der
-- CSV-Bestandsimport noch das Preisblatt liefern sie vollständig, und die
-- Caption-Erzeugung übernimmt jedes gesetzte Feld als Tatsache in den Prompt.
-- NULL heißt "keine Angabe" und wird dort weggelassen.

-- CreateEnum
CREATE TYPE "DrivetrainType" AS ENUM ('FRONT_WHEEL', 'REAR_WHEEL', 'ALL_WHEEL');

-- AlterTable
ALTER TABLE "Vehicle"
  ADD COLUMN "drivetrain"     "DrivetrainType",
  ADD COLUMN "nationalCode"   TEXT,
  ADD COLUMN "vehicleType"    TEXT,
  ADD COLUMN "grossWeightKg"  INTEGER,
  ADD COLUMN "daysInStock"    INTEGER,
  ADD COLUMN "listPriceCents" INTEGER,
  ADD COLUMN "extras"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "highlights"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "priceSheetImportedAt" TIMESTAMP(3),
  ADD COLUMN "priceSheetSource"     TEXT;
