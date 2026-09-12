import "server-only";

import { prisma } from "@/lib/prisma";
import type { DrivetrainType, VehicleStatus } from "@/generated/prisma/enums";

import {
  buildVehicleWhere,
  dropInvalidModel,
  type VehicleFilters,
} from "./filters";
import { shortenVin } from "./labels";

/** Lesezugriffe für die Fahrzeugverwaltung im Admin. */

export type AdminVehicleListItem = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  mileageKm: number;
  active: boolean;
  status: VehicleStatus;
  soldAt: Date | null;
  externalSource: string;
  // Unterscheidungsmerkmale für sonst gleich benannte Fahrzeuge.
  firstRegistration: Date | null;
  color: string | null;
  drivetrain: DrivetrainType | null;
  stockNumber: string | null;
  /** Dateiname des letzten CSV-Imports, falls das Fahrzeug daher stammt. */
  importSource: string | null;
  /** Nur gekürzt – die vollständige FIN steht ausschließlich auf der Detailseite. */
  vinShort: string | null;
  imageCount: number;
  primaryImageUrl: string | null;
  /**
   * Gesetzt, wenn das Fahrzeug im letzten CSV-Import fehlte. Nur ein Hinweis
   * zum Nachsehen – der Import ändert daraufhin nichts.
   */
  missingSinceImportAt: Date | null;
  updatedAt: Date;
};

/** Anzahl Fahrzeuge je Status – für die Übersichtskarten und Tabs. */
export type VehicleStatusCounts = Record<VehicleStatus, number> & {
  total: number;
};

/**
 * Zählt je Status in einer einzigen Abfrage.
 *
 * Bewusst `groupBy` statt die Liste zu laden und im Speicher zu filtern: Die
 * Zahlen stehen über den Tabs, dürfen also nicht davon abhängen, welcher Tab
 * gerade aktiv ist – und mit wachsendem Bestand bleibt es eine Abfrage.
 */
export async function countVehiclesByStatus(): Promise<VehicleStatusCounts> {
  const rows = await prisma.vehicle.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts: VehicleStatusCounts = {
    IN_STOCK: 0,
    RESERVED: 0,
    SOLD: 0,
    total: 0,
  };

  for (const row of rows) {
    counts[row.status] = row._count._all;
    counts.total += row._count._all;
  }

  return counts;
}

export type VehicleFilterOptions = {
  /** Marken, die es tatsächlich gibt – alphabetisch, ohne Leerwerte. */
  makes: string[];
  /** Modelle der gewählten Marke; ohne Marke: alle Modelle. */
  models: string[];
};

/**
 * Auswahlwerte für die Filterleiste, aus dem echten Bestand.
 *
 * `groupBy` statt `distinct`: Das ist ein echtes GROUP BY in der Datenbank,
 * kein Nachsortieren im Speicher. Zwei kleine Abfragen, parallel, unabhängig
 * von der Größe des Bestands.
 *
 * Der Status grenzt die Optionen mit ein: Wer im Tab "Verkauft" steht, soll
 * keine Marke angeboten bekommen, die nur im Bestand vorkommt – sonst führt
 * die Auswahl zu einer leeren Liste. Die Suche grenzt die Optionen bewusst
 * NICHT ein; sie soll die Auswahl nicht unter dem Nutzer wegziehen, während
 * er tippt.
 */
export async function listVehicleFilterOptions(
  filters: Pick<VehicleFilters, "status" | "make">,
): Promise<VehicleFilterOptions> {
  const scope = filters.status ? { status: filters.status } : {};

  const [makeRows, modelRows] = await Promise.all([
    prisma.vehicle.groupBy({
      by: ["make"],
      where: { ...scope, make: { not: "" } },
      orderBy: { make: "asc" },
    }),
    prisma.vehicle.groupBy({
      by: ["model"],
      where: {
        ...scope,
        model: { not: "" },
        ...(filters.make ? { make: filters.make } : {}),
      },
      orderBy: { model: "asc" },
    }),
  ]);

  return {
    makes: makeRows.map((row) => row.make),
    models: modelRows.map((row) => row.model),
  };
}

/**
 * Filter gegen den Bestand abgleichen und die Auswahlwerte dazu laden.
 *
 * Gemeinsamer Einstieg für beide Fahrzeuglisten: Ein Modell, das es bei der
 * gewählten Marke nicht gibt, fällt hier weg – siehe `dropInvalidModel`.
 */
export async function resolveVehicleFilters(
  filters: VehicleFilters,
): Promise<{ filters: VehicleFilters; options: VehicleFilterOptions }> {
  const options = await listVehicleFilterOptions(filters);
  return { filters: dropInvalidModel(filters, options.models), options };
}

export async function listVehiclesForAdmin(
  filters: VehicleFilters,
): Promise<AdminVehicleListItem[]> {
  const rows = await prisma.vehicle.findMany({
    where: buildVehicleWhere(filters),
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      make: true,
      model: true,
      variant: true,
      priceCents: true,
      mileageKm: true,
      active: true,
      status: true,
      soldAt: true,
      externalSource: true,
      missingSinceImportAt: true,
      firstRegistration: true,
      color: true,
      drivetrain: true,
      stockNumber: true,
      vin: true,
      importSource: true,
      updatedAt: true,
      images: {
        orderBy: { position: "asc" },
        select: { url: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: [row.make, row.model, row.variant].filter(Boolean).join(" "),
    priceCents: row.priceCents,
    mileageKm: row.mileageKm,
    active: row.active,
    status: row.status,
    soldAt: row.soldAt,
    externalSource: row.externalSource,
    missingSinceImportAt: row.missingSinceImportAt,
    firstRegistration: row.firstRegistration,
    color: row.color,
    drivetrain: row.drivetrain,
    stockNumber: row.stockNumber,
    importSource: row.importSource,
    vinShort: shortenVin(row.vin),
    imageCount: row.images.length,
    primaryImageUrl: row.images[0]?.url ?? null,
    updatedAt: row.updatedAt,
  }));
}

export async function getVehicleForEdit(id: string) {
  return prisma.vehicle.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
}

/**
 * Wie viele vom Import als fehlend markierte Fahrzeuge sich in einem Schritt
 * löschen ließen – und wie viele stehen bleiben, weil sie bearbeitet wurden.
 *
 * Dieselbe Abgrenzung wie in `deleteMissingImportedVehicles`: Nur Datensätze
 * ohne Bilder, Beschreibung und Beiträge gelten als unberührt.
 */
export async function countMissingImportedVehicles(): Promise<{
  deletable: number;
  kept: number;
}> {
  const candidates = await prisma.vehicle.findMany({
    where: {
      importedAt: { not: null },
      missingSinceImportAt: { not: null },
    },
    select: {
      description: true,
      _count: { select: { images: true, socialDrafts: true } },
    },
  });

  const deletable = candidates.filter(
    (vehicle) =>
      vehicle._count.images === 0 &&
      vehicle._count.socialDrafts === 0 &&
      vehicle.description.trim() === "",
  ).length;

  return { deletable, kept: candidates.length - deletable };
}
