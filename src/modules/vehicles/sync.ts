import "server-only";

import type { SyncStatus } from "@/generated/prisma/enums";
import { getVehicleProvider } from "@/integrations/vehicles";
import type {
  ProviderVehicle,
  VehicleProvider,
} from "@/integrations/vehicles/types";
import { VehicleProviderError } from "@/integrations/vehicles/types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { buildVehicleSlug } from "./slug";

/**
 * Fahrzeugsynchronisierung: Provider -> Datenbank (US-06, US-07).
 *
 * Ablauf:
 *   1. Bestand des Providers seitenweise laden.
 *   2. Verfügbare Fahrzeuge anlegen bzw. aktualisieren (idempotent über
 *      externalSource + externalId).
 *   3. Fahrzeuge, die der Provider nicht mehr als verfügbar meldet,
 *      deaktivieren – nicht löschen. Damit bleiben bestehende Links und
 *      Social-Media-Beiträge intakt.
 *   4. Den Lauf in `SyncRun` protokollieren (US-27).
 *
 * Deaktiviert wird ausschließlich, wenn der Provider einen vollständigen
 * Bestand gemeldet hat. Ein abgebrochener Seitenabruf darf niemals den halben
 * Bestand von der Website nehmen.
 */

export type SyncResult = {
  syncRunId: string;
  status: SyncStatus;
  source: string;
  vehiclesFound: number;
  vehiclesCreated: number;
  vehiclesUpdated: number;
  vehiclesDeactivated: number;
  errorMessage: string | null;
};

const PAGE_SIZE = 100;
/** Schutz gegen einen Provider, der endlos Cursor zurückgibt. */
const MAX_PAGES = 200;

function isPubliclyVisible(vehicle: ProviderVehicle): boolean {
  return vehicle.status === "available";
}

/** Bildet ein Provider-Fahrzeug auf die Spalten von `Vehicle` ab. */
function toVehicleData(vehicle: ProviderVehicle, source: string) {
  return {
    externalSource: source,
    externalId: vehicle.externalId,
    active: isPubliclyVisible(vehicle),
    lastSyncedAt: new Date(),

    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant ?? null,

    priceCents: vehicle.priceCents,
    vatDeductible: vehicle.vatDeductible ?? false,

    mileageKm: vehicle.mileageKm,
    firstRegistration: vehicle.firstRegistration ?? null,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType ?? "OTHER",
    condition: vehicle.condition ?? "USED",

    powerKw: vehicle.powerKw ?? null,
    displacementCcm: vehicle.displacementCcm ?? null,
    color: vehicle.color ?? null,
    doors: vehicle.doors ?? null,
    seats: vehicle.seats ?? null,
    previousOwners: vehicle.previousOwners ?? null,
    inspectionValidUntil: vehicle.inspectionValidUntil ?? null,

    description: vehicle.description ?? "",
    features: vehicle.features ?? [],
  };
}

/**
 * Legt ein Fahrzeug an oder aktualisiert es.
 * Bilder werden ersetzt, nicht gemergt – der Provider ist die Wahrheit.
 */
async function upsertVehicle(
  vehicle: ProviderVehicle,
  source: string,
): Promise<"created" | "updated"> {
  const data = toVehicleData(vehicle, source);
  const images = (vehicle.images ?? []).map((image, index) => ({
    url: image.url,
    alt: image.alt ?? null,
    position: image.position ?? index,
    width: image.width ?? null,
    height: image.height ?? null,
    externalId: image.externalId ?? null,
  }));

  return prisma.$transaction(async (tx) => {
    const existing = await tx.vehicle.findUnique({
      where: {
        externalSource_externalId: {
          externalSource: source,
          externalId: vehicle.externalId,
        },
      },
      select: { id: true, slug: true },
    });

    if (!existing) {
      await tx.vehicle.create({
        data: {
          ...data,
          slug: buildVehicleSlug(vehicle),
          images: { create: images },
        },
      });
      return "created";
    }

    // Der Slug bleibt bewusst unverändert: Er ist die öffentliche URL des
    // Fahrzeugs und soll nicht brechen, nur weil der Händler die Variante
    // umbenannt hat.
    await tx.vehicle.update({
      where: { id: existing.id },
      data: {
        ...data,
        images: { deleteMany: {}, create: images },
      },
    });

    return "updated";
  });
}

/** Lädt den kompletten Bestand über alle Seiten des Providers. */
async function collectInventory(provider: VehicleProvider): Promise<{
  vehicles: ProviderVehicle[];
  isCompleteInventory: boolean;
}> {
  const vehicles: ProviderVehicle[] = [];
  let cursor: string | null | undefined = null;
  let isCompleteInventory = false;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await provider.listVehicles({
      limit: PAGE_SIZE,
      cursor,
    });

    vehicles.push(...result.vehicles);
    isCompleteInventory = result.isCompleteInventory;
    cursor = result.nextCursor;

    if (!cursor) break;
  }

  if (cursor) {
    logger.warn("Sync abgebrochen: Provider liefert mehr Seiten als erlaubt", {
      source: provider.source,
      maxPages: MAX_PAGES,
    });
    isCompleteInventory = false;
  }

  return { vehicles, isCompleteInventory };
}

export async function syncVehicles(
  options: { triggeredBy?: string; provider?: VehicleProvider } = {},
): Promise<SyncResult> {
  const provider = options.provider ?? getVehicleProvider();
  const triggeredBy = options.triggeredBy ?? "manual";

  const syncRun = await prisma.syncRun.create({
    data: { source: provider.source, status: "RUNNING", triggeredBy },
  });

  const finish = async (
    status: SyncStatus,
    counts: {
      vehiclesFound: number;
      vehiclesCreated: number;
      vehiclesUpdated: number;
      vehiclesDeactivated: number;
    },
    errorMessage: string | null,
  ): Promise<SyncResult> => {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status, finishedAt: new Date(), ...counts, errorMessage },
    });

    return {
      syncRunId: syncRun.id,
      status,
      source: provider.source,
      errorMessage,
      ...counts,
    };
  };

  if (!provider.isConfigured()) {
    const message =
      `Der Anbieter „${provider.label}“ ist nicht eingerichtet. ` +
      `Bitte Zugangsdaten hinterlegen oder VEHICLE_PROVIDER auf "mock" setzen.`;

    logger.warn("Sync übersprungen – Provider nicht konfiguriert", {
      source: provider.source,
    });

    return finish(
      "FAILED",
      {
        vehiclesFound: 0,
        vehiclesCreated: 0,
        vehiclesUpdated: 0,
        vehiclesDeactivated: 0,
      },
      message,
    );
  }

  let vehiclesCreated = 0;
  let vehiclesUpdated = 0;
  let vehiclesDeactivated = 0;
  const failures: string[] = [];

  try {
    const { vehicles, isCompleteInventory } = await collectInventory(provider);

    for (const vehicle of vehicles) {
      try {
        const outcome = await upsertVehicle(vehicle, provider.source);
        if (outcome === "created") vehiclesCreated += 1;
        else vehiclesUpdated += 1;
      } catch (error) {
        // Ein fehlerhaftes Fahrzeug darf den restlichen Bestand nicht
        // blockieren – der Lauf wird als PARTIAL markiert.
        failures.push(vehicle.externalId);
        logger.error("Fahrzeug konnte nicht übernommen werden", {
          source: provider.source,
          externalId: vehicle.externalId,
          error,
        });
      }
    }

    if (isCompleteInventory) {
      const seenIds = vehicles.filter(isPubliclyVisible).map((v) => v.externalId);

      const { count } = await prisma.vehicle.updateMany({
        where: {
          externalSource: provider.source,
          active: true,
          externalId: { notIn: seenIds },
        },
        data: { active: false, lastSyncedAt: new Date() },
      });

      vehiclesDeactivated = count;
    } else {
      logger.warn(
        "Bestand unvollständig – es werden keine Fahrzeuge deaktiviert",
        { source: provider.source },
      );
    }

    const counts = {
      vehiclesFound: vehicles.length,
      vehiclesCreated,
      vehiclesUpdated,
      vehiclesDeactivated,
    };

    if (failures.length > 0) {
      return finish(
        "PARTIAL",
        counts,
        `${failures.length} von ${vehicles.length} Fahrzeugen konnten nicht ` +
          `übernommen werden. Betroffene Anbieter-IDs: ${failures.slice(0, 10).join(", ")}` +
          `${failures.length > 10 ? " …" : ""}`,
      );
    }

    logger.info("Fahrzeugsynchronisierung abgeschlossen", {
      source: provider.source,
      ...counts,
    });

    return finish("SUCCESS", counts, null);
  } catch (error) {
    const message =
      error instanceof VehicleProviderError
        ? error.message
        : `Die Fahrzeugsynchronisierung ist fehlgeschlagen. ` +
          `Bitte prüfen Sie die Verbindung zum Anbieter „${provider.label}“.`;

    logger.error("Fahrzeugsynchronisierung fehlgeschlagen", {
      source: provider.source,
      error,
    });

    return finish(
      "FAILED",
      {
        vehiclesFound: 0,
        vehiclesCreated,
        vehiclesUpdated,
        vehiclesDeactivated,
      },
      message,
    );
  }
}

// --- Protokoll für den Admin (US-27) --------------------------------------

export async function listSyncRuns(limit = 20) {
  return prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getLatestSyncRun() {
  return prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
}
