import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildVehicleSlug, buildVehicleTitle, slugify } from "@/modules/vehicles/slug";

/**
 * Der Slug ist die öffentliche URL eines Fahrzeugs. Er muss über Syncs
 * hinweg stabil bleiben, sonst brechen Links und Suchmaschinenrankings.
 */

describe("slugify", () => {
  it("ersetzt deutsche Umlaute lesbar", () => {
    assert.equal(slugify("Öffnungszeiten für Fahrzeuge"), "oeffnungszeiten-fuer-fahrzeuge");
    assert.equal(slugify("Weiß"), "weiss");
  });

  it("behandelt Sonderzeichen und Mehrfachtrenner", () => {
    assert.equal(slugify("2.0 TDI / 4x4 (DSG)"), "2-0-tdi-4x4-dsg");
  });

  it("lässt keine führenden oder abschließenden Bindestriche stehen", () => {
    assert.equal(slugify("  -- Test -- "), "test");
  });

  it("kommt mit Škoda zurecht", () => {
    assert.equal(slugify("Škoda Octavia"), "skoda-octavia");
  });
});

describe("buildVehicleSlug", () => {
  const base = {
    make: "BMW",
    model: "320d",
    variant: "xDrive Touring M Sport",
    firstRegistration: new Date("2020-06-08"),
    externalId: "MOCK-1002",
  };

  it("baut einen sprechenden Slug mit Jahr und externer ID", () => {
    assert.equal(
      buildVehicleSlug(base),
      "bmw-320d-xdrive-touring-m-sport-2020-mock-1002",
    );
  });

  it("ist für dieselben Eingaben stabil", () => {
    assert.equal(buildVehicleSlug(base), buildVehicleSlug({ ...base }));
  });

  it("unterscheidet zwei baugleiche Fahrzeuge über die externe ID", () => {
    const a = buildVehicleSlug(base);
    const b = buildVehicleSlug({ ...base, externalId: "MOCK-9999" });

    assert.notEqual(a, b);
  });

  it("kommt ohne Erstzulassung aus", () => {
    const slug = buildVehicleSlug({ ...base, firstRegistration: null });

    assert.ok(slug.includes("bmw-320d"));
    assert.ok(slug.endsWith("mock-1002"));
    assert.ok(!slug.includes("2020"));
  });

  it("kürzt überlange Varianten, behält aber die eindeutige ID", () => {
    const slug = buildVehicleSlug({
      ...base,
      variant: "Sehr lange Variantenbezeichnung ".repeat(12),
    });

    assert.ok(slug.length <= 120, `Slug ist ${slug.length} Zeichen lang`);
    assert.ok(slug.endsWith("mock-1002"), `Slug endet auf: ${slug.slice(-20)}`);
  });
});

describe("buildVehicleTitle", () => {
  it("setzt Marke, Modell und Variante zusammen", () => {
    assert.equal(
      buildVehicleTitle({ make: "Audi", model: "A4 Avant", variant: "40 TDI" }),
      "Audi A4 Avant 40 TDI",
    );
  });

  it("lässt eine fehlende Variante weg", () => {
    assert.equal(
      buildVehicleTitle({ make: "Tesla", model: "Model 3", variant: null }),
      "Tesla Model 3",
    );
  });
});
