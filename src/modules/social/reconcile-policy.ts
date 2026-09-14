/**
 * Regeln für den Abgleich mit Instagram – ohne Datenbank und Netz, damit sie
 * sich isoliert prüfen lassen. Die Ausführung steht in reconcile.ts.
 */

/** Frisch veröffentlichte Beiträge werden noch nicht geprüft. */
export const RECONCILE_MIN_AGE_MS = 10 * 60 * 1000;
/** Ein Beitrag wird höchstens so oft automatisch geprüft. */
export const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;
/** Obergrenze an Instagram-Anfragen je Seitenaufruf. */
export const RECONCILE_MAX_PER_RUN = 20;
/** Gleichzeitige Anfragen an Instagram. */
export const RECONCILE_CONCURRENCY = 3;

/**
 * Welche Beiträge beim Seitenaufruf an der Reihe sind – als reine Abfrage,
 * damit sich die Drosselung ohne Instagram prüfen lässt.
 */
export function reconcileCandidatesWhere(now: Date) {
  return {
    status: "PUBLISHED" as const,
    externalPostId: { not: null },
    publishedAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
    OR: [
      { externalCheckedAt: null },
      { externalCheckedAt: { lt: new Date(now.getTime() - RECONCILE_INTERVAL_MS) } },
    ],
  };
}

export type ReconcileOutcome =
  | { state: "published"; permalink: string | null }
  | { state: "deleted" }
  | { state: "unknown"; reason: string; message: string };

export type ReconcileSummary = {
  checked: number;
  deleted: number;
  /** Grund, falls der Durchlauf vorzeitig endete. */
  stoppedBecause: string | null;
};

/**
 * Arbeitet die Kandidaten mit begrenzter Parallelität ab und hört auf, sobald
 * Instagram ein Zugangs- oder Limitproblem meldet – weitere Anfragen brächten
 * dasselbe Ergebnis, und bei einem Limit würden sie es verschlimmern.
 */
export async function runReconcileSweep<C>(
  candidates: readonly C[],
  reconcileOne: (candidate: C) => Promise<ReconcileOutcome>,
  concurrency = RECONCILE_CONCURRENCY,
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, deleted: 0, stoppedBecause: null };
  let next = 0;

  async function lane(): Promise<void> {
    while (next < candidates.length && summary.stoppedBecause === null) {
      const candidate = candidates[next];
      next += 1;

      const outcome = await reconcileOne(candidate);
      summary.checked += 1;
      if (outcome.state === "deleted") summary.deleted += 1;
      if (
        outcome.state === "unknown" &&
        (outcome.reason === "unauthorized" || outcome.reason === "rate-limited")
      ) {
        summary.stoppedBecause = outcome.reason;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, () => lane()),
  );
  return summary;
}
