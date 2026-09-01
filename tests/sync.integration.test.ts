import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type {
  ProviderListResult,
  ProviderVehicle,
  VehicleProvider,
} from "@/integrations/vehicles/types";
import { VehicleProviderError } from "@/integrations/vehicles/types";

/**
 * Integrationstest der Fahrzeugsynchronisierung (US-06, US-07).
 *
 * Läuft gegen eine echte PostgreSQL-Datenbank, weil genau das Zusammenspiel
 * aus Upsert, Transaktion und `updateMany` geprüft werden soll – mit einem
 * nachgebauten Prisma wäre der Test wertlos.
 *
 * Vorbereitung (einmalig):
 *   createdb autotal_test
 *   DATABASE_URL="postgresql://…/autotal_test" npx prisma migrate deploy
 *
 * Übersprungen, wenn TEST_DATABASE_URL nicht gesetzt ist – so bricht `npm test`
 * auf einem Rechner ohne Testdatenbank nicht ab.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Muss VOR dem Import von prisma/sync gesetzt sein: Der Client liest
// DATABASE_URL beim Erzeugen.
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb("syncVehicles", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { syncVehicles } = await import("@/modules/vehicles/sync");

  /** Provider, dessen Antwort der Test frei bestimmt. */
  class StubProvider implements VehicleProvider {
    readonly source = "teststub";
    readonly label = "Teststub";

    constructor(
      private vehicles: ProviderVehicle[],
      private options: { complete?: boolean; configured?: boolean; throws?: boolean } = {},
    ) {}

    isConfigured() {
      return this.options.configured ?? true;
    }

    async listVehicles(): Promise<ProviderListResult> {
      if (this.options.throws) {
        throw new VehicleProviderError(this.source, "Anbieter nicht erreichbar.");
      }
      return {
        vehicles: this.vehicles,
        nextCursor: null,
        isCompleteInventory: this.options.complete ?? true,
      };
    }

    async getVehicleById(externalId: string) {
      return this.vehicles.find((v) => v.externalId === externalId) ?? null;
    }
  }

  function vehicle(
    externalId: string,
    overrides: Partial<ProviderVehicle> = {},
  ): ProviderVehicle {
    return {
      externalId,
      status: "available",
      make: "Volkswagen",
      model: "Golf",
      variant: "2.0 TDI",
      priceCents: 2_290_000,
      mileageKm: 78_500,
      firstRegistration: new Date("2021-03-15"),
      fuel: "DIESEL",
      transmission: "MANUAL",
      description: "Testfahrzeug",
      features: ["Klimaanlage"],
      images: [{ url: `https://example.test/${externalId}.jpg`, position: 0 }],
      ...overrides,
    };
  }

  async function reset() {
    await prisma.vehicle.deleteMany({ where: { externalSource: "teststub" } });
    await prisma.syncRun.deleteMany({ where: { source: "teststub" } });
  }

  before(reset);
  beforeEach(reset);
  after(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("legt neue Fahrzeuge an", async () => {
    const result = await syncVehicles({
      provider: new StubProvider([vehicle("A-1"), vehicle("A-2")]),
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.vehiclesFound, 2);
    assert.equal(result.vehiclesCreated, 2);
    assert.equal(result.vehiclesUpdated, 0);

    const count = await prisma.vehicle.count({
      where: { externalSource: "teststub", active: true },
    });
    assert.equal(count, 2);
  });

  it("ist idempotent – ein zweiter Lauf legt nichts doppelt an", async () => {
    const provider = new StubProvider([vehicle("B-1"), vehicle("B-2")]);

    await syncVehicles({ provider });
    const second = await syncVehicles({ provider });

    assert.equal(second.vehiclesCreated, 0);
    assert.equal(second.vehiclesUpdated, 2);

    assert.equal(
      await prisma.vehicle.count({ where: { externalSource: "teststub" } }),
      2,
    );
  });

  it("übernimmt geänderte Preise und behält den Slug", async () => {
    await syncVehicles({ provider: new StubProvider([vehicle("C-1")]) });

    const before = await prisma.vehicle.findFirstOrThrow({
      where: { externalId: "C-1" },
    });

    await syncVehicles({
      provider: new StubProvider([
        vehicle("C-1", { priceCents: 1_990_000, mileageKm: 82_000 }),
      ]),
    });

    const after = await prisma.vehicle.findFirstOrThrow({
      where: { externalId: "C-1" },
    });

    assert.equal(after.priceCents, 1_990_000);
    assert.equal(after.mileageKm, 82_000);
    // Der Slug ist die öffentliche URL und darf sich nicht ändern.
    assert.equal(after.slug, before.slug);
    assert.equal(after.id, before.id);
  });

  it("deaktiviert verkaufte Fahrzeuge, statt sie zu löschen (US-07)", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("D-1"), vehicle("D-2")]),
    });

    const result = await syncVehicles({
      provider: new StubProvider([
        vehicle("D-1"),
        vehicle("D-2", { status: "sold" }),
      ]),
    });

    assert.equal(result.vehiclesDeactivated, 0, "sold kommt über den Status, nicht über das Fehlen");

    const sold = await prisma.vehicle.findFirstOrThrow({
      where: { externalId: "D-2" },
    });

    assert.equal(sold.active, false, "verkauftes Fahrzeug muss inaktiv sein");
    // Nicht gelöscht: bestehende Links und Social-Beiträge bleiben gültig.
    assert.ok(sold.id);
  });

  it("deaktiviert Fahrzeuge, die der Anbieter nicht mehr meldet", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("E-1"), vehicle("E-2"), vehicle("E-3")]),
    });

    const result = await syncVehicles({
      provider: new StubProvider([vehicle("E-1")]),
    });

    assert.equal(result.vehiclesDeactivated, 2);

    const active = await prisma.vehicle.count({
      where: { externalSource: "teststub", active: true },
    });
    assert.equal(active, 1);

    // Die Datensätze existieren weiterhin.
    assert.equal(
      await prisma.vehicle.count({ where: { externalSource: "teststub" } }),
      3,
    );
  });

  it("deaktiviert NICHTS, wenn der Bestand unvollständig ist", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("F-1"), vehicle("F-2"), vehicle("F-3")]),
    });

    // Abgebrochene Pagination: Der Anbieter meldet keinen vollständigen Bestand.
    // Würde hier deaktiviert, wäre der halbe Bestand von der Website weg.
    const result = await syncVehicles({
      provider: new StubProvider([vehicle("F-1")], { complete: false }),
    });

    assert.equal(result.vehiclesDeactivated, 0);

    const active = await prisma.vehicle.count({
      where: { externalSource: "teststub", active: true },
    });
    assert.equal(active, 3, "unvollständiger Bestand darf nichts abräumen");
  });

  it("reaktiviert ein Fahrzeug, das wieder verfügbar ist", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("G-1", { status: "sold" })]),
    });

    assert.equal(
      (await prisma.vehicle.findFirstOrThrow({ where: { externalId: "G-1" } })).active,
      false,
    );

    await syncVehicles({ provider: new StubProvider([vehicle("G-1")]) });

    assert.equal(
      (await prisma.vehicle.findFirstOrThrow({ where: { externalId: "G-1" } })).active,
      true,
    );
  });

  it("ersetzt die Bilder eines Fahrzeugs beim Sync", async () => {
    await syncVehicles({
      provider: new StubProvider([
        vehicle("H-1", {
          images: [
            { url: "https://example.test/alt-1.jpg", position: 0 },
            { url: "https://example.test/alt-2.jpg", position: 1 },
          ],
        }),
      ]),
    });

    await syncVehicles({
      provider: new StubProvider([
        vehicle("H-1", {
          images: [{ url: "https://example.test/neu-1.jpg", position: 0 }],
        }),
      ]),
    });

    const images = await prisma.vehicleImage.findMany({
      where: { vehicle: { externalId: "H-1" } },
    });

    assert.equal(images.length, 1);
    assert.equal(images[0].url, "https://example.test/neu-1.jpg");
  });

  it("protokolliert jeden Lauf (US-27)", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("I-1")]),
      triggeredBy: "test",
    });

    const run = await prisma.syncRun.findFirstOrThrow({
      where: { source: "teststub" },
      orderBy: { startedAt: "desc" },
    });

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.vehiclesFound, 1);
    assert.equal(run.triggeredBy, "test");
    assert.ok(run.finishedAt, "finishedAt muss gesetzt sein");
    assert.equal(run.errorMessage, null);
  });

  it("meldet einen nicht eingerichteten Anbieter als FAILED", async () => {
    const result = await syncVehicles({
      provider: new StubProvider([], { configured: false }),
    });

    assert.equal(result.status, "FAILED");
    assert.match(result.errorMessage ?? "", /nicht eingerichtet/);
    assert.equal(result.vehiclesFound, 0);
  });

  it("überlebt einen Ausfall des Anbieters ohne Datenverlust", async () => {
    await syncVehicles({
      provider: new StubProvider([vehicle("J-1"), vehicle("J-2")]),
    });

    const result = await syncVehicles({
      provider: new StubProvider([], { throws: true }),
    });

    assert.equal(result.status, "FAILED");
    assert.ok(result.errorMessage);

    // Der bestehende Bestand bleibt vollständig online.
    const active = await prisma.vehicle.count({
      where: { externalSource: "teststub", active: true },
    });
    assert.equal(active, 2);
  });
});
