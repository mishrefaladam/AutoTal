import {
  INSTAGRAM_CAROUSEL_MAX_ITEMS,
  INSTAGRAM_CAROUSEL_MIN_ITEMS,
} from "@/integrations/instagram/limits";

/**
 * Welche Fahrzeugbilder gehen an Instagram – und in welcher Reihenfolge.
 *
 * REIHENFOLGE: Der Entwurf merkt sich, welche Bilder ausgewählt sind. Die
 * Reihenfolge bestimmt aber die Galerie des Fahrzeugs: Sortiert der Händler
 * dort um, folgt der Beitrag. Das Titelbild (Position 0) steht damit vorne,
 * sofern es ausgewählt ist. Bilder, die inzwischen gelöscht wurden, fallen
 * still weg – ein Beitrag mit einem toten Link wäre schlimmer.
 *
 * ANFORDERUNGEN laut Meta (Instagram API mit Instagram Login):
 *   - "JPEG is the only image format supported."
 *   - höchstens 10 Elemente je Carousel, mindestens 2
 *   - die URL muss öffentlich erreichbar sein – kein localhost, kein privates
 *     Netz, kein http
 *
 * Reine Funktionen, ohne Netz – die Erreichbarkeit prüft der Aufrufer.
 */

export const INSTAGRAM_MAX_IMAGES = INSTAGRAM_CAROUSEL_MAX_ITEMS;

/** Only for new drafts; never expand an existing saved selection. */
export function defaultInstagramImages(
  images: readonly { url: string; position: number }[],
): string[] {
  return [...new Set(
    [...images]
      .sort((a, b) => a.position - b.position)
      .filter((image) => instagramImageProblem(image.url) === null)
      .map((image) => image.url),
  )].slice(0, INSTAGRAM_MAX_IMAGES);
}

/** Ausgewählte Bilder in Galerie-Reihenfolge; Gelöschtes fällt weg. */
export function orderSelectedImages(
  selectedUrls: readonly string[],
  galleryUrls: readonly string[],
): string[] {
  const selected = new Set(selectedUrls);
  return galleryUrls.filter((url) => selected.has(url));
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Prüft eine Bild-URL formal, bevor Instagram sie sieht.
 *
 * Gibt den Grund zurück oder null. Die Prüfungen folgen aus dem, was
 * Instagram tatsächlich ablehnt – nicht aus Vorsicht.
 */
export function instagramImageProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "keine gültige Adresse";
  }

  if (parsed.protocol !== "https:") return "nur https-Adressen sind für Instagram erreichbar";
  if (PRIVATE_HOST.test(parsed.hostname)) return "lokale oder private Adresse";
  if (!/\.jpe?g$/i.test(parsed.pathname)) return "kein JPEG – Instagram nimmt nur JPEG an";

  return null;
}

export type ImagePlan =
  | { ok: true; mode: "single" | "carousel"; imageUrls: string[] }
  | { ok: false; message: string };

/**
 * Entscheidet, wie veröffentlicht wird: ein Bild → Einzelbild, mehrere →
 * Carousel. Keins → gar nicht.
 */
export function planInstagramImages(
  selectedUrls: readonly string[],
  galleryUrls: readonly string[],
): ImagePlan {
  const imageUrls = orderSelectedImages(selectedUrls, galleryUrls);

  if (imageUrls.length === 0) {
    return {
      ok: false,
      message:
        "Für diesen Beitrag ist kein Bild ausgewählt. Bitte wählen Sie beim " +
        "Entwurf mindestens ein Fahrzeugbild aus.",
    };
  }

  if (imageUrls.length > INSTAGRAM_CAROUSEL_MAX_ITEMS) {
    return {
      ok: false,
      message:
        `Instagram erlaubt höchstens ${INSTAGRAM_CAROUSEL_MAX_ITEMS} Bilder je Beitrag; ` +
        `ausgewählt sind ${imageUrls.length}. Bitte wählen Sie weniger Bilder aus.`,
    };
  }

  for (const [index, url] of imageUrls.entries()) {
    const problem = instagramImageProblem(url);
    if (problem) {
      return {
        ok: false,
        message: `Bild ${index + 1} von ${imageUrls.length} kann nicht veröffentlicht werden: ${problem}.`,
      };
    }
  }

  return {
    ok: true,
    mode: imageUrls.length >= INSTAGRAM_CAROUSEL_MIN_ITEMS ? "carousel" : "single",
    imageUrls,
  };
}
