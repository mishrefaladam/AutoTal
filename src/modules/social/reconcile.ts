import "server-only";

import {
  checkInstagramMediaExists,
  type InstagramMediaExistence,
} from "@/integrations/instagram";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  RECONCILE_MAX_PER_RUN,
  type ReconcileOutcome,
  type ReconcileSummary,
  reconcileCandidatesWhere,
  runReconcileSweep,
} from "./reconcile-policy";

export {
  RECONCILE_INTERVAL_MS,
  RECONCILE_MAX_PER_RUN,
  RECONCILE_MIN_AGE_MS,
  type ReconcileOutcome,
  type ReconcileSummary,
  reconcileCandidatesWhere,
} from "./reconcile-policy";

/**
 * Abgleich veröffentlichter Beiträge mit Instagram.
 *
 * PROBLEM: Ein über AutoTal veröffentlichter Beitrag wird in der
 * Instagram-App gelöscht. Ohne Abgleich stünde er hier für immer als
 * "Veröffentlicht" – mit einem toten Link.
 *
 * GRUNDSATZ: Nur ein eindeutiges "Medium nicht vorhanden" von Instagram
 * ändert den lokalen Zustand – auf DELETED_EXTERNALLY. Zugangsprobleme,
 * Limits, Ausfälle und Unbekanntes lassen den Beitrag als PUBLISHED stehen;
 * die Prüfung wird dann beim nächsten Mal wiederholt. Gelöscht wird in
 * AutoTal nie automatisch, und Instagram wird nie zum Löschen aufgefordert.
 *
 * DROSSELUNG (Seitenaufruf): Nicht jeder Aufruf von /admin/social-media darf
 * jeden Beitrag bei Meta nachfragen. Geprüft wird ein Beitrag erst, wenn er
 * länger als RECONCILE_MIN_AGE_MS veröffentlicht ist, und dann höchstens alle
 * RECONCILE_INTERVAL_MS (Spalte `externalCheckedAt`). Je Aufruf sind es
 * höchstens RECONCILE_MAX_PER_RUN Anfragen, die neuesten zuerst. Meldet
 * Instagram ein Zugangs- oder Limitproblem, endet der Durchlauf sofort.
 */

export const EXTERNALLY_DELETED_NOTICE =
  "Der Beitrag wurde auf Instagram nicht mehr gefunden.";

type PublishedDraft = {
  id: string;
  externalPostId: string;
  externalPermalink: string | null;
};

type Checker = (mediaId: string) => Promise<InstagramMediaExistence>;

/**
 * Gleicht einen veröffentlichten Beitrag ab und schreibt das Ergebnis.
 *
 * Die Statusänderung ist an den Zustand gebunden, den die Prüfung gesehen hat
 * (PUBLISHED, dieselbe Media-ID): Wurde der Beitrag inzwischen entfernt oder
 * anders verändert, greift der updateMany ins Leere.
 */
export async function reconcilePublishedDraft(
  draft: PublishedDraft,
  check: Checker = checkInstagramMediaExists,
  now: () => Date = () => new Date(),
): Promise<ReconcileOutcome> {
  const existence = await check(draft.externalPostId);

  if (existence.state === "exists") {
    await prisma.socialDraft.updateMany({
      where: { id: draft.id, status: "PUBLISHED", externalPostId: draft.externalPostId },
      data: {
        externalCheckedAt: now(),
        // Ein fehlender Permalink wird bei der Gelegenheit nachgetragen.
        ...(draft.externalPermalink === null && existence.permalink
          ? { externalPermalink: existence.permalink }
          : {}),
      },
    });
    return { state: "published", permalink: existence.permalink ?? draft.externalPermalink };
  }

  if (existence.state === "missing") {
    const changed = await prisma.socialDraft.updateMany({
      where: { id: draft.id, status: "PUBLISHED", externalPostId: draft.externalPostId },
      data: { status: "DELETED_EXTERNALLY", externalCheckedAt: now() },
    });
    if (changed.count === 1) {
      logger.info("Instagram-Beitrag extern gelöscht", { draftId: draft.id });
    }
    return { state: "deleted" };
  }

  // Unbekannt: nichts schreiben – auch kein externalCheckedAt, damit der
  // nächste Aufruf es erneut versucht.
  logger.warn("Instagram-Abgleich ohne Ergebnis", {
    draftId: draft.id,
    reason: existence.reason,
  });
  return { state: "unknown", reason: existence.reason, message: existence.message };
}

/**
 * Abgleich beim Öffnen der Social-Media-Seite: begrenzt, gedrosselt,
 * abbrechend bei Zugangs- und Limitproblemen.
 */
export async function reconcilePublishedDrafts(
  options: {
    check?: Checker;
    now?: () => Date;
    limit?: number;
  } = {},
): Promise<ReconcileSummary> {
  const now = options.now ?? (() => new Date());
  const limit = Math.min(options.limit ?? RECONCILE_MAX_PER_RUN, RECONCILE_MAX_PER_RUN);

  const candidates = await prisma.socialDraft.findMany({
    where: reconcileCandidatesWhere(now()),
    select: { id: true, externalPostId: true, externalPermalink: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  // Der Abgleich darf die Seite nie zu Fall bringen: Ein Fehler hier wird
  // protokolliert, die Liste erscheint mit dem letzten bekannten Stand.
  try {
    const summary = await runReconcileSweep(
      candidates.filter((c): c is typeof c & { externalPostId: string } => c.externalPostId !== null),
      (candidate) => reconcilePublishedDraft(candidate, options.check, now),
    );
    if (summary.checked > 0) {
      logger.info("Instagram-Abgleich abgeschlossen", summary);
    }
    return summary;
  } catch (error) {
    logger.error("Instagram-Abgleich abgebrochen", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { checked: 0, deleted: 0, stoppedBecause: "error" };
  }
}
