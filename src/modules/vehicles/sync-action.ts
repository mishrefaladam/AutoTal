"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { pruneRateLimitCounters } from "@/lib/rate-limit";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";

import { syncVehicles } from "./sync";

/**
 * Manuelle Fahrzeugsynchronisierung aus dem Admin (US-27).
 *
 * Nach einem erfolgreichen Lauf werden alle Seiten neu validiert, auf denen
 * Fahrzeuge erscheinen – sonst zeigt die Website bis zum Ablauf der
 * Cache-Frist noch den alten Bestand.
 */
export async function triggerVehicleSync(): Promise<
  ActionResult<{ message: string }>
> {
  try {
    const admin = await requireAdminForAction();

    const result = await syncVehicles({ triggeredBy: "manual" });

    // Gelegenheit zum Aufräumen: abgelaufene Rate-Limit-Zähler entfernen.
    await pruneRateLimitCounters();

    if (result.status === "FAILED") {
      return fail(
        result.errorMessage ??
          "Die Synchronisierung ist fehlgeschlagen. Details siehe Protokoll unten.",
        { code: "SERVICE_UNAVAILABLE" },
      );
    }

    revalidatePath("/", "layout");
    revalidatePath("/fahrzeuge", "page");
    revalidatePath("/fahrzeuge/[slug]", "page");
    revalidatePath("/sitemap.xml");

    logger.info("Manuelle Synchronisierung ausgeführt", { userId: admin.id });

    const summary =
      `${result.vehiclesFound} Fahrzeuge gefunden · ` +
      `${result.vehiclesCreated} neu · ` +
      `${result.vehiclesUpdated} aktualisiert · ` +
      `${result.vehiclesDeactivated} deaktiviert.`;

    if (result.status === "PARTIAL") {
      return fail(
        `Die Synchronisierung lief nur teilweise durch. ${result.errorMessage ?? ""}`.trim(),
        { code: "SERVICE_UNAVAILABLE" },
      );
    }

    return ok({ message: `Synchronisierung abgeschlossen: ${summary}` });
  } catch (error) {
    logger.error("Manuelle Synchronisierung fehlgeschlagen", { error });
    return toActionResult(error);
  }
}
