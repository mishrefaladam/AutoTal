import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseVehicleCsv } from "@/modules/vehicles/csv-import";
import {
  planVehicleImport,
  type ExistingVehicle,
} from "@/modules/vehicles/import-plan";

/**
 * Nur inserierte Fahrzeuge importieren.
 *
 * Der Bestandsexport enthält auch Fahrzeuge, die nirgends online stehen –
 * verkauft, noch nicht freigegeben, aus dem Angebot genommen. Bei ihnen ist
 * die Spalte "online auf" leer. Ein Import, der sie mitnimmt, füllt die
 * Fahrzeugliste und den Beitragsassistenten mit Fahrzeugen, die es für Kunden
 * gar nicht gibt. Im echten Export waren das 20 von 50.
 */

const HEADER =
  "GW-Nr;FIN;Marke;Modell;Farbe;KM-Stand;Baujahr;Verkaufspreis;Angebotspreis;online auf;Standzeit (Tage)";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

const AKTIV = `;;BMW;X3 Reihe;Schwarz;245.858;2015;16.490;0;"willhaben, AutoScout24, Widget (Free)";42`;
const INAKTIV = `;;VW;Golf;Blau;145.000;2019;12.500;0;;10`;

function existing(overrides: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: "veh-1",
    title: "VW Golf",
    stockNumber: null,
    vin: null,
    make: "VW",
    model: "Golf",
    color: "Blau",
    priceCents: 1_250_000,
    listPriceCents: null,
    mileageKm: 145_000,
    firstRegistration: new Date(Date.UTC(2019, 0, 1)),
    daysInStock: 10,
    importFingerprint: "vw|golf|2019|145000",
    importedAt: new Date("2026-09-02T10:00:00Z"),
    missingSinceImportAt: null,
    ...overrides,
  };
}

describe("Fahrzeuge ohne Inserat", () => {
  it("lässt Zeilen mit leerer Spalte „online auf“ aus", () => {
    const parsed = parseVehicleCsv(csv(AKTIV, INAKTIV));

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].make, "BMW");
    assert.equal(parsed.inactiveRows, 1);
    assert.equal(parsed.totalDataRows, 2, "gezählt werden weiterhin alle");
  });

  it("nimmt jede Zeile, wenn die Datei die Spalte gar nicht führt", () => {
    // Ohne die Spalte gibt es keine Grundlage für die Unterscheidung.
    const parsed = parseVehicleCsv(
      `GW-Nr;Marke;Modell;Preis\nA-1;BMW;X3;16.490\nA-2;VW;Golf;12.500`,
    );

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.inactiveRows, 0);
  });

  it("erkennt auch ein einzelnes Portal als Inserat", () => {
    const parsed = parseVehicleCsv(
      csv(`;;Fiat;500;Rot;60.000;2018;9.999;0;"AutoScout24, Widget (Free)";5`),
    );

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.inactiveRows, 0);
  });

  it("markiert ein bereits importiertes Fahrzeug als fehlend, wenn es offline geht", () => {
    // Es steht noch in der Datei, aber ohne Inserat – für den Import ist es
    // damit nicht mehr da. Derselbe Weg wie bei einem verkauften Fahrzeug.
    const parsed = parseVehicleCsv(csv(AKTIV, INAKTIV));
    const plan = planVehicleImport({ rows: parsed.rows, existing: [existing()] });

    assert.equal(plan.missing.length, 1);
    assert.equal(plan.missing[0].title, "VW Golf");
    assert.equal(plan.creates.length, 1, "das aktive wird angelegt");
  });

  it("legt ein inaktives Fahrzeug nicht neu an", () => {
    const parsed = parseVehicleCsv(csv(INAKTIV));
    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 0);
    assert.equal(parsed.inactiveRows, 1);
  });

  it("gibt die Anzahl in Vorschau und Ergebnis weiter", () => {
    const route = readFileSync(
      "src/app/api/admin/vehicles/import/route.ts",
      "utf8",
    );
    const ui = readFileSync("src/components/admin/vehicle-import.tsx", "utf8");

    assert.match(route, /inactive: parsed\.inactiveRows/);
    assert.match(route, /inactive: outcome\.inactive/);
    assert.match(ui, /ohne Inserat/);
  });
});

describe("Fehlende Importfahrzeuge löschen", () => {
  const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");
  const block = actions.slice(
    actions.indexOf("export async function deleteMissingImportedVehicles"),
    actions.indexOf("export async function deleteVehicleImage"),
  );

  it("löscht nur, was der Import als fehlend markiert hat", () => {
    assert.match(block, /importedAt: \{ not: null \}/);
    assert.match(block, /missingSinceImportAt: \{ not: null \}/);
  });

  it("lässt bearbeitete Fahrzeuge stehen und benennt sie", () => {
    // Bilder, Beschreibung oder Beiträge heißen: Hier hat jemand gearbeitet.
    assert.match(block, /_count\.images === 0/);
    assert.match(block, /_count\.socialDrafts === 0/);
    assert.match(block, /description\.trim\(\) === ""/);
    assert.match(block, /kept/);
  });

  it("verlangt einen angemeldeten Admin", () => {
    assert.match(block, /requireAdminForAction\(\)/);
  });

  it("verlangt in der Oberfläche eine Tippbestätigung", () => {
    const ui = readFileSync(
      "src/components/admin/missing-vehicles-cleanup.tsx",
      "utf8",
    );

    assert.match(ui, /CONFIRM_WORD = "LÖSCHEN"/);
    assert.match(ui, /disabled=\{!canDelete \|\| pending\}/);
  });

  it("zählt auf der Import-Seite nach derselben Regel", () => {
    const repository = readFileSync(
      "src/modules/vehicles/admin-repository.ts",
      "utf8",
    );
    const count = repository.slice(
      repository.indexOf("export async function countMissingImportedVehicles"),
    );

    assert.match(count, /missingSinceImportAt: \{ not: null \}/);
    assert.match(count, /_count\.images === 0/);
    assert.match(count, /description\.trim\(\) === ""/);
  });
});
