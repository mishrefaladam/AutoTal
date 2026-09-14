import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifyUploadedVehicleImage } from "@/integrations/storage/vehicle-images-direct";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";

/**
 * Trägt ein direkt nach Blob hochgeladenes Bild beim Fahrzeug ein.
 *
 * Der Client schickt nur den Pfad. Bevor eine Zeile entsteht, bestätigt das
 * SDK mit unserem Token, dass die Datei in unserem Store liegt, unter dem
 * Pfad dieses Fahrzeugs, als erlaubter Bildtyp und unter 8 MB. Neue Bilder
 * schließen hinten an – das Titelbild bleibt, was es war.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES_PER_VEHICLE = 30;

const bodySchema = z.object({ pathname: z.string().min(1).max(240) });

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/admin/vehicles/[id]/images/register">,
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id: vehicleId } = await context.params;

  let pathname: string;
  try {
    pathname = bodySchema.parse(await request.json()).pathname;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!vehicle) {
    return NextResponse.json({ error: "Dieses Fahrzeug wurde nicht gefunden." }, { status: 404 });
  }
  if (vehicle._count.images >= MAX_IMAGES_PER_VEHICLE) {
    return NextResponse.json(
      { error: `Pro Fahrzeug sind höchstens ${MAX_IMAGES_PER_VEHICLE} Bilder möglich.` },
      { status: 400 },
    );
  }

  try {
    const uploaded = await verifyUploadedVehicleImage(vehicleId, pathname);

    // Dieselbe Datei zweimal eintragen wäre eine Dublette – die Unique-Regel
    // auf (vehicleId, url) fängt das ab; hier wird es freundlich gemeldet.
    const image = await prisma.vehicleImage.upsert({
      where: { vehicleId_url: { vehicleId, url: uploaded.url } },
      update: {},
      create: { vehicleId, url: uploaded.url, position: vehicle._count.images, alt: null },
      select: { id: true, url: true },
    });

    logger.info("Fahrzeugbild eingetragen", {
      vehicleId,
      userId: session.id,
      sizeBytes: uploaded.size,
      contentType: uploaded.contentType,
    });

    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof UserFacingError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "NOT_CONFIGURED" ? 503 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error("Fahrzeugbild konnte nicht eingetragen werden", { vehicleId, error });
    return NextResponse.json(
      { error: "Das Bild konnte nicht gespeichert werden. Bitte versuchen Sie es erneut." },
      { status: 500 },
    );
  }
}
