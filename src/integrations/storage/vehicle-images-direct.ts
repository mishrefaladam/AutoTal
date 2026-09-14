import "server-only";

import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { env, isBlobStorageConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";

import { ALLOWED_IMAGE_TYPES } from "./types";
import { describeBlobUploadError } from "./vercel-blob";

/**
 * Fahrzeugbilder: direkt vom Browser nach Vercel Blob.
 *
 * WARUM: Ein Foto vom iPhone hat drei bis sechs Megabyte. Über die Function
 * geschickt, scheiterte es an zwei Stellen, die beide als "Verbindung
 * abgebrochen" erschienen: am 4,5-MB-Body-Limit der Plattform (413 als
 * Klartext) und auf Mobilfunk an der Laufzeitgrenze der Function. Der
 * Browser lädt jetzt jedes Bild einzeln direkt in den Blob-Store; die
 * Function bekommt danach nur noch den Pfad und trägt das Bild ein.
 *
 * SICHERHEIT wie bei der Fahrzeugliste (temp-imports.ts): Der Client nennt
 * nur einen Pfad, und der muss exakt `fahrzeuge/<fahrzeug-id>/<uuid>.<ext>`
 * lauten – die Fahrzeug-ID steckt im Pfad, ein Bild kann nicht bei einem
 * anderen Fahrzeug eingetragen werden. Geprüft wird über das SDK mit unserem
 * Token; eine vom Client gelieferte URL wird nie abgerufen.
 *
 * GRENZE: 8 MB je Bild – das ist Instagrams Obergrenze für ein Foto. Größer
 * ergäbe ein Bild, das sich nie veröffentlichen ließe.
 */

export const VEHICLE_IMAGE_DIRECT_MAX_BYTES = 8 * 1024 * 1024;

/** Ein Upload-Token gilt nur kurz; die Übertragung dauert Sekunden. */
const TOKEN_VALID_MS = 10 * 60 * 1000;

const ID_PATTERN = "[A-Za-z0-9_-]{1,64}";
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSION_PATTERN = "(?:jpe?g|png|webp)";

export function isDirectImageUploadAvailable(): boolean {
  return isBlobStorageConfigured();
}

/** Vom Client vorgeschlagener Pfad – vor Vercels Zufallssuffix. */
export function isProposedVehicleImagePathname(vehicleId: string, value: string): boolean {
  if (!new RegExp(`^${ID_PATTERN}$`).test(vehicleId)) return false;
  return new RegExp(`^fahrzeuge/${vehicleId}/${UUID_PATTERN}\\.${EXTENSION_PATTERN}$`, "i").test(value);
}

/** Pfad nach dem Upload – mit Vercels Zufallssuffix. */
export function isVehicleImagePathname(vehicleId: string, value: unknown): value is string {
  if (typeof value !== "string" || value.length > 240) return false;
  if (!new RegExp(`^${ID_PATTERN}$`).test(vehicleId)) return false;
  return new RegExp(
    `^fahrzeuge/${vehicleId}/${UUID_PATTERN}(?:-[A-Za-z0-9]+)?\\.${EXTENSION_PATTERN}$`,
    "i",
  ).test(value);
}

/**
 * Die Einschränkungen des Upload-Tokens – als reine Funktion, damit sie sich
 * ohne Blob-Store prüfen lassen.
 */
export function vehicleImageTokenOptions(vehicleId: string, pathname: string, now = Date.now()) {
  if (!isProposedVehicleImagePathname(vehicleId, pathname)) {
    throw new UserFacingError("Ungültiger Ablagepfad.", "VALIDATION");
  }

  return {
    allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
    maximumSizeInBytes: VEHICLE_IMAGE_DIRECT_MAX_BYTES,
    addRandomSuffix: true,
    allowOverwrite: false,
    validUntil: now + TOKEN_VALID_MS,
    tokenPayload: null,
  };
}

function requireToken(): string {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new UserFacingError(
      "Der Bildspeicher ist in dieser Umgebung nicht eingerichtet.",
      "NOT_CONFIGURED",
    );
  }
  return token;
}

export async function handleVehicleImageUpload(
  vehicleId: string,
  body: HandleUploadBody,
  request: Request,
): Promise<unknown> {
  const token = requireToken();

  return handleUpload({
    body,
    request,
    token,
    onBeforeGenerateToken: async (pathname) => vehicleImageTokenOptions(vehicleId, pathname),
  });
}

export type UploadedVehicleImage = {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
};

/**
 * Bestätigt ein direkt hochgeladenes Bild, bevor es eingetragen wird:
 * Es liegt in unserem Store, unter dem Pfad dieses Fahrzeugs, ist ein
 * erlaubter Bildtyp und nicht zu groß. Die URL stammt aus der Antwort des
 * SDK – nie vom Client.
 */
export async function verifyUploadedVehicleImage(
  vehicleId: string,
  pathname: unknown,
): Promise<UploadedVehicleImage> {
  if (!isVehicleImagePathname(vehicleId, pathname)) {
    throw new UserFacingError("Ungültige Bildreferenz.", "VALIDATION");
  }
  const token = requireToken();

  let meta: Awaited<ReturnType<typeof head>>;
  try {
    meta = await head(pathname, { token });
  } catch (error) {
    logger.warn("Hochgeladenes Fahrzeugbild nicht gefunden", {
      ...describeBlobUploadError(error, token),
      vehicleId,
    });
    throw new UserFacingError(
      "Das hochgeladene Bild wurde nicht gefunden. Bitte versuchen Sie es erneut.",
      "NOT_FOUND",
    );
  }

  if (!ALLOWED_IMAGE_TYPES.includes(meta.contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new UserFacingError("Nur JPEG, PNG oder WebP sind erlaubt.", "VALIDATION");
  }
  if (meta.size > VEHICLE_IMAGE_DIRECT_MAX_BYTES) {
    throw new UserFacingError(
      `Das Bild ist größer als ${VEHICLE_IMAGE_DIRECT_MAX_BYTES / 1024 / 1024} MB.`,
      "VALIDATION",
    );
  }

  return { url: meta.url, pathname, size: meta.size, contentType: meta.contentType };
}
