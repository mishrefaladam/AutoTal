-- ---------------------------------------------------------------------------
-- Bestandsimport aus CSV (additiv)
-- ---------------------------------------------------------------------------
--
-- Alle Spalten sind nullable bzw. haben eine Voreinstellung. Bestehende
-- Fahrzeuge bleiben unverändert gültig; von Hand angelegte Datensätze lassen
-- die Felder dauerhaft leer.
--
-- Es wird nichts gelöscht und nichts umbenannt.

-- AlterTable
ALTER TABLE "Vehicle"
  ADD COLUMN "stockNumber"          TEXT,
  ADD COLUMN "vin"                  TEXT,
  ADD COLUMN "importedAt"           TIMESTAMP(3),
  ADD COLUMN "lastSeenInImportAt"   TIMESTAMP(3),
  ADD COLUMN "missingSinceImportAt" TIMESTAMP(3),
  ADD COLUMN "importSource"         TEXT,
  ADD COLUMN "importWarnings"       TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Eindeutigkeit der beiden Zuordnungsmerkmale.
--
-- Postgres lässt in einem UNIQUE-Index beliebig viele NULL-Werte zu. Fahrzeuge
-- ohne FIN bzw. ohne GW-Nr – also alle bisherigen – bleiben deshalb
-- unberührt. Der Index verhindert nur, dass zwei Datensätze dieselbe Nummer
-- tragen und ein Import sie nicht mehr auseinanderhalten könnte.
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");
CREATE UNIQUE INDEX "Vehicle_stockNumber_key" ON "Vehicle"("stockNumber");

-- Für die Liste "Nicht im letzten Import gefunden".
CREATE INDEX "Vehicle_missingSinceImportAt_idx" ON "Vehicle"("missingSinceImportAt");

-- ---------------------------------------------------------------------------
-- Kraftstoff und Getriebe werden optional
-- ---------------------------------------------------------------------------
--
-- Der CSV-Export des Händlersystems führt beide Angaben nicht. Ein Vorbelegen
-- wäre keine Kleinigkeit, sondern eine Falschangabe: Die Caption-Erzeugung
-- übernimmt jede gesetzte Angabe als Tatsache in den Prompt, und "Getriebe:
-- Schaltgetriebe" stünde dann in einem Instagram-Beitrag über ein
-- Automatikfahrzeug.
--
-- NULL bedeutet ab hier "keine Angabe". Bestehende Zeilen behalten ihren Wert;
-- es wird nichts überschrieben und nichts gelöscht.

ALTER TABLE "Vehicle" ALTER COLUMN "fuel" DROP NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "transmission" DROP NOT NULL;
