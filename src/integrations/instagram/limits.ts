/**
 * Carousel-Grenzen laut Meta-Dokumentation zur Instagram API mit Instagram
 * Login (Content Publishing): "Carousels are limited to 10 images, videos,
 * or a mix of the two." Ein Carousel hat mindestens zwei Elemente; ein
 * einzelnes Bild geht den bestehenden Einzelbild-Weg.
 *
 * Eigene Datei ohne Server-Import, weil die Oberfläche dieselbe Grenze
 * anzeigt – die Zahl darf nur an einer Stelle stehen.
 */
export const INSTAGRAM_CAROUSEL_MIN_ITEMS = 2;
export const INSTAGRAM_CAROUSEL_MAX_ITEMS = 10;
