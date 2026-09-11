import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseVehicleCsv } from "@/modules/vehicles/csv-import";
import {
  buildImportFingerprint,
  planVehicleImport,
  type ExistingVehicle,
} from "@/modules/vehicles/import-plan";

/**
 * Ersatzkennung für Bestandsexporte ohne FIN und ohne GW-Nr.
 *
 * Der echte willhabenPro-Export lässt die GW-Nr-Spalte in jeder Zeile leer und
 * führt nur bei rund einem Drittel der Fahrzeuge eine FIN. Ohne ein drittes
 * Merkmal blieben zwei von drei Fahrzeugen bei jedem Import liegen.
 *
 * Die Kennung ist ausdrücklich die schwächste der drei: Sie greift nur, wenn
 * beide starken Merkmale fehlen, und lässt im Zweifel lieber eine Zeile liegen,
 * als ein Fahrzeug falsch zuzuordnen.
 */

const HEADER =
  "GW-Nr;FIN;Marke;Modell;Farbe;KM-Stand;Baujahr;Verkaufspreis;Angebotspreis;online auf;Standzeit (Tage)";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

const VIN = "WVWZZZ1KZAW123456";

function existing(overrides: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: "veh-1",
    title: "Seat Ibiza",
    stockNumber: null,
    vin: null,
    make: "Seat",
    model: "Ibiza",
    color: "Rot",
    priceCents: 1_299_900,
    listPriceCents: null,
    mileageKm: 68_470,
    firstRegistration: new Date(Date.UTC(2020, 0, 1)),
    daysInStock: 45,
    importFingerprint: "seat|ibiza|2020|68470",
    importedAt: new Date("2026-09-02T10:00:00Z"),
    missingSinceImportAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Die Kennung selbst
// ---------------------------------------------------------------------------

describe("Ersatzkennung", () => {
  it("baut sie aus Marke, Modell, Baujahr und Kilometerstand", () => {
    assert.equal(
      buildImportFingerprint({
        make: "Seat",
        model: "Ibiza",
        year: 2020,
        mileageKm: 68_470,
      }),
      "seat|ibiza|2020|68470",
    );
  });

  it("übergeht Schreibweise und Leerzeichen", () => {
    const a = buildImportFingerprint({
      make: "  MERCEDES-BENZ ",
      model: "C-Klasse",
      year: 2018,
      mileageKm: 100,
    });
    const b = buildImportFingerprint({
      make: "mercedes-benz",
      model: " c-klasse",
      year: 2018,
      mileageKm: 100,
    });

    assert.equal(a, b);
  });

  it("bildet ohne Baujahr oder Kilometerstand keine Kennung", () => {
    // Zwei VW Golf wären damit nicht mehr auseinanderzuhalten.
    assert.equal(
      buildImportFingerprint({ make: "VW", model: "Golf", year: null, mileageKm: 1 }),
      null,
    );
    assert.equal(
      buildImportFingerprint({ make: "VW", model: "Golf", year: 2019, mileageKm: null }),
      null,
    );
    assert.equal(
      buildImportFingerprint({ make: "", model: "Golf", year: 2019, mileageKm: 1 }),
      null,
    );
  });

  it("enthält den Preis nicht", () => {
    // Der Preis änderte sich in echten Exporten bei 3 von 17 Fahrzeugen. Wäre
    // er Teil der Kennung, würde jede Preissenkung ein zweites Fahrzeug anlegen.
    const before = buildImportFingerprint({
      make: "BMW",
      model: "X3 Reihe",
      year: 2015,
      mileageKm: 245_858,
    });

    const plan = planVehicleImport({
      rows: parseVehicleCsv(csv(`;;BMW;X3 Reihe;Schwarz;245.858;2015;15.990;;;`)).rows,
      existing: [
        existing({
          id: "bmw",
          title: "BMW X3 Reihe",
          make: "BMW",
          model: "X3 Reihe",
          mileageKm: 245_858,
          firstRegistration: new Date(Date.UTC(2015, 0, 1)),
          priceCents: 1_649_000,
          importFingerprint: before,
        }),
      ],
    });

    assert.equal(plan.creates.length, 0, "Preissenkung darf kein Fahrzeug anlegen");
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].values.priceCents, 1_599_000);
  });
});

// ---------------------------------------------------------------------------
// Zuordnung
// ---------------------------------------------------------------------------

describe("Zuordnung über die Ersatzkennung", () => {
  const ROW = `;;Seat;Ibiza;Rot;68.470;2020;12.999;;;45`;

  it("erkennt ein zuvor so angelegtes Fahrzeug wieder", () => {
    const plan = planVehicleImport({
      rows: parseVehicleCsv(csv(ROW)).rows,
      existing: [existing()],
    });

    assert.equal(plan.creates.length, 0, "kein zweites Fahrzeug");
    assert.equal([...plan.updates, ...plan.unchanged].length, 1);
    assert.equal([...plan.updates, ...plan.unchanged][0].matchedBy, "fingerprint");
  });

  it("legt beim ersten Lauf an und erkennt beim zweiten wieder", () => {
    const rows = parseVehicleCsv(csv(ROW)).rows;

    const first = planVehicleImport({ rows, existing: [] });
    assert.equal(first.creates.length, 1);

    // Was der erste Lauf gespeichert hätte, trägt der zweite als Bestand.
    const stored = existing({ importFingerprint: first.creates[0].fingerprint });
    const second = planVehicleImport({ rows, existing: [stored] });

    assert.equal(second.creates.length, 0, "beim zweiten Lauf keine Dublette");
    assert.equal(second.unchanged.length, 1);
  });

  it("lässt FIN und GW-Nr Vorrang", () => {
    // Die Kennung ist das schwächste Merkmal und darf den starken nie
    // vorgreifen.
    const plan = planVehicleImport({
      rows: parseVehicleCsv(csv(`;${VIN};Seat;Ibiza;Rot;68.470;2020;12.999;;;45`)).rows,
      existing: [
        existing({ id: "ueber-fin", vin: VIN, importFingerprint: null }),
        existing({ id: "ueber-kennung" }),
      ],
    });

    const entry = [...plan.updates, ...plan.unchanged][0];

    assert.equal(entry.matchedBy, "vin");
    assert.equal(entry.id, "ueber-fin");
  });

  it("führt die Kennung mit, wenn sich der Kilometerstand ändert", () => {
    // Sonst erkennt der übernächste Import dasselbe Fahrzeug nicht wieder.
    const plan = planVehicleImport({
      rows: parseVehicleCsv(csv(`;;Seat;Ibiza;Rot;71.000;2020;12.999;;;60`)).rows,
      existing: [existing()],
    });

    // Der alte Stand trägt noch die alte Kennung, deshalb wird angelegt …
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].fingerprint, "seat|ibiza|2020|71000");
  });
});

// ---------------------------------------------------------------------------
// Mehrdeutigkeit
// ---------------------------------------------------------------------------

describe("Mehrdeutige Fahrzeuge", () => {
  it("überspringt zwei in allen Merkmalen gleiche Zeilen", () => {
    // Genau der Fall aus dem echten Export: zwei Seat Ibiza, in jeder Spalte
    // identisch, beide ohne FIN und ohne GW-Nr.
    const parsed = parseVehicleCsv(
      csv(
        `;;Seat;Ibiza;Rot;68.470;2020;12.999;;;45`,
        `;;Seat;Ibiza;Rot;68.470;2020;12.999;;;45`,
      ),
    );

    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 0, "keine von beiden raten");
    assert.equal(plan.skipped.length, 2);
    assert.match(plan.skipped[0].reason, /identisch mit einer anderen/);
    assert.match(plan.skipped[0].reason, /GW-Nr vergeben/);
  });

  it("ordnet nicht zu, wenn schon zwei Fahrzeuge dieselbe Kennung tragen", () => {
    const plan = planVehicleImport({
      rows: parseVehicleCsv(csv(`;;Seat;Ibiza;Rot;68.470;2020;12.999;;;45`)).rows,
      existing: [existing({ id: "a" }), existing({ id: "b" })],
    });

    // Unauflösbar im Bestand: lieber ein neues Fahrzeug, das der Händler sieht,
    // als eines von zweien willkürlich zu überschreiben.
    assert.equal(plan.updates.length + plan.unchanged.length, 0);
    assert.equal(plan.creates.length, 1);
  });

  it("stört zwei unterschiedliche Fahrzeuge derselben Baureihe nicht", () => {
    const parsed = parseVehicleCsv(
      csv(
        `;;VW;Golf;Blau;145.000;2019;12.500;;;10`,
        `;;VW;Golf;Rot;98.000;2019;14.900;;;10`,
      ),
    );

    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 2);
    assert.notEqual(plan.creates[0].fingerprint, plan.creates[1].fingerprint);
  });
});
