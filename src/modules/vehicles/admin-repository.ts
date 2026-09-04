import "server-only";

import { prisma } from "@/lib/prisma";

/** Lesezugriffe für die Fahrzeugverwaltung im Admin. */

export type AdminVehicleListItem = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  mileageKm: number;
  active: boolean;
  externalSource: string;
  imageCount: number;
  primaryImageUrl: string | null;
  updatedAt: Date;
};

export async function listVehiclesForAdmin(): Promise<AdminVehicleListItem[]> {
  const rows = await prisma.vehicle.findMany({
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
