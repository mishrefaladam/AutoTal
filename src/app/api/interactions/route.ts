import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { RATE_LIMITS, checkRateLimitForRequest } from "@/lib/rate-limit";
import { parseInteractionChannel } from "@/modules/interactions/channels";
import { recordInteraction } from "@/modules/interactions/repository";

/**
 * Zählendpunkt für Klicks auf ausgehende Kontakt- und Plattformlinks.
 *
 * Wird per `navigator.sendBeacon` aus `InteractionLink` aufgerufen. Der Browser
 * schickt die Meldung im Hintergrund ab, während er die Seite bereits verlässt;
 * die Navigation wartet nicht darauf.
 *
 * WAS HIER NICHT PASSIERT – und zwar mit Absicht:
 *
 *   - Es entsteht KEIN CRM-Lead. Ein Klick ist keine Anfrage. Siehe
 *     src/modules/interactions/channels.ts.
 *   - Es wird nichts Personenbezogenes gespeichert: keine IP-Adresse, kein
 *     User-Agent, keine Kennung, kein genauer Zeitpunkt. Es landet
 *     ausschließlich ein „+1“ auf dem Tageszähler des Kanals.
 *
 * Die IP-Adresse wird für das Rate Limit kurzzeitig verarbeitet, aber nicht an
 * den Zähler weitergereicht – sie steht nur im bestehenden RateLimitCounter,
 * der ohnehin abläuft.
 *
 * Der Endpunkt ist öffentlich; er muss es sein, weil er von jeder Seite aus
 * erreichbar ist. Deshalb zählt er nur bekannte Kanäle und ist rate-limitiert.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Antwortet immer mit 204.
 *
 * Auch bei ungültiger Eingabe oder erreichtem Limit: Der Aufrufer ist ein
 * `sendBeacon`, das die Antwort ohnehin nicht auswertet. Ein aussagekräftiger
 * Fehlercode würde hier nur verraten, was der Endpunkt akzeptiert, ohne dass
 * jemand etwas davon hätte.
 */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return noContent();
    }

    const channel = parseInteractionChannel(
      (payload as { channel?: unknown } | null)?.channel,
    );

    // Unbekannter Kanal: still verwerfen. Der Zähler nimmt nur, was das Enum
    // kennt – sonst könnte jemand beliebige Kategorien in die Statistik
    // schreiben.
    if (!channel) return noContent();

    const limit = await checkRateLimitForRequest(RATE_LIMITS.interaction);
    if (!limit.allowed) return noContent();

    await recordInteraction(channel);

    return noContent();
  } catch (error) {
    // Ein Zählfehler darf nie sichtbar werden – die Statistik ist Beiwerk,
    // der Besucher ist längst unterwegs zur Zielseite.
    logger.error("Interaktion konnte nicht gezählt werden", { error });
    return noContent();
  }
}
