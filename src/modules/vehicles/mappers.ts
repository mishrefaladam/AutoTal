// Prisma 7 exportiert die Entitätstypen mit dem Suffix `Model`.
import type { VehicleModel } from "@/generated/prisma/models/Vehicle";
import type { VehicleImageModel } from "@/generated/prisma/models/VehicleImage";

import { buildVehicleTitle } from "./slug";
import type { VehicleDetail, VehicleImageDto, VehicleListItem } from "./types";

/**
 * Abbildung Prisma-Entität -> UI-DTO.
 *
 * Die UI bekommt nie eine Prisma-Entität zu sehen. Das hält die Datenbank aus
 * den Komponenten heraus und stellt sicher, dass interne Felder (etwa der
 * Provider-Schlüssel) nur dort landen, wo sie gebraucht werden.
 */

export type VehicleWithImages = VehicleModel & { images: VehicleImageModel[] };

function toImageDto(image: VehicleImageModel, fallbackAlt: string): VehicleImageDto {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt?.trim() || fallbackAlt,
    width: image.width,
    height: image.height,
  };
}

export function toVehicleListItem(vehicle: VehicleWithImages): VehicleListItem {
  const title = buildVehicleTitle(vehicle);
  const sorted = [...vehicle.images].sort((a, b) => a.position - b.position);

  return {
    id: vehicle.id,
    slug: vehicle.slug,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant,
    title,
    priceCents: vehicle.priceCents,
    vatDeductible: vehicle.vatDeductible,
    mileageKm: vehicle.mileageKm,
    firstRegistration: vehicle.firstRegistration,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    condition: vehicle.condition,
    powerKw: vehicle.powerKw,
    primaryImage: sorted[0] ? toImageDto(sorted[0], title) : null,
    imageCount: sorted.length,
  };
}

export function toVehicleDetail(vehicle: VehicleWithImages): VehicleDetail {
  const listItem = toVehicleListItem(vehicle);
  const sorted = [...vehicle.images].sort((a, b) => a.position - b.position);

  return {
    ...listItem,
    images: sorted.map((image) => toImageDto(image, listItem.title)),
    description: vehicle.description,
    features: vehicle.features,
    color: vehicle.color,
    doors: vehicle.doors,
    seats: vehicle.seats,
    previousOwners: vehicle.previousOwners,
    displacementCcm: vehicle.displacementCcm,
    inspectionValidUntil: vehicle.inspectionValidUntil,
    externalSource: vehicle.externalSource,
    externalId: vehicle.externalId,
    lastSyncedAt: vehicle.lastSyncedAt,
  };
}
