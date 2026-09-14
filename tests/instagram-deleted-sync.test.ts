import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  InstagramApiRequestError,
  getInstagramMediaExistence,
} from "@/integrations/instagram/protocol";
import {
  RECONCILE_INTERVAL_MS,
  RECONCILE_MAX_PER_RUN,
  RECONCILE_MIN_AGE_MS,
  reconcileCandidatesWhere,
  runReconcileSweep,
  type ReconcileOutcome,
} from "@/modules/social/reconcile-policy";

/**
 * Abgleich mit Instagram: manuell in der App gelöschte Beiträge erkennen.
 *
 * Der Fetcher ist gefälscht. Entscheidend ist die Unterscheidung: Nur ein
 * eindeutiges "Medium nicht vorhanden" – bestätigt durch einen erfolgreichen
 * /me-Aufruf – gilt als Löschung. Alles andere lässt den Status stehen.
 */

const SECRET = "IGQVJ-super-secret-token";
const MEDIA_ID = "17895695668004550";

type MockResponse = { body: unknown; status?: number };

function createFetchSequence(responses: MockResponse[]) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `Unerwarteter Fetch-Aufruf: ${url.pathname}`);
    if (response.body instanceof Error) throw response.body;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

async function captureConsole<T>(callback: () => Promise<T>): Promise<{ result: T; output: string }> {
  const lines: string[] = [];
  const previous = { log: console.log, warn: console.warn, error: console.error };
  const record = (...args: unknown[]) =>
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  console.log = record;
  console.warn = record;
  console.error = record;
  try {
    return { result: await callback(), output: lines.join("\n") };
  } finally {
    Object.assign(console, previous);
  }
}

const metaError = (code: number, subcode: number | undefined, status: number, message: string) => ({
  status,
  body: {
    error: {
      type: "IGApiException",
      code,
      ...(subcode !== undefined ? { error_subcode: subcode } : {}),
      message,
      fbtrace_id: "trace",
    },
  },
});

const NOT_FOUND = metaError(
  100,
  33,
  400,
  `Unsupported get request. Object with ID '${MEDIA_ID}' does not exist, cannot be loaded due to missing permissions, or does not support this operation`,
);
const ME_OK = { body: { user_id: "1789", username: "autotal.at" } };

// ---------------------------------------------------------------------------
// 1–7: Existenzprüfung
// ---------------------------------------------------------------------------

describe("Instagram-Existenzprüfung", () => {
  it("1. Medium existiert → exists, mit Permalink", async () => {
    const { fetcher, calls } = createFetchSequence([
      { body: { id: MEDIA_ID, permalink: "https://www.instagram.com/p/abc/" } },
    ]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.deepEqual(result, { state: "exists", permalink: "https://www.instagram.com/p/abc/" });

    // Genau ein GET mit minimalen Feldern.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].url.pathname.endsWith(`/${MEDIA_ID}`), true);
    assert.equal(calls[0].url.searchParams.get("fields"), "id,permalink");
  });

  it("2. Medium eindeutig nicht vorhanden (100/33) und Zugang bestätigt → missing", async () => {
    const { fetcher, calls } = createFetchSequence([NOT_FOUND, ME_OK]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.deepEqual(result, { state: "missing" });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.pathname.endsWith("/me"), true, "Bestätigung über /me");
  });

  it("2b. HTTP 404 und Code 803 gelten ebenfalls als nicht vorhanden", async () => {
    for (const notFound of [
      metaError(100, undefined, 404, "not found"),
      metaError(803, undefined, 400, "Some of the aliases you requested do not exist"),
    ]) {
      const { fetcher } = createFetchSequence([notFound, ME_OK]);
      const { result } = await captureConsole(() =>
        getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
      );
      assert.equal(result.state, "missing");
    }
  });

  it("2c. 'nicht vorhanden', aber /me scheitert → unknown, keine Löschung", async () => {
    // Metas Meldung nennt "does not exist" und "missing permissions" in
    // einem Satz. Ohne bestätigten Zugang ist das kein Beweis.
    const { fetcher } = createFetchSequence([
      NOT_FOUND,
      metaError(190, undefined, 401, "Invalid OAuth access token"),
    ]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.equal(result.state, "unknown");
    assert.equal(result.state === "unknown" && result.reason, "unauthorized");
  });

  it("3. Token-Fehler → unknown/unauthorized", async () => {
    for (const tokenError of [
      metaError(190, undefined, 401, "Error validating access token: Session has expired"),
      metaError(200, undefined, 403, "Permissions error"),
    ]) {
      const { fetcher, calls } = createFetchSequence([tokenError]);
      const { result } = await captureConsole(() =>
        getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
      );
      assert.equal(result.state, "unknown");
      assert.equal(result.state === "unknown" && result.reason, "unauthorized");
      assert.match(result.state === "unknown" ? result.message : "", /Integrationen/);
      assert.equal(calls.length, 1, "kein weiterer Aufruf");
    }
  });

  it("4. Rate Limit → unknown/rate-limited", async () => {
    for (const limited of [
      metaError(4, undefined, 400, "Application request limit reached"),
      metaError(32, undefined, 429, "Page request limit reached"),
    ]) {
      const { fetcher } = createFetchSequence([limited]);
      const { result } = await captureConsole(() =>
        getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
      );
      assert.deepEqual(result.state === "unknown" && result.reason, "rate-limited");
    }
  });

  it("5. Meta 5xx → unknown/unavailable", async () => {
    const { fetcher } = createFetchSequence([metaError(2, undefined, 503, "Service temporarily unavailable")]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.equal(result.state === "unknown" && result.reason, "unavailable");
  });

  it("6. Netzwerkfehler → unknown/network", async () => {
    const { fetcher } = createFetchSequence([{ body: new TypeError("fetch failed") }]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.equal(result.state === "unknown" && result.reason, "network");
  });

  it("7. unbekannter API-Fehler → unknown/unknown", async () => {
    const { fetcher } = createFetchSequence([metaError(1, undefined, 400, "An unknown error occurred")]);
    const { result } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.equal(result.state === "unknown" && result.reason, "unknown");
  });

  it("13. schreibt das Token nicht ins Log", async () => {
    const { fetcher } = createFetchSequence([NOT_FOUND, metaError(190, undefined, 401, `bad token ${SECRET}`)]);
    const { output } = await captureConsole(() =>
      getInstagramMediaExistence(MEDIA_ID, SECRET, fetcher),
    );
    assert.ok(!output.includes(SECRET), "Token im Log");
    assert.ok(!/authorization/i.test(output));
  });

  it("kennt die Fehlerklasse und ihre Felder (Regression)", () => {
    const error = new InstagramApiRequestError("x", "SERVICE_UNAVAILABLE", {
      operation: "GET /x",
      status: 400,
      apiCode: 100,
      errorSubcode: 33,
    });
    assert.equal(error.apiCode, 100);
    assert.equal(error.errorSubcode, 33);
  });
});

// ---------------------------------------------------------------------------
// Reconcile-Modul, Actions, UI – strukturell
// ---------------------------------------------------------------------------

const reconcile = readFileSync("src/modules/social/reconcile.ts", "utf8");
const actions = readFileSync("src/modules/social/actions.ts", "utf8");
const manager = readFileSync("src/components/admin/social-media-manager.tsx", "utf8");
const page = readFileSync("src/app/admin/(protected)/social-media/page.tsx", "utf8");
const protocol = readFileSync("src/integrations/instagram/protocol.ts", "utf8");
const integration = readFileSync("src/integrations/instagram/index.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260914210500_social_draft_deleted_externally/migration.sql",
  "utf8",
);

function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} nicht gefunden`);
  const next = source.indexOf("\nexport async function ", start + 10);
  return source.slice(start, next < 0 ? undefined : next);
}

describe("Zentrale Sync-Funktion", () => {
  it("ändert den Status nur bei 'missing' – und nur aus PUBLISHED mit derselben Media-ID", () => {
    const fn = bodyOf(reconcile, "reconcilePublishedDraft");
    const missing = fn.slice(fn.indexOf('existence.state === "missing"'));
    assert.match(
      missing,
      /where: \{ id: draft\.id, status: "PUBLISHED", externalPostId: draft\.externalPostId \}/,
    );
    assert.match(missing, /status: "DELETED_EXTERNALLY"/);
    // Bei unknown wird nichts geschrieben.
    const unknown = fn.slice(fn.indexOf("// Unbekannt"));
    assert.ok(!/prisma\./.test(unknown), "kein Schreibzugriff bei unbekanntem Ausgang");
    // Nur eine Stelle setzt den Status; in den Actions kommt er nur als
    // Bedingung (where) vor.
    assert.equal((reconcile.match(/data: \{ status: "DELETED_EXTERNALLY"/g) ?? []).length, 1);
    assert.equal((actions.match(/data: \{[^}]*status: "DELETED_EXTERNALLY"/g) ?? []).length, 0);
  });

  it("löscht nie automatisch aus der Datenbank", () => {
    assert.ok(!/socialDraft\.delete/.test(reconcile));
  });
});

describe("14. Drosselung beim Seitenaufruf", () => {
  it("prüft nur veröffentlichte Beiträge mit Media-ID, älter als 10 Minuten, höchstens alle 30 Minuten", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const where = reconcileCandidatesWhere(now);
    assert.equal(where.status, "PUBLISHED");
    assert.deepEqual(where.externalPostId, { not: null });
    assert.equal(where.publishedAt.lt.getTime(), now.getTime() - RECONCILE_MIN_AGE_MS);
    assert.deepEqual(where.OR[0], { externalCheckedAt: null });
    assert.equal(where.OR[1].externalCheckedAt?.lt.getTime(), now.getTime() - RECONCILE_INTERVAL_MS);
    assert.equal(RECONCILE_MIN_AGE_MS, 10 * 60 * 1000);
    assert.equal(RECONCILE_INTERVAL_MS, 30 * 60 * 1000);
  });

  it("begrenzt die Anfragen je Aufruf und bricht bei Zugangs-/Limitproblemen ab", () => {
    assert.equal(RECONCILE_MAX_PER_RUN, 20);
    const fn = bodyOf(reconcile, "reconcilePublishedDrafts");
    assert.match(fn, /take: limit/);
    assert.match(fn, /Math\.min\(options\.limit \?\? RECONCILE_MAX_PER_RUN, RECONCILE_MAX_PER_RUN\)/);
    assert.match(fn, /orderBy: \{ publishedAt: "desc" \}/);
    assert.match(fn, /runReconcileSweep\(/);
    // Eine Abfrage für alle Kandidaten, kein Query je Beitrag.
    assert.equal((fn.match(/prisma\.socialDraft\.findMany/g) ?? []).length, 1);
  });

  it("hört nach einem Zugangs- oder Limitproblem sofort auf – der Rest wird nicht angefragt", async () => {
    const asked: number[] = [];
    const outcomes: ReconcileOutcome[] = [
      { state: "published", permalink: null },
      { state: "unknown", reason: "rate-limited", message: "Limit" },
      { state: "deleted" },
      { state: "deleted" },
      { state: "deleted" },
    ];
    const summary = await runReconcileSweep(
      [0, 1, 2, 3, 4],
      async (index) => {
        asked.push(index);
        return outcomes[index];
      },
      1,
    );
    assert.deepEqual(asked, [0, 1]);
    assert.deepEqual(summary, { checked: 2, deleted: 0, stoppedBecause: "rate-limited" });
  });

  it("zählt Ergebnisse, arbeitet höchstens drei gleichzeitig und läuft bei 5xx weiter", async () => {
    let running = 0;
    let peak = 0;
    const summary = await runReconcileSweep(
      Array.from({ length: 12 }, (_, i) => i),
      async (index) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
        if (index % 4 === 0) return { state: "unknown", reason: "unavailable", message: "5xx" };
        if (index % 4 === 1) return { state: "deleted" };
        return { state: "published", permalink: null };
      },
    );
    assert.equal(peak, 3);
    assert.deepEqual(summary, { checked: 12, deleted: 3, stoppedBecause: null });
  });

  it("schreibt externalCheckedAt nach jeder Prüfung mit Ergebnis", () => {
    const fn = bodyOf(reconcile, "reconcilePublishedDraft");
    assert.equal((fn.match(/externalCheckedAt: now\(\)/g) ?? []).length, 2);
  });

  it("läuft auf der Seite nur mit verbundenem Konto, vor dem Laden der Liste", () => {
    assert.match(page, /if \(connection\.connected\) \{\s*await reconcilePublishedDrafts\(\);/);
    assert.ok(page.indexOf("reconcilePublishedDrafts()") < page.indexOf("listSocialDrafts()"));
  });
});

describe("8. Oberfläche", () => {
  it("zeigt 'Auf Instagram gelöscht' mit Hinweis und beiden Aktionen", () => {
    assert.match(manager, /DELETED_EXTERNALLY: \{\s*label: "Auf Instagram gelöscht"/);
    assert.match(manager, /Der Beitrag wurde auf Instagram nicht mehr gefunden\./);
    assert.match(manager, /onClick=\{\(\) => publish\("republish"\)\}/);
    const client = readFileSync("src/modules/social/publish-client.ts", "utf8");
    assert.match(client, /if \(mode === "republish"\) return republishDeletedDraft\(draftId\);/);
    assert.match(manager, /Erneut veröffentlichen/);
    assert.match(manager, /deletedExternally \? "Aus AutoTal entfernen" : "Löschen"/);
  });

  it("tut nicht so, als wäre er noch online", () => {
    // Link und "Veröffentlicht am" nur für PUBLISHED; Bearbeiten weder für
    // veröffentlichte noch für gelöschte.
    assert.match(manager, /\{published && draft\.externalPermalink && \(/);
    assert.match(manager, /\{published && draft\.publishedAt && \(/);
    assert.match(manager, /\{!published && !deletedExternally && \(/);
  });

  it("9. bietet 'Instagram-Status prüfen' bei veröffentlichten Beiträgen", () => {
    assert.match(manager, /checkInstagramStatus\(draft\.id\)/);
    assert.match(manager, /Instagram-Status prüfen/);
    const check = bodyOf(actions, "checkInstagramStatus");
    assert.match(check, /reconcilePublishedDraft\(/);
    assert.match(check, /Der Beitrag ist weiterhin auf Instagram online\./);
  });
});

describe("Erneut veröffentlichen und Doppelpost-Schutz", () => {
  const republish = bodyOf(actions, "republishDeletedDraft");
  const publish = bodyOf(actions, "publishDraft");

  it("9. ist nur aus DELETED_EXTERNALLY möglich und bestätigt die Löschung erneut", () => {
    assert.match(republish, /draft\.status !== "DELETED_EXTERNALLY" \|\| !draft\.externalPostId/);
    assert.match(republish, /const existence = await checkInstagramMediaExists\(draft\.externalPostId\)/);
    // "doch noch da" → zurück auf PUBLISHED, kein Publish.
    assert.match(republish, /existence\.state === "exists"[\s\S]*?status: "PUBLISHED"/);
    // unbekannt → Abbruch ohne Änderung.
    assert.match(republish, /existence\.state === "unknown"[\s\S]*?return fail\(existence\.message/);
  });

  it("11. legt die alte Media-ID ab und veröffentlicht über den normalen Weg – neue ID wird gespeichert", () => {
    const release = republish.slice(republish.indexOf("const released"));
    assert.match(
      release,
      /where: \{ id: draftId, status: "DELETED_EXTERNALLY", externalPostId: draft\.externalPostId \}/,
    );
    assert.match(release, /externalPostId: null/);
    assert.match(release, /previousExternalPostIds: \[\.\.\.draft\.previousExternalPostIds, draft\.externalPostId\]/);
    assert.match(release, /status: "APPROVED"/);
    assert.match(release, /released\.count !== 1/);
    assert.match(release, /return publishDraft\(draftId, hooks\)/);
    // publishDraft speichert die neue ID sofort und setzt PUBLISHED.
    assert.match(publish, /data: \{ externalPostId: postId \}/);
    assert.match(publish, /externalPostId: result\.postId \?\? undefined/);
    assert.match(publish, /INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER/);
  });

  it("10. ein normaler PUBLISHED-Beitrag bleibt durch den externalPostId-Kurzschluss blockiert", () => {
    assert.match(publish, /if \(draft\.externalPostId\) \{[\s\S]*?Der Beitrag wurde bereits auf Instagram veröffentlicht\./);
    assert.ok(
      publish.indexOf("if (draft.externalPostId) {") < publish.indexOf("publishImagePost("),
    );
    // Und republish weist PUBLISHED ab, weil der Status nicht DELETED_EXTERNALLY ist.
    assert.match(republish, /Erneut veröffentlichen ist nur für Beiträge möglich, die auf Instagram/);
  });

  it("verhindert die Wiederbelebung eines gelöschten Beitrags über andere Actions", () => {
    // Vor dem Kurzschluss in publishDraft …
    assert.ok(
      publish.indexOf("deletedExternally(draft.status)") < publish.indexOf("if (draft.externalPostId) {"),
      "Prüfung vor dem externalPostId-Kurzschluss",
    );
    for (const name of ["updateDraft", "approveDraft", "revokeApproval", "retryPublish"]) {
      assert.match(bodyOf(actions, name), /deletedExternally\(draft\.status\)/, name);
    }
  });
});

describe("12. Kein Instagram-DELETE", () => {
  it("es gibt keine Funktion, die ein Medium über die API löscht", () => {
    for (const [name, source] of [
      ["protocol", protocol],
      ["integration", integration],
      ["reconcile", reconcile],
      ["actions", actions],
    ] as const) {
      assert.ok(!/"DELETE"/.test(source), `${name}: DELETE-Methode`);
      assert.ok(!/method:\s*["']DELETE["']/i.test(source), `${name}: DELETE-Request`);
    }
    assert.match(protocol, /method: "GET" \| "POST" = "GET"/);
  });
});

describe("Datenmodell", () => {
  it("erweitert den Status und ergänzt zwei Spalten – additiv, ohne Datenverlust", () => {
    assert.match(schema, /enum SocialDraftStatus \{[\s\S]*?DELETED_EXTERNALLY[\s\S]*?\}/);
    assert.match(schema, /externalCheckedAt\s+DateTime\?/);
    assert.match(schema, /previousExternalPostIds\s+String\[\]\s+@default\(\[\]\)/);
    assert.match(migration, /ADD VALUE IF NOT EXISTS 'DELETED_EXTERNALLY'/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "externalCheckedAt"/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "previousExternalPostIds"/);
    assert.ok(!/DROP|DELETE FROM|UPDATE /.test(migration));
  });
});
