import "server-only";

import { prisma } from "@/lib/prisma";

import { toVehicleDetail } from "./mappers";
import type { VehicleDetail } from "./types";

/**
 * Zugriff auf erfasste Fahrzeuge.
 *
 * WICHTIG: Diese Datensätze bilden NICHT den öffentlichen Fahrzeugbestand ab.
 * Der kommt vollständig aus der eingebetteten willhaben-Fahrzeugbörse
 * (siehe src/components/integrations/vehicle-widget).
 *
 * Fahrzeuge in dieser Tabelle dienen ausschließlich als Datenbasis für die
 * Social-Media-Funktion: Man wählt ein Fahrzeug aus, lässt daraus eine Caption
 * erzeugen und veröffentlicht sie nach Freigabe. Gepflegt werden sie unter
 * /admin/fahrzeuge.
 */

/** Ein einzelnes Fahrzeug samt Bildern – für die Caption-Erzeugung. */
export async function getVehicleByIdIncludingInactive(
  id: string,
): Promise<VehicleDetail | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });

  return vehicle ? toVehicleDetail(vehicle) : null;
}
