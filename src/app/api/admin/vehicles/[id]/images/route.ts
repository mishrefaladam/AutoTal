import { NextResponse, type NextRequest } from "next/server";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  getFileStorage,
} from "@/integrations/storage";
import type { FileStorage } from "@/integrations/storage";
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

  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_UPLOAD_REQUEST_BYTES) {
    logger.warn("Bildupload wegen Request-Größe abgewiesen", {
      vehicleId,
      declaredBytes,
      maxBytes: MAX_UPLOAD_REQUEST_BYTES,
    });
    return NextResponse.json(
      { error: "Bitte pro Upload insgesamt höchstens 4 MB auswählen." },
      { status: 413 },
    );
  }

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
  } catch (error) {
    logger.warn("Bildupload-Body konnte nicht gelesen werden", {
      vehicleId,
      declaredBytes: Number.isFinite(declaredBytes) ? declaredBytes : null,
      contentType: request.headers.get("content-type"),
      error,
    });
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

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
    logger.warn("Bildupload wegen Gesamtgröße abgewiesen", {
      vehicleId,
      fileCount: files.length,
      totalBytes,
      maxBytes: MAX_UPLOAD_REQUEST_BYTES,
    });
    return NextResponse.json(
      { error: "Bitte pro Upload insgesamt höchstens 4 MB auswählen." },
      { status: 413 },
    );
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

  let storage: FileStorage;
  try {
    storage = getFileStorage();
  } catch (error) {
    logger.error("Bildspeicher nicht verfügbar", {
      vehicleId,
      runtime: "nodejs",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      credentialPresent: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
      error,
    });
    return NextResponse.json(
      { error: "Das Bild konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }

  logger.info("Bildupload serverseitig gestartet", {
    vehicleId,
    userId: session.id,
    fileCount: files.length,
    totalBytes,
    storage: storage.kind,
    storageConfigured: storage.isConfigured(),
    runtime: "nodejs",
  });
  const created: { id: string; url: string }[] = [];
  const skipped: string[] = [];
  const rejectionCounts = {
    mimeType: 0,
    fileSize: 0,
    storageOrDatabase: 0,
  };

  // Position fortlaufend weiterzählen, damit neue Bilder hinten anschließen.
  let position = vehicle._count.images;

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      rejectionCounts.mimeType += 1;
      skipped.push(`${file.name}: nur JPEG, PNG oder WebP`);
      continue;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      rejectionCounts.fileSize += 1;
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
      rejectionCounts.storageOrDatabase += 1;
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
    rejectionCounts,
    storage: storage.kind,
  });

  return NextResponse.json({
    created: created.length,
    skipped,
    images: created,
  });
}
