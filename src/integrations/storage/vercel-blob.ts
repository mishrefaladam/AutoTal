import "server-only";

import { del, put } from "@vercel/blob";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";

import type { FileStorage, StoredFile } from "./types";

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
      const result = await put(`${input.prefix}/${input.filename}`, input.data, {
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
      logger.error("Upload zu Vercel Blob fehlgeschlagen", { error });
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
