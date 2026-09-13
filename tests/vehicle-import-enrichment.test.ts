import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildInstagramCaption } from "@/modules/social/caption";
import {
  defaultDecision,
  diffCardAgainstTarget,
  planEnrichment,
  resolveEnrichmentDecisions,
  type EnrichmentTarget,
} from "@/modules/vehicles/import-enrichment";
import type { VehicleListCard } from "@/modules/vehicles/vehicle-list-pdf";

/**
 * CSV + PDF zusammenführen: Zuordnung und Feldregeln.
 *
 * Die PDF ergänzt, was der CSV fehlt – Leistung, Hubraum, Antrieb, Foto.
 * Sie legt nichts an, löscht nichts und überschreibt nichts still.
 */

function card(overrides: Partial<VehicleListCard> = {}): VehicleListCard {
  return {
    key: "1-1",
    page: 1,
    index: 1,
    make: "BMW",
    model: "X5 Reihe",
    variant: "X5 xDrive 30d",
    variantTruncated: false,
    priceCents: 1_799_000,
    firstRegistration: new Date(Date.UTC(2016, 11, 1)),
    year: 2016,
    mileageKm: 294_330,
    powerKw: 190,
    displacementCcm: 2993,
    color: "Grau",
    drivetrain: "ALL_WHEEL",
    vin: null,
    stockNumber: null,
    image: { objectNumber: 10, widthPx: 640, heightPx: 640 },
    warnings: [],
    ...overrides,
  };
}

/** Ein Fahrzeug, wie die CSV es angelegt hat: Jahr statt Monat, keine Technik. */
function target(overrides: Partial<EnrichmentTarget> = {}): EnrichmentTarget {
  return {
    ref: { kind: "existing", id: "bmw-1" },
    title: "BMW X5 Reihe",
    make: "BMW",
    model: "X5 Reihe",
    variant: null,
    firstRegistration: new Date(Date.UTC(2016, 0, 1)),
    mileageKm: 294_330,
    priceCents: 1_799_000,
    powerKw: null,
    displacementCcm: null,
    color: "Grau",
    drivetrain: null,
    vin: null,
    stockNumber: null,
    imageCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 5, 6, 7: Zuordnung
// ---------------------------------------------------------------------------

describe("Zuordnung", () => {
  it("ordnet über die FIN zu, wenn beide Seiten eine haben", () => {
    const plan = planEnrichment(
      [card({ vin: "WBAJA71090B123456", mileageKm: 1 })],
      [target({ vin: "WBAJA71090B123456" }), target({ ref: { kind: "existing", id: "other" } })],
    );
    assert.equal(plan.entries[0].match.kind, "safe");
    assert.equal((plan.entries[0].match as { by: string }).by, "vin");
  });

  it("ordnet über die GW-Nr zu", () => {
    const plan = planEnrichment(
      [card({ stockNumber: "GW-77", mileageKm: 1 })],
      [target({ stockNumber: "GW-77" }), target({ ref: { kind: "existing", id: "other" } })],
    );
    assert.equal((plan.entries[0].match as { by: string }).by, "stockNumber");
  });

  it("ordnet sicher über Marke, Modell, Baujahr und Kilometer zu", () => {
    const plan = planEnrichment(
      [card()],
      [
        target(),
        // Gleiches Modell, anderes Fahrzeug – anderer Kilometerstand.
        target({ ref: { kind: "existing", id: "bmw-2" }, mileageKm: 129_127 }),
      ],
    );

    assert.equal(plan.counts.safe, 1);
    const match = plan.entries[0].match;
    assert.equal(match.kind, "safe");
    assert.equal((match as { by: string }).by, "fingerprint");
    assert.deepEqual((match as { target: EnrichmentTarget }).target.ref, {
      kind: "existing",
      id: "bmw-1",
    });
  });

  it("gilt auch für Fahrzeuge, die die CSV erst anlegt", () => {
    const plan = planEnrichment([card()], [target({ ref: { kind: "create", line: 7 } })]);
    assert.equal(plan.entries[0].match.kind, "safe");
  });

  it("verlangt bei mehreren Treffern eine Entscheidung", () => {
    // Zwei identische Fahrzeuge im Bestand – die zwei Seat Ibiza.
    const plan = planEnrichment(
      [card()],
      [target(), target({ ref: { kind: "existing", id: "bmw-dup" } })],
    );

    assert.equal(plan.counts.ambiguous, 1);
    const match = plan.entries[0].match;
    assert.equal(match.kind, "ambiguous");
    assert.equal((match as { candidates: unknown[] }).candidates.length, 2);
    assert.deepEqual(plan.entries[0].changes, [], "vorab nichts berechnet");
  });

  it("verlangt eine Entscheidung, wenn zwei Karten auf dasselbe Fahrzeug zeigen", () => {
    const plan = planEnrichment([card(), card({ key: "1-2" })], [target()]);
    assert.equal(plan.counts.safe, 0);
    assert.equal(plan.counts.ambiguous, 2);
  });

  it("führt nicht nur über Marke und Modell zusammen", () => {
    // Gleiche Baureihe, anderes Jahr, andere Kilometer, anderer Preis.
    const plan = planEnrichment(
      [card()],
      [target({ firstRegistration: new Date(Date.UTC(2018, 0, 1)), mileageKm: 129_127, priceCents: 3_215_000 })],
    );

    assert.equal(plan.counts.safe, 0);
    assert.equal(plan.entries[0].match.kind, "unmatched");
    assert.deepEqual((plan.entries[0].match as { candidates: unknown[] }).candidates, []);
  });

  it("bietet lose Kandidaten an, übernimmt sie aber nicht von selbst", () => {
    // Gleiche Baureihe, gleiches Jahr, aber Kilometer weichen ab.
    const plan = planEnrichment([card()], [target({ mileageKm: 290_000 })]);

    const match = plan.entries[0].match;
    assert.equal(match.kind, "unmatched");
    assert.equal((match as { candidates: unknown[] }).candidates.length, 1);

    // Ohne Entscheidung passiert nichts.
    const resolved = resolveEnrichmentDecisions(plan, []);
    assert.deepEqual(resolved, []);
  });

  it("übernimmt einen losen Kandidaten nach ausdrücklicher Zuordnung", () => {
    const plan = planEnrichment([card()], [target({ mileageKm: 290_000 })]);
    const resolved = resolveEnrichmentDecisions(plan, [
      {
        cardKey: "1-1",
        target: { kind: "existing", id: "bmw-1" },
        acceptedFields: ["powerKw"],
        useImage: false,
      },
    ]);

    assert.equal(resolved.length, 1);
    assert.deepEqual(resolved[0].accepted.map((c) => c.field), ["powerKw"]);
  });

  it("lässt keine Zuordnung zu einem Fahrzeug außerhalb der Kandidaten zu", () => {
    const plan = planEnrichment([card()], [target()]);
    const resolved = resolveEnrichmentDecisions(plan, [
      {
        cardKey: "1-1",
        target: { kind: "existing", id: "irgendwas-anderes" },
        acceptedFields: ["powerKw"],
        useImage: true,
      },
    ]);
    assert.deepEqual(resolved, []);
  });
});

// ---------------------------------------------------------------------------
// 2, 3, 4: Feldregeln
// ---------------------------------------------------------------------------

describe("Feldregeln", () => {
  it("ergänzt fehlende Werte und wählt sie voraus", () => {
    const changes = diffCardAgainstTarget(card(), target());
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));

    assert.equal(byField.powerKw.kind, "fill");
    assert.equal(byField.powerKw.proposed, 190);
    assert.equal(byField.powerKw.preselected, true);
    assert.equal(byField.displacementCcm.kind, "fill");
    assert.equal(byField.drivetrain.kind, "fill");
    assert.equal(byField.variant.kind, "fill");
  });

  it("meldet gleiche Werte als unverändert", () => {
    const changes = diffCardAgainstTarget(card(), target());
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));

    assert.equal(byField.priceCents.kind, "same");
    assert.equal(byField.mileageKm.kind, "same");
    assert.equal(byField.color.kind, "same");
  });

  it("macht aus dem 1. Jänner der CSV den Monat der PDF – ohne Konflikt", () => {
    const changes = diffCardAgainstTarget(card(), target());
    const registration = changes.find((c) => c.field === "firstRegistration");
    assert.equal(registration?.kind, "fill");
    assert.equal((registration?.proposed as Date).toISOString(), "2016-12-01T00:00:00.000Z");
  });

  it("zeigt verschiedene Werte als Konflikt und wählt sie nicht voraus", () => {
    const changes = diffCardAgainstTarget(card(), target({ powerKw: 150 }));
    const power = changes.find((c) => c.field === "powerKw");

    assert.equal(power?.kind, "conflict");
    assert.equal(power?.current, 150);
    assert.equal(power?.proposed, 190);
    assert.equal(power?.preselected, false);
  });

  it("löscht vorhandene Werte nie durch leere PDF-Werte", () => {
    const changes = diffCardAgainstTarget(
      card({ powerKw: null, displacementCcm: null, drivetrain: null, color: null, variant: null }),
      target({ powerKw: 190, displacementCcm: 2993, drivetrain: "ALL_WHEEL" }),
    );
    for (const field of ["powerKw", "displacementCcm", "drivetrain", "color", "variant"]) {
      assert.ok(!changes.some((c) => c.field === field), `${field} taucht auf`);
    }
  });

  it("schlägt eine gekürzte Bezeichnung nur vor, statt sie vorauszuwählen", () => {
    const changes = diffCardAgainstTarget(card({ variantTruncated: true }), target());
    const variant = changes.find((c) => c.field === "variant");
    assert.equal(variant?.kind, "suggest");
    assert.equal(variant?.preselected, false);
  });

  it("erkennt eine gekürzte Bezeichnung als gleich, wenn der Bestand sie fortsetzt", () => {
    const changes = diffCardAgainstTarget(
      card({ variant: "X5 xDrive 30d *Pano*", variantTruncated: true }),
      target({ variant: "X5 xDrive 30d *Pano*Memory*HeadUp*" }),
    );
    assert.equal(changes.find((c) => c.field === "variant")?.kind, "same");
  });
});

// ---------------------------------------------------------------------------
// Entscheidungen
// ---------------------------------------------------------------------------

describe("Entscheidungen", () => {
  it("nimmt bei sicheren Treffern die Vorauswahl", () => {
    const plan = planEnrichment([card()], [target()]);
    const decision = defaultDecision(plan.entries[0]);

    assert.deepEqual(decision.target, { kind: "existing", id: "bmw-1" });
    assert.deepEqual(decision.acceptedFields.sort(), [
      "displacementCcm",
      "drivetrain",
      "firstRegistration",
      "powerKw",
      "variant",
    ]);
    assert.equal(decision.useImage, true);
  });

  it("schreibt nur akzeptierte Felder, nie gleiche", () => {
    const plan = planEnrichment([card()], [target({ powerKw: 150 })]);
    const resolved = resolveEnrichmentDecisions(plan, [
      {
        cardKey: "1-1",
        target: { kind: "existing", id: "bmw-1" },
        // Konflikt ausdrücklich zugunsten der PDF entschieden; Preis ist gleich.
        acceptedFields: ["powerKw", "priceCents"],
        useImage: false,
      },
    ]);

    assert.equal(resolved.length, 1);
    assert.deepEqual(resolved[0].accepted.map((c) => c.field), ["powerKw"]);
    assert.equal(resolved[0].accepted[0].proposed, 190);
  });

  it("behält bei einem Konflikt ohne Entscheidung den Bestand", () => {
    const plan = planEnrichment([card()], [target({ powerKw: 150 })]);
    const resolved = resolveEnrichmentDecisions(plan, []);
    assert.ok(!resolved[0]?.accepted.some((c) => c.field === "powerKw"));
  });

  it("wählt das Foto nur voraus, wenn das Fahrzeug noch keines hat", () => {
    const withImages = planEnrichment([card()], [target({ imageCount: 3 })]);
    assert.equal(withImages.entries[0].image?.preselected, false);
    assert.equal(withImages.entries[0].image?.available, true);

    const without = planEnrichment([card()], [target({ imageCount: 0 })]);
    assert.equal(without.entries[0].image?.preselected, true);
  });
});

// ---------------------------------------------------------------------------
// 8, 11, 16, 17: Foto und Weitergabe
// ---------------------------------------------------------------------------

describe("Foto und Weitergabe", () => {
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");

  it("speichert das Foto über den bestehenden Speicher, ohne Bestehendes zu löschen", () => {
    const block = service.slice(service.indexOf("async function applyEnrichment"));
    assert.match(block, /getFileStorage\(\)/);
    assert.match(block, /prefix: `fahrzeuge\/\$\{vehicleId\}`/);
    assert.ok(!/vehicleImage\.delete|deleteMany/.test(block), "kein Löschen");
    // Ohne Bilder: Position 0. Mit Bildern: hinten anfügen.
    assert.match(block, /existingCount === 0/);
    assert.match(block, /position: 0/);
    assert.match(block, /position: existingCount/);
  });

  it("liest das Foto genau der Karte, nicht das größte der Datei", () => {
    const block = service.slice(service.indexOf("async function applyEnrichment"));
    assert.match(block, /photos\.get\(entry\.card\.image\.objectNumber\)/);
    assert.ok(!/rankVehicleImages/.test(block));
  });

  it("schreibt nur tatsächliche Werte und bleibt bei der CSV als Bestand", () => {
    const block = service.slice(service.indexOf("async function applyEnrichment"));
    assert.match(block, /for \(const change of entry\.accepted\)/);
    assert.ok(!/vehicle\.create\(/.test(block), "die PDF legt nichts an");
  });

  it("gibt die Leistung an die Caption weiter, die daraus PS macht", () => {
    // powerKw aus der PDF -> Vehicle.powerKw -> "Leistung: 258 PS".
    const changes = diffCardAgainstTarget(card(), target());
    const power = changes.find((c) => c.field === "powerKw")!;
    const caption = buildInstagramCaption({
      make: "BMW",
      model: "X5 Reihe",
      variant: "X5 xDrive 30d",
      mileageKm: 294_330,
      firstRegistration: new Date(Date.UTC(2016, 11, 1)),
      powerKw: power.proposed as number,
    });

    assert.match(caption, /Leistung: 258 PS/);
    assert.doesNotMatch(caption, /kW/);
  });
});
