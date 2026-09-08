import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import nextConfig from "../next.config";
import { sanitizeUploadFilename } from "@/integrations/storage/types";

/**
 * Regressionstests zum Sicherheitsaudit vom 08.09.2026.
 *
 * Jeder Block hier gehört zu einem Befund, der tatsächlich nachgewiesen
 * wurde – nicht zu einer allgemeinen Empfehlung. Der schwerste war, dass das
 * Rate Limit der Anmeldung umgangen werden konnte: Auth.js stellt unter
 * /api/auth/callback/credentials einen eigenen Endpunkt bereit, der
 * `authorize()` direkt aufruft und dabei an `loginAction` vorbeigeht. In der
 * Messung liefen 25 Rateversuche durch, ohne dass ein einziger Zähler
 * entstand; mit dem richtigen Passwort kam am Ende eine gültige Sitzung für
 * /admin/dashboard heraus.
 */

// ---------------------------------------------------------------------------
// Wer ist der Absender? – Grundlage jedes Limits
// ---------------------------------------------------------------------------

describe("Zuordnung der Anfrage zu einem Zähler", () => {
  /**
   * `@/lib/rate-limit` zieht über Prisma eine Datenbankverbindung nach sich,
   * die beim Import bereits eine DATABASE_URL erwartet. Die Testsuite setzt
   * bewusst keine Datenbank voraus – deshalb derselbe Weg wie in
   * tests/instagram-integration.test.ts: Wert setzen, dynamisch importieren,
   * danach zurücksetzen.
   */
  async function loadRateLimit() {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL ??= "postgresql://localhost:5432/autotal_test";

    const rateLimit = await import("@/lib/rate-limit");

    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;

    return rateLimit;
  }

  it("bevorzugt die von der Plattform gesetzte Adresse vor der mitgeschickten", async () => {
    const { clientIdentifierFromHeaders } = await loadRateLimit();

    // So sieht ein Umgehungsversuch aus: Der Absender behauptet, jemand
    // anderes zu sein, um in einen frischen Zähler zu fallen.
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9",
      "x-vercel-forwarded-for": "198.51.100.4",
    });

    assert.equal(clientIdentifierFromHeaders(headers), "198.51.100.4");
  });

  it("nimmt x-real-ip vor x-forwarded-for", async () => {
    const { clientIdentifierFromHeaders } = await loadRateLimit();

    const headers = new Headers({
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.5",
    });

    assert.equal(clientIdentifierFromHeaders(headers), "198.51.100.5");
  });

  it("nimmt aus x-forwarded-for die erste Station", async () => {
    const { clientIdentifierFromHeaders } = await loadRateLimit();

    const headers = new Headers({
      "x-forwarded-for": "198.51.100.6, 203.0.113.1, 203.0.113.2",
    });

    assert.equal(clientIdentifierFromHeaders(headers), "198.51.100.6");
  });

  it("fällt ohne jede Angabe auf einen gemeinsamen Zähler zurück", async () => {
    const { clientIdentifierFromHeaders } = await loadRateLimit();

    assert.equal(clientIdentifierFromHeaders(new Headers()), "unknown");
  });

  it("erkennt dieselbe Adresse unabhängig von Schreibweise, ohne sie zu speichern", async () => {
    const { hashIdentifier } = await loadRateLimit();

    const key = hashIdentifier("Admin@AutoTal.at");

    assert.equal(key, hashIdentifier("  admin@autotal.at "));
    assert.notEqual(key, hashIdentifier("anderer@autotal.at"));

    // Der Zähler muss die Adresse wiedererkennen, nicht kennen: In der
    // Tabelle darf nichts stehen, woraus sie sich ablesen lässt.
    assert.ok(!key.includes("@"));
    assert.ok(!key.toLowerCase().includes("admin"));
    assert.ok(!key.toLowerCase().includes("autotal"));
  });

  it("begrenzt Anmeldungen nach Absender UND nach Konto", async () => {
    const { RATE_LIMITS } = await loadRateLimit();

    // Nach Absender allein hilft nicht gegen einen Angriff aus vielen
    // Adressen gegen dasselbe Konto (Credential Stuffing).
    assert.equal(RATE_LIMITS.loginCredentials.bucket, "login-credentials");
    assert.equal(RATE_LIMITS.loginAccount.bucket, "login-account");

    // Auf dem regulären Weg über das Formular soll weiterhin die
    // verständliche Meldung aus loginAction zuerst erscheinen – sonst
    // bekäme ein Admin, der sich vertippt hat, nur „Passwort falsch“.
    assert.ok(
      RATE_LIMITS.loginCredentials.limit > RATE_LIMITS.login.limit,
      "loginCredentials muss lockerer sein als die Vorprüfung in loginAction",
    );
  });
});

// ---------------------------------------------------------------------------
// Das Limit muss dort sitzen, wo das Passwort geprüft wird
// ---------------------------------------------------------------------------

describe("Anmeldung ist auf jedem Weg begrenzt", () => {
  /**
   * Hier wird der Quelltext geprüft und nicht ausgeführt – so wie in
   * tests/seed-production-safety.test.ts und aus demselben Grund: `authorize()`
   * ist Teil des NextAuth()-Aufrufs und nicht einzeln exportiert; ein echter
   * Aufruf bräuchte Datenbank und HTTP-Schicht, die die Testsuite bewusst
   * nicht voraussetzt. Der Nachweis der Wirkung wurde stattdessen live gegen
   * einen laufenden Server geführt (siehe Dateikopf).
   *
   * Die Zusicherungen gehen deshalb über ein blosses „kommt vor“ hinaus und
   * prüfen die Reihenfolge: Ein Limit, das erst NACH dem Passwortvergleich
   * greift, wäre wertlos.
   */
  const auth = readFileSync("src/lib/auth.ts", "utf8");

  function authorizeBody(): string {
    const start = auth.indexOf("async authorize(");
    assert.notEqual(start, -1, "authorize() wurde umbenannt oder entfernt");

    const end = auth.indexOf("\n      },", start);
    assert.notEqual(end, -1, "Ende von authorize() nicht gefunden");

    return auth.slice(start, end);
  }

  it("prüft das Limit im Credentials-Provider, nicht nur in der Server Action", () => {
    assert.match(authorizeBody(), /checkRateLimit\(\s*RATE_LIMITS\.loginCredentials/);
    assert.match(authorizeBody(), /checkRateLimit\(\s*RATE_LIMITS\.loginAccount/);
  });

  it("begrenzt, bevor das Passwort verglichen wird", () => {
    const body = authorizeBody();

    const limit = body.indexOf("RATE_LIMITS.loginCredentials");
    const compare = body.indexOf("bcrypt.compare");

    assert.notEqual(limit, -1);
    assert.notEqual(compare, -1);
    assert.ok(
      limit < compare,
      "Das Rate Limit muss vor dem Passwortvergleich greifen",
    );
  });

  it("verrät im Log nicht, welche Adresse betroffen war", () => {
    const body = authorizeBody();

    // Der Zählerschlüssel ist bereits gehasht; die Adresse selbst darf auch
    // nicht über den Logkontext hinausgehen.
    assert.ok(!/logger\.\w+\([^)]*\bemail\b/.test(body));
  });
});

// ---------------------------------------------------------------------------
// Hochgeladene Dateinamen
// ---------------------------------------------------------------------------

describe("Dateinamen aus dem Upload", () => {
  it("führt nicht aus dem vorgesehenen Ablagepfad heraus", () => {
    assert.equal(sanitizeUploadFilename("../../woanders.jpg"), "woanders.jpg");
    assert.equal(sanitizeUploadFilename("a/b/c/bild.png"), "bild.png");
    assert.equal(sanitizeUploadFilename("..\\..\\bild.png"), "bild.png");
  });

  it("lässt einen gewöhnlichen Namen unverändert", () => {
    assert.equal(sanitizeUploadFilename("IMG_1234.jpg"), "IMG_1234.jpg");
    assert.equal(sanitizeUploadFilename("golf-vii-2.0-tdi.webp"), "golf-vii-2.0-tdi.webp");
  });

  it("ersetzt Zeichen, die die spätere URL zerlegen würden", () => {
    const result = sanitizeUploadFilename("bild?a=1#top .jpg");

    assert.ok(!result.includes("?"));
    assert.ok(!result.includes("#"));
    assert.ok(!result.includes(" "));
  });

  it("erzeugt auch beim Kürzen keine versteckte Datei und nie einen leeren Namen", () => {
    // Nach dem Abschneiden auf 80 Zeichen darf kein führender Punkt
    // übrigbleiben – sonst entstünde eine Punktdatei.
    const long = `${"x".repeat(200)}.${"y".repeat(79)}`;
    assert.ok(!sanitizeUploadFilename(long).startsWith("."));

    assert.equal(sanitizeUploadFilename("..."), "bild");
    assert.equal(sanitizeUploadFilename(""), "bild");
    assert.equal(sanitizeUploadFilename("///"), "bild");
  });
});

// ---------------------------------------------------------------------------
// Sicherheitskopfzeilen
// ---------------------------------------------------------------------------

describe("Sicherheitskopfzeilen", () => {
  async function headerRules() {
    assert.ok(nextConfig.headers, "next.config.ts liefert keine headers()");
    return nextConfig.headers();
  }

  function policyFor(
    rules: Awaited<ReturnType<NonNullable<typeof nextConfig.headers>>>,
    source: string,
  ): string {
    const rule = rules.find((entry) => entry.source === source);
    assert.ok(rule, `Keine Regel für ${source}`);

    const csp = rule.headers.find(
      (header) => header.key === "Content-Security-Policy",
    );
    assert.ok(csp, `Keine CSP für ${source}`);

    return csp.value;
  }

  it("schützt jede Seite vor <base>-Umlenkung und eingebetteten Objekten", async () => {
    const policy = policyFor(await headerRules(), "/:path*");

    assert.match(policy, /base-uri 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /upgrade-insecure-requests/);
  });

  it("erlaubt das Einbetten der öffentlichen Seiten nur der eigenen Domain", async () => {
    assert.match(policyFor(await headerRules(), "/:path*"), /frame-ancestors 'self'/);
  });

  it("verbietet das Einbetten der Verwaltung vollständig", async () => {
    const policy = policyFor(await headerRules(), "/admin/:path*");

    assert.match(policy, /frame-ancestors 'none'/);
    // Ein eingeschleustes Formular darf Kundendaten nicht nach außen senden.
    assert.match(policy, /form-action 'self'/);
  });

  it("verliert im Adminbereich die allgemeinen Direktiven nicht", async () => {
    // Next.js ERSETZT bei gleichem Schlüssel den Wert der allgemeineren
    // Regel, statt ihn zu ergänzen. Ohne Wiederholung stünde ausgerechnet
    // der sensibelste Bereich ohne base-uri und object-src da.
    const policy = policyFor(await headerRules(), "/admin/:path*");

    assert.match(policy, /base-uri 'self'/);
    assert.match(policy, /object-src 'none'/);
  });

  it("setzt weiterhin HSTS, nosniff und eine zurückhaltende Referrer-Policy", async () => {
    const rules = await headerRules();
    const rule = rules.find((entry) => entry.source === "/:path*");
    assert.ok(rule);

    const byKey = new Map(rule.headers.map((h) => [h.key, h.value]));

    assert.equal(byKey.get("X-Content-Type-Options"), "nosniff");
    assert.match(byKey.get("Strict-Transport-Security") ?? "", /max-age=63072000/);
    assert.equal(
      byKey.get("Referrer-Policy"),
      "strict-origin-when-cross-origin",
    );
  });
});
