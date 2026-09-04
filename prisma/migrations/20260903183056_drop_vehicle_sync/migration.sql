-- Fahrzeugsynchronisierung entfällt.
--
-- Der öffentliche Fahrzeugbestand kommt seit der Umstellung aus der
-- eingebetteten willhaben-Fahrzeugbörse (Widget Lite). Es gibt keinen
-- VehicleProvider, keinen Sync und damit auch kein Sync-Protokoll mehr.
--
-- Die Tabelle "Vehicle" bleibt erhalten: Sie ist weiterhin die Datenbasis
-- der Social-Media-Funktion (im Admin gepflegte Fahrzeuge).

DROP TABLE IF EXISTS "SyncRun";
DROP TYPE IF EXISTS "SyncStatus";
