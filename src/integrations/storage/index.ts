import "server-only";

import { env, isBlobStorageConfigured } from "@/lib/env";
import { UserFacingError } from "@/lib/result";

import { LocalFileStorage } from "./local";
import type { FileStorage } from "./types";
import { VercelBlobStorage } from "./vercel-blob";

/**
 * Wählt den Speicher: Vercel Blob, sobald ein Token vorliegt, sonst das
 * lokale Dateisystem. So läuft die Bildverwaltung in der Entwicklung ohne
 * Cloud-Konto und in der Produktion mit richtigem Objektspeicher.
 */

let instance: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (!isBlobStorageConfigured() && env().NODE_ENV === "production") {
    throw new UserFacingError(
      "Der Bildspeicher ist in dieser Umgebung nicht eingerichtet.",
      "NOT_CONFIGURED",
    );
  }

  if (!instance || instance.kind !== expectedKind()) {
    instance = isBlobStorageConfigured()
      ? new VercelBlobStorage()
      : new LocalFileStorage();
  }
  return instance;
}

function expectedKind(): FileStorage["kind"] {
  return isBlobStorageConfigured() ? "vercel-blob" : "local";
}

export * from "./types";
