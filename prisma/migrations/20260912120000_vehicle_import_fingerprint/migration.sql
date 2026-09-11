-- ---------------------------------------------------------------------------
-- Ersatzkennung für Bestandsexporte ohne FIN und ohne GW-Nr (additiv)
-- ---------------------------------------------------------------------------
--
-- Eine nullable Spalte, sonst nichts. Bestehende Fahrzeuge lassen sie leer und
-- werden weiterhin über FIN bzw. GW-Nr zugeordnet.
--
-- Bewusst OHNE Unique-Index: Zwei Fahrzeuge dürfen dieselbe Ersatzkennung
-- tragen, wenn der Export sie nicht unterscheidet. Der Import lässt solche
-- Zeilen dann mit Begründung liegen, statt eine davon zu raten – eine
-- Datenbankbedingung würde stattdessen den ganzen Import scheitern lassen.

ALTER TABLE "Vehicle" ADD COLUMN "importFingerprint" TEXT;
