import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";

import type { FileStorage, StoredFile } from "./types";

/**
 * Ablage im Dateisystem – ausschließlich für die lokale Entwicklung.
 *
 * Schreibt nach `public/uploads/` (in .gitignore). Auf Vercel funktioniert
 * das NICHT: Dort ist das Dateisystem schreibgeschützt, und alles außerhalb
 * des Deployments verschwindet beim nächsten Deploy. Deshalb verweigert
 * dieser Speicher in der Produktion den Dienst, statt Bilder anzunehmen,
 * die kurz darauf weg sind.
 */
export class LocalFileStorage implements FileStorage {
  readonly kind = "local" as const;

  private readonly root = path.join(process.cwd(), "public", "uploads");

  isConfigured(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  async upload(input: {
    prefix: string;
    filename: string;
    contentType: string;
    data: Buffer;
  }): Promise<StoredFile> {
    if (!this.isConfigured()) {
      throw new UserFacingError(
        "Es ist kein Bildspeicher eingerichtet. In der Produktion wird ein " +
          "Vercel-Blob-Store benötigt – das Dateisystem ist dort schreibgeschützt.",
        "NOT_CONFIGURED",
      );
    }

    // Pfadangaben aus dem Dateinamen entfernen: Ein Name wie
    // "../../etc/passwd" darf nicht aus dem Upload-Verzeichnis herausführen.
    const safeName = path
      .basename(input.filename)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(-80);

    const unique = `${randomBytes(8).toString("hex")}-${safeName}`;
    const relative = path.posix.join(input.prefix, unique);
    const absolute = path.join(this.root, relative);

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.data);

    return {
      url: `/uploads/${relative}`,
      pathname: relative,
      size: input.data.byteLength,
      contentType: input.contentType,
    };
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith("/uploads/")) return;

    const relative = url.slice("/uploads/".length);
    const absolute = path.join(this.root, relative);

    // Sicherheitsnetz gegen Pfadausbruch über einen manipulierten Datensatz.
    if (!absolute.startsWith(this.root)) {
      logger.warn("Löschversuch außerhalb des Upload-Verzeichnisses abgewiesen");
      return;
    }

    try {
      await unlink(absolute);
    } catch {
      // Datei bereits weg – kein Fehler.
    }
  }
}
