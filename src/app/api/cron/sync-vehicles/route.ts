import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { safeCompare } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { pruneRateLimitCounters } from "@/lib/rate-limit";
import { syncVehicles } from "@/modules/vehicles/sync";

/**
 * Geplante Fahrzeugsynchronisierung (US-06).
 *
 * Aufruf per Vercel Cron oder externem Scheduler:
 *   POST /api/cron/sync-vehicles
 *   Authorization: Bearer <SYNC_CRON_SECRET>
 *
 * Ohne gesetztes SYNC_CRON_SECRET ist der Endpunkt deaktiviert. Ein
 * ungeschützter Sync-Endpunkt wäre eine Einladung, die Anwendung durch
 * wiederholte Aufrufe lahmzulegen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Der Sync kann bei großen Beständen dauern. */
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = env().SYNC_CRON_SECRET;

  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  return token.length > 0 && safeCompare(token, secret);
}

export async function POST(request: NextRequest) {
  if (!env().SYNC_CRON_SECRET) {
    logger.warn("Cron-Sync aufgerufen, aber SYNC_CRON_SECRET ist nicht gesetzt");

    return NextResponse.json(
      {
        error:
          "Der Endpunkt ist nicht eingerichtet. Bitte SYNC_CRON_SECRET setzen.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    logger.warn("Cron-Sync ohne gültiges Token abgewiesen");
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const result = await syncVehicles({ triggeredBy: "cron" });
  await pruneRateLimitCounters();

  if (result.status !== "FAILED") {
    revalidatePath("/", "layout");
    revalidatePath("/fahrzeuge", "page");
    revalidatePath("/fahrzeuge/[slug]", "page");
    revalidatePath("/sitemap.xml");
  }

  return NextResponse.json(
    {
      status: result.status,
      source: result.source,
      vehiclesFound: result.vehiclesFound,
      vehiclesCreated: result.vehiclesCreated,
      vehiclesUpdated: result.vehiclesUpdated,
      vehiclesDeactivated: result.vehiclesDeactivated,
      error: result.errorMessage,
    },
    { status: result.status === "FAILED" ? 500 : 200 },
  );
}

/** Vercel Cron sendet GET – derselbe Ablauf. */
export async function GET(request: NextRequest) {
  return POST(request);
}
