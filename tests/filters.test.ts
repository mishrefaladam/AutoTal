import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SORT,
  buildVehiclesHref,
  countActiveFilters,
  filtersToSearchParams,
  parseVehicleFilters,
} from "@/modules/vehicles/filters";
import { EMPTY_FILTERS } from "@/modules/vehicles/filters";

/**
 * Die Filter kommen aus der URL und damit aus einer Quelle, die jeder
 * verändern kann. Geprüft wird deshalb vor allem, dass Unsinn nicht
 * durchschlägt, sondern still verworfen wird.
 */

describe("parseVehicleFilters", () => {
  it("liefert bei leerer Query die Standardwerte", () => {
    const filters = parseVehicleFilters({});

    assert.equal(filters.make, null);
    assert.equal(filters.model, null);
    assert.equal(filters.minPriceCents, null);
    assert.deepEqual(filters.fuel, []);
    assert.equal(filters.sort, DEFAULT_SORT);
    assert.equal(filters.page, 1);
  });

  it("rechnet Preise aus Euro in Cent um", () => {
    const filters = parseVehicleFilters({ preis_min: "15000", preis_max: "30000" });

    assert.equal(filters.minPriceCents, 1_500_000);
    assert.equal(filters.maxPriceCents, 3_000_000);
  });

  it("liest kommagetrennte Mehrfachwerte", () => {
    const filters = parseVehicleFilters({ kraftstoff: "DIESEL,ELECTRIC" });

    assert.deepEqual(filters.fuel.sort(), ["DIESEL", "ELECTRIC"]);
  });

  it("akzeptiert auch wiederholte Parameter", () => {
    const filters = parseVehicleFilters({ getriebe: ["MANUAL", "AUTOMATIC"] });

    assert.equal(filters.transmission.length, 2);
  });

  it("verwirft unbekannte Enum-Werte, statt zu scheitern", () => {
    const filters = parseVehicleFilters({ kraftstoff: "DIESEL,QUATSCH,'; DROP TABLE" });

    assert.deepEqual(filters.fuel, ["DIESEL"]);
  });

  it("entfernt Duplikate", () => {
    const filters = parseVehicleFilters({ kraftstoff: "DIESEL,DIESEL,DIESEL" });

    assert.deepEqual(filters.fuel, ["DIESEL"]);
  });

  it("tauscht vertauschte Grenzen, statt null Treffer zu liefern", () => {
    // Tippfehler im Formular: min > max
    const filters = parseVehicleFilters({ preis_min: "30000", preis_max: "10000" });

    assert.equal(filters.minPriceCents, 1_000_000);
    assert.equal(filters.maxPriceCents, 3_000_000);
  });

  it("ignoriert nicht-numerische Zahlenangaben", () => {
    const filters = parseVehicleFilters({ preis_min: "abc", km_max: "" });

    assert.equal(filters.minPriceCents, null);
    assert.equal(filters.maxMileageKm, null);
  });

  it("fällt bei unbekannter Sortierung auf den Standard zurück", () => {
    const filters = parseVehicleFilters({ sortierung: "irgendwas" });

    assert.equal(filters.sort, DEFAULT_SORT);
  });

  it("erzwingt eine Seitenzahl von mindestens 1", () => {
    assert.equal(parseVehicleFilters({ seite: "0" }).page, 1);
    assert.equal(parseVehicleFilters({ seite: "-5" }).page, 1);
    assert.equal(parseVehicleFilters({ seite: "3" }).page, 3);
  });

  it("begrenzt Jahresangaben auf einen plausiblen Bereich", () => {
    const filters = parseVehicleFilters({ ez_min: "1800", ez_max: "3000" });
    const currentYear = new Date().getFullYear();

    assert.equal(filters.minFirstRegistrationYear, 1900);
    assert.equal(filters.maxFirstRegistrationYear, currentYear + 1);
  });
});

describe("filtersToSearchParams", () => {
  it("ist die Umkehrung von parseVehicleFilters", () => {
    const original = parseVehicleFilters({
      marke: "BMW",
      modell: "320d",
      preis_min: "15000",
      preis_max: "40000",
      km_max: "100000",
      ez_min: "2019",
      kraftstoff: "DIESEL",
      getriebe: "AUTOMATIC",
      sortierung: "price-asc",
      seite: "2",
    });

    const roundtrip = parseVehicleFilters(
      Object.fromEntries(filtersToSearchParams(original)),
    );

    assert.deepEqual(roundtrip, original);
  });

  it("lässt Standardwerte aus der URL weg", () => {
    const params = filtersToSearchParams(EMPTY_FILTERS);

    assert.equal(params.toString(), "");
  });

  it("baut eine saubere URL", () => {
    assert.equal(buildVehiclesHref(EMPTY_FILTERS), "/fahrzeuge");
    assert.equal(
      buildVehiclesHref({ ...EMPTY_FILTERS, make: "Audi" }),
      "/fahrzeuge?marke=Audi",
    );
  });
});

describe("countActiveFilters", () => {
  it("zählt eine Preisspanne als einen Filter", () => {
    const filters = {
      ...EMPTY_FILTERS,
      minPriceCents: 1_000_000,
      maxPriceCents: 2_000_000,
    };

    assert.equal(countActiveFilters(filters), 1);
  });

  it("zählt Sortierung und Seite nicht mit", () => {
    const filters = { ...EMPTY_FILTERS, sort: "price-asc" as const, page: 4 };

    assert.equal(countActiveFilters(filters), 0);
  });
});
