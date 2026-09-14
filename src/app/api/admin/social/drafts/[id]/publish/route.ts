import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import type { InstagramPublishPhase } from "@/integrations/instagram/protocol";
import { logger } from "@/lib/logger";
import { getAdminSession } from "@/modules/admin/auth";
import {
  publishDraft,
  republishDeletedDraft,
  retryPublish,
} from "@/modules/social/actions";

/**
 * Veröffentlichung mit Zwischenstand.
 *
 * Eine Server Action antwortet erst am Ende; bei einem Carousel sind das
 * 20 Sekunden und mehr, in denen der Händler nur einen Spinner sieht. Diese
 * Route ruft dieselben Actions auf – mit allen Gates und dem Doppelpost-
 * Schutz – und schreibt den Beginn jedes Schritts als NDJSON-Zeile in die
 * Antwort, sobald er tatsächlich beginnt:
 *
 *   {"phase":"images"}     Bilder werden vorbereitet
 *   {"phase":"carousel"}   Carousel wird erstellt
 *   {"phase":"publish"}    Beitrag wird veröffentlicht
 *   {"result":{…}}         das ActionResult, wie es die Action liefert
 *
 * Kein geschätzter Fortschritt, keine Prozentwerte. Bricht die Verbindung
 * ab, läuft die Veröffentlichung serverseitig weiter; die Sperre am Entwurf
 * und die sofort gespeicherte Media-ID verhindern einen zweiten Beitrag.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  mode: z.enum(["publish", "retry", "republish"]).default("publish"),
});

type PublishEvent =
  | { phase: InstagramPublishPhase }
  | { result: Awaited<ReturnType<typeof publishDraft>> };

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/admin/social/drafts/[id]/publish">,
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id: draftId } = await context.params;

  let mode: z.infer<typeof bodySchema>["mode"];
  try {
    mode = bodySchema.parse(await request.json().catch(() => ({}))).mode;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PublishEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const hooks = { onPhase: (phase: InstagramPublishPhase) => send({ phase }) };

      try {
        const result =
          mode === "retry"
            ? await retryPublish(draftId, hooks)
            : mode === "republish"
              ? await republishDeletedDraft(draftId, hooks)
              : await publishDraft(draftId, hooks);
        send({ result });
      } catch (error) {
        // Die Actions fangen selbst alles ab; das hier ist der letzte Halt.
        logger.error("Veröffentlichung mit Zwischenstand abgebrochen", {
          draftId,
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        send({
          result: {
            ok: false,
            error: "Die Veröffentlichung ist fehlgeschlagen. Bitte laden Sie die Seite neu.",
            code: "SERVICE_UNAVAILABLE",
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Kein Puffern durch Proxies – jede Zeile soll sofort ankommen.
      "x-accel-buffering": "no",
    },
  });
}
