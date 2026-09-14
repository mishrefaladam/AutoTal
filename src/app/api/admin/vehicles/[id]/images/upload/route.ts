import { NextResponse, type NextRequest } from "next/server";
import type { HandleUploadBody } from "@vercel/blob/client";

import {
  VEHICLE_IMAGE_DIRECT_MAX_BYTES,
  handleVehicleImageUpload,
  isDirectImageUploadAvailable,
} from "@/integrations/storage/vehicle-images-direct";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";

/**
 * Direkter Upload von Fahrzeugbildern nach Vercel Blob – Token-Route.
 *
 *   GET   Ist der direkte Upload möglich? Lokal ohne Blob-Token nicht; dann
 *         geht jedes Bild einzeln über die bisherige Upload-Route.
 *   POST  Stellt dem Blob-SDK ein kurzlebiges Token aus: nur Bilder, nur
 *         unter fahrzeuge/<id>/, höchstens 8 MB.
 *
 * Nur für angemeldete Admins, nur für ein vorhandenes Fahrzeug.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  return NextResponse.json({
    directUpload: isDirectImageUploadAvailable(),
    maxBytes: VEHICLE_IMAGE_DIRECT_MAX_BYTES,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/admin/vehicles/[id]/images/upload">,
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  if (!isDirectImageUploadAvailable()) {
    return NextResponse.json(
      { error: "Der direkte Upload ist in dieser Umgebung nicht eingerichtet.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const { id: vehicleId } = await context.params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) {
    return NextResponse.json({ error: "Dieses Fahrzeug wurde nicht gefunden." }, { status: 404 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    const result = await handleVehicleImageUpload(vehicleId, body, request);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error("Upload-Token für Fahrzeugbild fehlgeschlagen", { vehicleId, error });
    return NextResponse.json(
      { error: "Der Upload konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut." },
      { status: 500 },
    );
  }
}
