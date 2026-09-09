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

/**
 * Macht einen hochgeladenen Dateinamen als Ablageschlüssel unbedenklich.
 *
 * Der Name kommt aus dem Browser des Hochladenden und ist damit frei wählbar.
 * Ungeprüft landet er im Ablagepfad: "../../woanders.jpg" würde die Datei aus
 * dem vorgesehenen Präfix herausschreiben, und Zeichen wie "?" oder "#"
 * zerlegen später die URL.
 *
 * Deshalb bleibt nur der letzte Pfadbestandteil übrig, und darin nur
 * unbedenkliche Zeichen. Die Länge wird begrenzt, weil Ablagesysteme den
 * Schlüssel sonst abschneiden.
 */
export function sanitizeUploadFilename(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? "";

  const cleaned = lastSegment
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80)
    // Erst nach dem Kürzen: Sonst könnte das Abschneiden einen Punkt an den
    // Anfang rücken und daraus doch noch eine versteckte Datei machen.
    .replace(/^\.+/, "");

  return cleaned || "bild";
}

/** Was Instagram und die Bildoptimierung akzeptieren. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Vercel Functions akzeptieren bei Server-Uploads höchstens 4,5 MB Request-
 * Body. Multipart-Metadaten brauchen ebenfalls Platz, deshalb bleiben Datei
 * und Gesamtanfrage bei höchstens 4 MB.
 */
export const MAX_UPLOAD_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = MAX_UPLOAD_REQUEST_BYTES;
