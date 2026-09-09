import "server-only";

import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  del,
  put,
} from "@vercel/blob";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";

import { type FileStorage, type StoredFile, sanitizeUploadFilename } from "./types";

export type BlobUploadErrorCategory =
  | "access-mode-mismatch"
  | "authorization"
  | "content-type"
  | "file-too-large"
  | "rate-limited"
  | "service-unavailable"
  | "store-not-found"
  | "store-suspended"
  | "unknown";

function sanitizeBlobErrorMessage(message: string): string {
  return message
    .replace(/vercel_blob_rw_[a-z0-9_-]+/gi, "[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&](?:token|signature|secret)=)[^&\s]+/gi, "$1[redacted]");
}

/** Prüft nur das Präfix/Format und gibt niemals Bestandteile des Tokens aus. */
export function getBlobCredentialFormat(
  token: string | undefined,
): "missing" | "read-write" | "unexpected" {
  if (!token) return "missing";

  const parts = token.split("_");
  return parts.length >= 5 &&
    parts[0] === "vercel" &&
    parts[1] === "blob" &&
    parts[2] === "rw" &&
    parts.slice(3).every(Boolean)
    ? "read-write"
    : "unexpected";
}

/**
 * Übersetzt SDK-Fehler in loggbare Kategorien. Die bereinigte Meldung enthält
 * genug Ursache für Vercel-Logs, aber niemals bekannte Credential-Formate.
 */
export function describeBlobUploadError(error: unknown, token?: string) {
  const rawMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
  const message = sanitizeBlobErrorMessage(rawMessage);

  let category: BlobUploadErrorCategory = "unknown";
  if (/public access on a private store|private access on a public store/i.test(message)) {
    category = "access-mode-mismatch";
  } else if (error instanceof BlobContentTypeNotAllowedError) {
    category = "content-type";
  } else if (error instanceof BlobFileTooLargeError) {
    category = "file-too-large";
  } else if (error instanceof BlobStoreNotFoundError) {
    category = "store-not-found";
  } else if (error instanceof BlobStoreSuspendedError) {
    category = "store-suspended";
  } else if (error instanceof BlobServiceRateLimited) {
    category = "rate-limited";
  } else if (error instanceof BlobServiceNotAvailable) {
    category = "service-unavailable";
  } else if (
    error instanceof BlobAccessError ||
    /access denied|invalid token|no (?:blob )?credentials|read-write token/i.test(message)
  ) {
    category = "authorization";
  }

  return {
    category,
    errorName: error instanceof Error ? error.constructor.name : typeof error,
    errorMessage: message,
    credentialPresent: Boolean(token),
    credentialFormat: getBlobCredentialFormat(token),
  };
}

/**
 * Vercel Blob – der Objektspeicher für den Produktivbetrieb.
 *
 * `addRandomSuffix` verhindert, dass zwei Uploads mit gleichem Dateinamen
 * (etwa zweimal "IMG_1234.jpg") einander überschreiben.
 */
export class VercelBlobStorage implements FileStorage {
  readonly kind = "vercel-blob" as const;

  isConfigured(): boolean {
    return Boolean(env().BLOB_READ_WRITE_TOKEN);
  }

  async upload(input: {
    prefix: string;
    filename: string;
    contentType: string;
    data: Buffer;
  }): Promise<StoredFile> {
    const token = env().BLOB_READ_WRITE_TOKEN;

    if (!token) {
      throw new UserFacingError(
        "Der Bildspeicher ist nicht eingerichtet. Bitte einen Vercel-Blob-Store " +
          "anlegen; die Variable BLOB_READ_WRITE_TOKEN wird dabei automatisch gesetzt.",
        "NOT_CONFIGURED",
      );
    }

    try {
      // Der Dateiname stammt aus dem Browser und geht hier in den
      // Ablageschlüssel ein – er wird deshalb zuerst entschärft.
      const key = `${input.prefix}/${sanitizeUploadFilename(input.filename)}`;

      const result = await put(key, input.data, {
        access: "public",
        contentType: input.contentType,
        addRandomSuffix: true,
        token,
      });

      return {
        url: result.url,
        pathname: result.pathname,
        size: input.data.byteLength,
        contentType: input.contentType,
      };
    } catch (error) {
      logger.error("Upload zu Vercel Blob fehlgeschlagen", {
        ...describeBlobUploadError(error, token),
        sdk: "@vercel/blob",
        access: "public",
        contentType: input.contentType,
        sizeBytes: input.data.byteLength,
        runtime: "nodejs",
      });
      throw new UserFacingError(
        "Das Bild konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }
  }

  async remove(url: string): Promise<void> {
    const token = env().BLOB_READ_WRITE_TOKEN;
    if (!token) return;

    try {
      await del(url, { token });
    } catch (error) {
      // Ein nicht löschbares Bild darf das Löschen des Fahrzeugs nicht
      // verhindern – es bleibt als verwaistes Objekt zurück.
      logger.warn("Bild konnte nicht aus dem Blob-Store entfernt werden", {
        error,
      });
    }
  }
}
