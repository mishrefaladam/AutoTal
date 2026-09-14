import "server-only";

/**
 * Erreichbarkeitsprüfung für Bild-URLs vor der Instagram-Veröffentlichung.
 *
 * Instagram holt die Bilder selbst ab. Ein gelöschtes Blob oder ein privater
 * Store scheitert dort erst nach dem Container-Aufruf, mit einer unklaren
 * Meldung – hier heißt es vorher "Bild 2 von 4 ist nicht erreichbar".
 *
 * SICHERHEIT: Aufgerufen wird nur mit URLs aus unserer Datenbank (Bilder
 * des Fahrzeugs), die `instagramImageProblem` zuvor auf https und einen
 * öffentlichen Host geprüft hat – nie mit einer vom Client gelieferten URL.
 * Es ist ein HEAD; Inhalte werden nicht gelesen.
 */
export async function imageUnreachable(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    if (!response.ok) return `HTTP ${response.status}`;
    const type = response.headers.get("content-type") ?? "";
    if (!/^image\/jpeg/i.test(type)) return `Typ ${type || "unbekannt"} statt JPEG`;
    return null;
  } catch {
    return "keine Antwort";
  }
}
