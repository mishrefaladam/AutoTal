import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MOCK_VEHICLES, MockVehicleProvider } from "@/integrations/vehicles/mock";

/**
 * Der Mock-Provider ist die Grundlage jeder Entwicklung ohne Anbieterzugang
 * (US-26). Zusätzlich bildet er die Pagination echter Anbieter nach – genau
 * dort entscheidet sich, ob der Sync Fahrzeuge deaktivieren darf (US-07).
 */

describe("MockVehicleProvider", () => {
  const provider = new MockVehicleProvider();

  it("ist ohne Konfiguration einsatzbereit", () => {
    assert.equal(provider.isConfigured(), true);
    assert.equal(provider.source, "mock");
  });

  it("liefert mindestens zehn Testfahrzeuge", async () => {
    const result = await provider.listVehicles();

    assert.ok(
      result.vehicles.length >= 10,
      `nur ${result.vehicles.length} Fahrzeuge`,
    );
  });

  it("meldet ohne Limit den vollständigen Bestand", async () => {
    const result = await provider.listVehicles();

    assert.equal(result.isCompleteInventory, true);
    assert.equal(result.nextCursor, null);
  });

  it("enthält ein verkauftes Fahrzeug zum Test von US-07", () => {
    const sold = MOCK_VEHICLES.filter((v) => v.status !== "available");

    assert.ok(sold.length >= 1, "kein verkauftes Fahrzeug im Datensatz");
  });

  it("vergibt eindeutige externe IDs", () => {
    const ids = new Set(MOCK_VEHICLES.map((v) => v.externalId));

    assert.equal(ids.size, MOCK_VEHICLES.length);
  });

  it("liefert für jedes Fahrzeug die Pflichtangaben der Fahrzeugkarte", () => {
    for (const vehicle of MOCK_VEHICLES) {
      assert.ok(vehicle.make, `${vehicle.externalId}: Marke fehlt`);
      assert.ok(vehicle.model, `${vehicle.externalId}: Modell fehlt`);
      assert.ok(vehicle.priceCents > 0, `${vehicle.externalId}: Preis fehlt`);
      assert.ok(vehicle.mileageKm >= 0, `${vehicle.externalId}: km fehlt`);
      assert.ok(vehicle.firstRegistration, `${vehicle.externalId}: EZ fehlt`);
      assert.ok(vehicle.fuel, `${vehicle.externalId}: Kraftstoff fehlt`);
      assert.ok(vehicle.transmission, `${vehicle.externalId}: Getriebe fehlt`);
      assert.ok(
        (vehicle.images?.length ?? 0) > 0,
        `${vehicle.externalId}: kein Bild`,
      );
    }
  });

  it("paginiert und meldet erst auf der letzten Seite Vollständigkeit", async () => {
    const collected: string[] = [];
    let cursor: string | null | undefined = null;
    let lastComplete = false;
    let pages = 0;

    do {
      const page = await provider.listVehicles({ limit: 5, cursor });
      collected.push(...page.vehicles.map((v) => v.externalId));
      cursor = page.nextCursor;
      lastComplete = page.isCompleteInventory;
      pages += 1;

      // Zwischenseiten dürfen NICHT als vollständig gelten – sonst würde der
      // Sync die noch nicht geladenen Fahrzeuge deaktivieren.
      if (cursor) {
        assert.equal(
          page.isCompleteInventory,
          false,
          "Zwischenseite meldet fälschlich einen vollständigen Bestand",
        );
      }
    } while (cursor && pages < 20);

    assert.equal(lastComplete, true);
    assert.equal(collected.length, MOCK_VEHICLES.length);
    assert.equal(new Set(collected).size, MOCK_VEHICLES.length);
  });

  it("findet ein Fahrzeug über seine externe ID", async () => {
    const vehicle = await provider.getVehicleById("MOCK-1002");

    assert.ok(vehicle);
    assert.equal(vehicle.make, "BMW");
  });

  it("liefert null für eine unbekannte ID", async () => {
    assert.equal(await provider.getVehicleById("GIBT-ES-NICHT"), null);
  });
});
