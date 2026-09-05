import "server-only";

import { prisma } from "@/lib/prisma";
import type { VehicleStatus } from "@/generated/prisma/enums";

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
  imageCount: number;
  primaryImageUrl: string | null;
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

export async function listVehiclesForAdmin(
  status?: VehicleStatus,
): Promise<AdminVehicleListItem[]> {
  const rows = await prisma.vehicle.findMany({
    where: status ? { status } : undefined,
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
