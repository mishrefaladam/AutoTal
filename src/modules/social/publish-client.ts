import type { InstagramPublishPhase } from "@/integrations/instagram/protocol";

import { publishDraft, republishDeletedDraft, retryPublish } from "./actions";
import { parseNdjsonChunks } from "./ndjson";

/**
 * Veröffentlichen mit Zwischenstand – die Browserseite.
 *
 * Die Route /api/admin/social/drafts/[id]/publish streamt den Beginn jedes
 * Schritts, sobald er serverseitig beginnt – "Bilder werden vorbereitet",
 * "Carousel wird erstellt", "Beitrag wird veröffentlicht". Nichts davon ist
 * geschätzt; Prozentwerte gibt es keine. Antwortet die Route nicht wie
 * erwartet (älterer Stand, Proxy ohne Streaming), läuft die Veröffentlichung
 * über die Server Action – ohne Zwischenstand, sonst gleich.
 *
 * Ruft ausschließlich die eigene Anwendung auf, nie einen fremden Dienst.
 */

export type PublishMode = "publish" | "retry" | "republish";
export type PublishActionResult = Awaited<ReturnType<typeof publishDraft>>;

/** Die Schritte, wie die Oberfläche sie benennt. */
export const PUBLISH_PHASE_LABELS: Record<InstagramPublishPhase, string> = {
  images: "Bilder werden vorbereitet …",
  carousel: "Carousel wird erstellt …",
  publish: "Beitrag wird veröffentlicht …",
};

const PUBLISH_ROUTE = (draftId: string) => `/api/admin/social/drafts/${draftId}/publish`;

function viaServerAction(draftId: string, mode: PublishMode): Promise<PublishActionResult> {
  if (mode === "retry") return retryPublish(draftId);
  if (mode === "republish") return republishDeletedDraft(draftId);
  return publishDraft(draftId);
}

export async function publishWithProgress(
  draftId: string,
  mode: PublishMode,
  onPhase: (phase: InstagramPublishPhase) => void,
  fetcher: typeof fetch = fetch,
): Promise<PublishActionResult> {
  let response: Response;
  try {
    response = await fetcher(PUBLISH_ROUTE(draftId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  } catch {
    return viaServerAction(draftId, mode);
  }
  if (!response.ok || !response.body) return viaServerAction(draftId, mode);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result: PublishActionResult | null = null;

  const handle = (event: unknown) => {
    if (typeof event !== "object" || event === null) return;
    if ("phase" in event) onPhase(event.phase as InstagramPublishPhase);
    else if ("result" in event) result = event.result as PublishActionResult;
  };

  // Zeilen sofort verarbeiten, sobald sie ankommen – nicht erst am Ende.
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lastNewline = buffered.lastIndexOf("\n");
    if (lastNewline < 0) continue;
    parseNdjsonChunks([buffered.slice(0, lastNewline)], handle);
    buffered = buffered.slice(lastNewline + 1);
  }
  parseNdjsonChunks([buffered], handle);

  if (result) return result;
  // Die Verbindung riss, bevor das Ergebnis kam. Serverseitig läuft die
  // Veröffentlichung weiter; die Seite zeigt nach dem Neuladen den Stand.
  return {
    ok: false,
    error:
      "Die Verbindung wurde unterbrochen, bevor Instagram geantwortet hat. " +
      "Bitte laden Sie die Seite neu – der Beitrag wird nicht doppelt veröffentlicht.",
    code: "SERVICE_UNAVAILABLE",
  };
}
