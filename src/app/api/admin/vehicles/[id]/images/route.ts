import { NextResponse, type NextRequest } from "next/server";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  getFileStorage,
} from "@/integrations/storage";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";

/**
 * Bildupload für ein Fahrzeug.
 *
 * Bewusst ein Route Handler und keine Server Action: Server Actions haben
 * ein knappes Body-Limit (Standard 1 MB), Fahrzeugfotos liegen regelmäßig
 * darüber. Hier wird die Größe stattdessen ausdrücklich geprüft.
 *
 * Es werden mehrere Dateien in einem Aufruf angenommen, damit die Galerie in
 * einem Rutsch befüllt werden kann.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES_PER_REQUEST = 20;
const MAX_IMAGES_PER_VEHICLE = 30;

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/admin/vehicles/[id]/images">,
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id: vehicleId } = await context.params;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, _count: { select: { images: true } } },
  });

  if (!vehicle) {
    return NextResponse.json(
      { error: "Dieses Fahrzeug wurde nicht gefunden." },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Die Dateien konnten nicht gelesen werden." },
      { status: 400 },
    );
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Bitte höchstens ${MAX_FILES_PER_REQUEST} Bilder auf einmal hochladen.` },
      { status: 400 },
    );
  }

  if (vehicle._count.images + files.length > MAX_IMAGES_PER_VEHICLE) {
    return NextResponse.json(
      {
        error:
          `Pro Fahrzeug sind höchstens ${MAX_IMAGES_PER_VEHICLE} Bilder möglich. ` +
          `Aktuell sind es ${vehicle._count.images}.`,
      },
      { status: 400 },
    );
  }

  const storage = getFileStorage();
  const created: { id: string; url: string }[] = [];
  const skipped: string[] = [];

  // Position fortlaufend weiterzählen, damit neue Bilder hinten anschließen.
  let position = vehicle._count.images;

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      skipped.push(`${file.name}: nur JPEG, PNG oder WebP`);
      continue;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      skipped.push(
        `${file.name}: über ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`,
      );
      continue;
    }

    try {
      const stored = await storage.upload({
        prefix: `fahrzeuge/${vehicleId}`,
        filename: file.name || "bild.jpg",
        contentType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      });

      const image = await prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: stored.url,
          position,
          alt: null,
        },
        select: { id: true, url: true },
      });

      created.push(image);
      position += 1;
    } catch (error) {
      const message =
        error instanceof UserFacingError
          ? error.message
          : "Speichern fehlgeschlagen.";

      logger.error("Bildupload fehlgeschlagen", { vehicleId, error });
      skipped.push(`${file.name}: ${message}`);
    }
  }

  logger.info("Fahrzeugbilder hochgeladen", {
    vehicleId,
    userId: session.id,
    created: created.length,
    skipped: skipped.length,
    storage: storage.kind,
  });

  return NextResponse.json({
    created: created.length,
    skipped,
    images: created,
  });
}
