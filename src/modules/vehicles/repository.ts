import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { toVehicleDetail, toVehicleListItem } from "./mappers";
import type {
  VehicleDetail,
  VehicleFacets,
  VehicleFilters,
  VehicleListItem,
  VehicleSearchResult,
  VehicleSortOption,
} from "./types";

export const VEHICLES_PAGE_SIZE = 12;

/** Öffentlich sichtbar ist nur, was aktiv ist (US-07). */
const PUBLIC_SCOPE = { active: true } satisfies Prisma.VehicleWhereInput;

const IMAGE_SELECT = {
  orderBy: { position: "asc" },
} satisfies Prisma.Vehicle$imagesArgs;

const ORDER_BY: Record<VehicleSortOption, Prisma.VehicleOrderByWithRelationInput[]> =
  {
    newest: [{ createdAt: "desc" }, { id: "desc" }],
    "price-asc": [{ priceCents: "asc" }, { id: "asc" }],
    "price-desc": [{ priceCents: "desc" }, { id: "asc" }],
    "mileage-asc": [{ mileageKm: "asc" }, { id: "asc" }],
    "registration-desc": [
      { firstRegistration: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ],
  };

/** Übersetzt die UI-Filter in eine Prisma-Bedingung (US-04). */
export function buildWhereClause(
  filters: Partial<VehicleFilters>,
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { ...PUBLIC_SCOPE };

  if (filters.make) {
    where.make = { equals: filters.make, mode: "insensitive" };
  }

  if (filters.model) {
    where.model = { equals: filters.model, mode: "insensitive" };
  }

  if (filters.minPriceCents != null || filters.maxPriceCents != null) {
    where.priceCents = {
      ...(filters.minPriceCents != null ? { gte: filters.minPriceCents } : {}),
      ...(filters.maxPriceCents != null ? { lte: filters.maxPriceCents } : {}),
    };
  }

  if (filters.minMileageKm != null || filters.maxMileageKm != null) {
    where.mileageKm = {
      ...(filters.minMileageKm != null ? { gte: filters.minMileageKm } : {}),
      ...(filters.maxMileageKm != null ? { lte: filters.maxMileageKm } : {}),
    };
  }

  if (
    filters.minFirstRegistrationYear != null ||
    filters.maxFirstRegistrationYear != null
  ) {
    where.firstRegistration = {
      ...(filters.minFirstRegistrationYear != null
        ? { gte: new Date(Date.UTC(filters.minFirstRegistrationYear, 0, 1)) }
        : {}),
      ...(filters.maxFirstRegistrationYear != null
        ? {
            lte: new Date(
              Date.UTC(filters.maxFirstRegistrationYear, 11, 31, 23, 59, 59),
            ),
          }
        : {}),
    };
  }

  if (filters.fuel?.length) {
    where.fuel = { in: filters.fuel };
  }

  if (filters.transmission?.length) {
    where.transmission = { in: filters.transmission };
  }

  if (filters.bodyType?.length) {
    where.bodyType = { in: filters.bodyType };
  }

  return where;
}

export async function searchVehicles(
  filters: VehicleFilters,
): Promise<VehicleSearchResult> {
  const where = buildWhereClause(filters);
  const page = Math.max(1, filters.page);

  const [totalCount, rows] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: { images: IMAGE_SELECT },
      orderBy: ORDER_BY[filters.sort],
      skip: (page - 1) * VEHICLES_PAGE_SIZE,
      take: VEHICLES_PAGE_SIZE,
    }),
  ]);

  return {
    items: rows.map(toVehicleListItem),
    totalCount,
    page,
    pageSize: VEHICLES_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalCount / VEHICLES_PAGE_SIZE)),
  };
}

export async function getVehicleBySlug(
  slug: string,
): Promise<VehicleDetail | null> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { slug, ...PUBLIC_SCOPE },
    include: { images: IMAGE_SELECT },
  });

  return vehicle ? toVehicleDetail(vehicle) : null;
}

/** Für den Admin – liefert auch deaktivierte Fahrzeuge. */
export async function getVehicleByIdIncludingInactive(
  id: string,
): Promise<VehicleDetail | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { images: IMAGE_SELECT },
  });

  return vehicle ? toVehicleDetail(vehicle) : null;
}

/** Aktuelle Fahrzeuge für die Startseite. */
export async function listLatestVehicles(
  limit = 6,
): Promise<VehicleListItem[]> {
  const rows = await prisma.vehicle.findMany({
    where: PUBLIC_SCOPE,
    include: { images: IMAGE_SELECT },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  return rows.map(toVehicleListItem);
}

/** Ähnliche Fahrzeuge auf der Detailseite – gleiche Karosserie, ähnlicher Preis. */
export async function listSimilarVehicles(
  vehicle: VehicleDetail,
  limit = 3,
): Promise<VehicleListItem[]> {
  const rows = await prisma.vehicle.findMany({
    where: {
      ...PUBLIC_SCOPE,
      id: { not: vehicle.id },
      OR: [
        { bodyType: vehicle.bodyType },
        { make: { equals: vehicle.make, mode: "insensitive" } },
      ],
      priceCents: {
        gte: Math.round(vehicle.priceCents * 0.65),
        lte: Math.round(vehicle.priceCents * 1.35),
      },
    },
    include: { images: IMAGE_SELECT },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(toVehicleListItem);
}

export async function countActiveVehicles(): Promise<number> {
  return prisma.vehicle.count({ where: PUBLIC_SCOPE });
}

/** Alle Slugs für die Sitemap. */
export async function listActiveVehicleSlugs(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return prisma.vehicle.findMany({
    where: PUBLIC_SCOPE,
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Wertebereiche des aktuellen Bestands.
 *
 * Speist die Filter-UI, damit dort nur Marken, Modelle und Spannen
 * erscheinen, die tatsächlich zu Treffern führen.
 */
export async function getVehicleFacets(): Promise<VehicleFacets> {
  const [makeGroups, modelGroups, fuelGroups, transmissionGroups, bodyGroups, ranges] =
    await Promise.all([
      prisma.vehicle.groupBy({
        by: ["make"],
        where: PUBLIC_SCOPE,
        _count: { _all: true },
        orderBy: { make: "asc" },
      }),
      prisma.vehicle.groupBy({
        by: ["make", "model"],
        where: PUBLIC_SCOPE,
        orderBy: [{ make: "asc" }, { model: "asc" }],
      }),
      prisma.vehicle.groupBy({
        by: ["fuel"],
        where: PUBLIC_SCOPE,
        _count: { _all: true },
      }),
      prisma.vehicle.groupBy({
        by: ["transmission"],
        where: PUBLIC_SCOPE,
        _count: { _all: true },
      }),
      prisma.vehicle.groupBy({
        by: ["bodyType"],
        where: PUBLIC_SCOPE,
        _count: { _all: true },
      }),
      prisma.vehicle.aggregate({
        where: PUBLIC_SCOPE,
        _min: { priceCents: true, mileageKm: true, firstRegistration: true },
        _max: { priceCents: true, mileageKm: true, firstRegistration: true },
        _count: { _all: true },
      }),
    ]);

  const modelsByMake: Record<string, string[]> = {};
  for (const group of modelGroups) {
    (modelsByMake[group.make] ??= []).push(group.model);
  }

  const currentYear = new Date().getFullYear();

  return {
    makes: makeGroups.map((group) => ({
      value: group.make,
      count: group._count._all,
    })),
    modelsByMake,
    fuels: fuelGroups
      .map((group) => ({ value: group.fuel, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    transmissions: transmissionGroups
      .map((group) => ({ value: group.transmission, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    bodyTypes: bodyGroups
      .map((group) => ({ value: group.bodyType, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    priceRange: {
      minCents: ranges._min.priceCents ?? 0,
      maxCents: ranges._max.priceCents ?? 10_000_000,
    },
    mileageRange: {
      minKm: ranges._min.mileageKm ?? 0,
      maxKm: ranges._max.mileageKm ?? 300_000,
    },
    yearRange: {
      min: ranges._min.firstRegistration?.getFullYear() ?? currentYear - 20,
      max: ranges._max.firstRegistration?.getFullYear() ?? currentYear,
    },
    totalCount: ranges._count._all,
  };
}
