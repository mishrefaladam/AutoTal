/**
 * Ablage hochgeladener Dateien.
 *
 * Hinter dieser Schnittstelle steckt in der Produktion Vercel Blob, in der
 * lokalen Entwicklung das Dateisystem. Der aufrufende Code kennt nur dieses
 * Interface, nicht den konkreten Speicheranbieter.
 *
 * Warum überhaupt ein Objektspeicher? Auf Vercel ist das Dateisystem zur
 * Laufzeit schreibgeschützt, und alles außerhalb des Deployments ist beim
 * nächsten Deploy weg. Bilder, die im Admin hochgeladen werden, müssen
 * deshalb außerhalb der Anwendung liegen.
 */

export type StoredFile = {
  /** Öffentlich erreichbare Adresse des Bildes. */
  url: string;
  /** Interner Schlüssel zum späteren Löschen. */
  pathname: string;
  size: number;
  contentType: string;
};

export interface FileStorage {
  readonly kind: "vercel-blob" | "local";

  /** Ist der Speicher einsatzbereit? */
  isConfigured(): boolean;

  /**
   * Legt eine Datei ab. `prefix` gruppiert zusammengehörige Dateien,
   * z. B. "fahrzeuge/<id>". Der endgültige Name wird eindeutig gemacht,
   * damit zwei Uploads mit gleichem Dateinamen einander nicht überschreiben.
   */
  upload(input: {
    prefix: string;
    filename: string;
    contentType: string;
    data: Buffer;
  }): Promise<StoredFile>;

  /** Entfernt eine Datei. Ein bereits gelöschtes Objekt ist kein Fehler. */
  remove(url: string): Promise<void>;
}

/** Was Instagram und die Bildoptimierung akzeptieren. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Instagram lehnt Bilder über 8 MB ab; darunter bleiben wir mit Reserve. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
