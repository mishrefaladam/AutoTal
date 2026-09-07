import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { UserFacingError } from "@/lib/result";
import {
  INSTAGRAM_GRAPH_API_VERSION,
  INSTAGRAM_REQUIRED_SCOPES,
  buildInstagramAuthorizationUrl,
  createInstagramImageContainer,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  getInstagramMediaPermalink,
  getInstagramProfile,
  getInstagramPublishingLimit,
  hasRequiredInstagramScopes,
  publishInstagramImageContainer,
  refreshInstagramLongLivedToken,
  requireInstagramApiConfig,
} from "@/integrations/instagram/protocol";

const CONFIG = {
  appId: "instagram-app-id",
  appSecret: "instagram-app-secret",
  redirectUri: "https://autotal.at/api/integrations/instagram/callback",
};

type MockResponse = {
  body: unknown;
  status?: number;
};

function createFetchSequence(responses: MockResponse[]) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];

  const fetcher = (async (
    input: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url =
      input instanceof Request
        ? new URL(input.url)
        : new URL(input instanceof URL ? input.toString() : input);
    calls.push({ url, init });

    const response = responses.shift();
    assert.ok(response, `Unerwarteter Fetch-Aufruf: ${url.toString()}`);

    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return { fetcher, calls };
}

describe("Instagram OAuth mit Instagram Login", () => {
  it("baut die direkte Instagram-URL mit exakt den neuen Scopes", () => {
    const url = new URL(buildInstagramAuthorizationUrl(CONFIG, "csrf-state"));

    assert.equal(url.origin, "https://www.instagram.com");
    assert.equal(url.pathname, "/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), CONFIG.appId);
    assert.equal(url.searchParams.get("redirect_uri"), CONFIG.redirectUri);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "csrf-state");
    assert.equal(url.searchParams.get("enable_fb_login"), "0");
    assert.deepEqual(
      url.searchParams.get("scope")?.split(","),
      [...INSTAGRAM_REQUIRED_SCOPES],
    );
  });

  it("verlangt alle drei Environment-Werte", () => {
    for (const config of [
      {},
      { appId: "id" },
      { appId: "id", appSecret: "secret" },
    ]) {
      assert.throws(
        () => requireInstagramApiConfig(config),
        (error) =>
          error instanceof UserFacingError && error.code === "NOT_CONFIGURED",
      );
    }

    assert.deepEqual(requireInstagramApiConfig(CONFIG), CONFIG);
  });

  it("tauscht den Callback-Code serverseitig gegen das kurzlebige Token", async () => {
    const { fetcher, calls } = createFetchSequence([
      {
        body: {
          data: [
            {
              access_token: "short-lived-token",
              user_id: 178414000000001,
              permissions: INSTAGRAM_REQUIRED_SCOPES.join(","),
            },
          ],
        },
      },
    ]);

    const result = await exchangeInstagramAuthorizationCode(
      CONFIG,
      "authorization-code",
      fetcher,
    );

    assert.deepEqual(result, {
      accessToken: "short-lived-token",
      userId: "178414000000001",
      scopes: [...INSTAGRAM_REQUIRED_SCOPES],
    });
    assert.equal(calls[0].url.toString(), "https://api.instagram.com/oauth/access_token");
    assert.equal(calls[0].init.method, "POST");
    assert.ok(calls[0].init.body instanceof FormData);
    assert.equal(calls[0].init.body.get("grant_type"), "authorization_code");
    assert.equal(calls[0].init.body.get("client_secret"), CONFIG.appSecret);
    assert.equal(calls[0].init.body.get("code"), "authorization-code");
  });

  it("lehnt unvollständig erteilte Scopes ab", async () => {
    const { fetcher } = createFetchSequence([
      {
        body: {
          data: [
            {
              access_token: "short-lived-token",
              user_id: "ig-user",
              permissions: "instagram_business_basic",
            },
          ],
        },
      },
    ]);

    await assert.rejects(
      exchangeInstagramAuthorizationCode(CONFIG, "code", fetcher),
      (error) =>
        error instanceof UserFacingError && error.code === "UNAUTHORIZED",
    );
  });
});

describe("Instagram Token-Lifecycle", () => {
  it("erzeugt ein Long-Lived Instagram-Token", async () => {
    const { fetcher, calls } = createFetchSequence([
      { body: { access_token: "long-lived-token", expires_in: 5_184_000 } },
    ]);

    const token = await exchangeInstagramLongLivedToken(
      CONFIG.appSecret,
      "short-lived-token",
      fetcher,
    );

    assert.deepEqual(token, {
      accessToken: "long-lived-token",
      expiresIn: 5_184_000,
    });
    assert.equal(calls[0].url.origin, "https://graph.instagram.com");
    assert.equal(calls[0].url.pathname, "/access_token");
    assert.equal(calls[0].url.searchParams.get("grant_type"), "ig_exchange_token");
  });

  it("erneuert ein Long-Lived Token über den Instagram-Endpunkt", async () => {
    const { fetcher, calls } = createFetchSequence([
      { body: { access_token: "renewed-token", expires_in: 5_184_000 } },
    ]);

    const token = await refreshInstagramLongLivedToken("old-token", fetcher);

    assert.equal(token.accessToken, "renewed-token");
    assert.equal(calls[0].url.pathname, "/refresh_access_token");
    assert.equal(calls[0].url.searchParams.get("grant_type"), "ig_refresh_token");
    assert.equal(calls[0].url.searchParams.get("access_token"), "old-token");
  });

  it("erkennt neue und Legacy-Credentials anhand der Scopes", () => {
    assert.equal(
      hasRequiredInstagramScopes([...INSTAGRAM_REQUIRED_SCOPES]),
      true,
    );
    assert.equal(
      hasRequiredInstagramScopes([
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
      ]),
      false,
    );
    assert.equal(hasRequiredInstagramScopes([]), false);
  });
});

describe("Instagram Account und Publishing", () => {
  it("ermittelt User ID und Username direkt über /me", async () => {
    const { fetcher, calls } = createFetchSequence([
      {
        body: {
          data: [{ user_id: "178414000000001", username: "autotal.at" }],
        },
      },
    ]);

    const profile = await getInstagramProfile("long-lived-token", fetcher);

    assert.deepEqual(profile, {
      userId: "178414000000001",
      username: "autotal.at",
    });
    assert.equal(
      calls[0].url.pathname,
      `/${INSTAGRAM_GRAPH_API_VERSION}/me`,
    );
    assert.equal(calls[0].url.searchParams.get("fields"), "user_id,username");
    assert.equal(
      new Headers(calls[0].init.headers).get("authorization"),
      "Bearer long-lived-token",
    );
  });

  it("liest das Publishing-Limit aus der echten API-Antwort", async () => {
    const { fetcher } = createFetchSequence([
      {
        body: {
          data: [
            {
              quota_usage: 7,
              config: { quota_total: 100, quota_duration: 86_400 },
            },
          ],
        },
      },
    ]);

    assert.deepEqual(
      await getInstagramPublishingLimit("ig-user", "token", fetcher),
      { usage: 7, total: 100, durationSeconds: 86_400 },
    );
  });

  it("verwendet media und media_publish auf graph.instagram.com", async () => {
    const { fetcher, calls } = createFetchSequence([
      { body: { id: "container-id" } },
      { body: { id: "published-media-id" } },
      { body: { permalink: "https://www.instagram.com/p/example/" } },
    ]);

    const containerId = await createInstagramImageContainer(
      "ig-user",
      "token",
      { imageUrl: "https://autotal.at/car.jpg", caption: "Fahrzeug" },
      fetcher,
    );
    const mediaId = await publishInstagramImageContainer(
      "ig-user",
      "token",
      containerId,
      fetcher,
    );
    const permalink = await getInstagramMediaPermalink(mediaId, "token", fetcher);

    assert.equal(containerId, "container-id");
    assert.equal(mediaId, "published-media-id");
    assert.equal(permalink, "https://www.instagram.com/p/example/");
    assert.deepEqual(
      calls.map(({ url }) => [url.origin, url.pathname]),
      [
        ["https://graph.instagram.com", `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media`],
        [
          "https://graph.instagram.com",
          `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media_publish`,
        ],
        [
          "https://graph.instagram.com",
          `/${INSTAGRAM_GRAPH_API_VERSION}/published-media-id`,
        ],
      ],
    );
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[1].init.method, "POST");
  });
});

describe("Sicherheits- und Callback-Verdrahtung", () => {
  const integration = readFileSync("src/integrations/instagram/index.ts", "utf8");
  const protocol = readFileSync("src/integrations/instagram/protocol.ts", "utf8");
  const callback = readFileSync(
    "src/app/api/integrations/instagram/callback/route.ts",
    "utf8",
  );
  const actions = readFileSync(
    "src/modules/social/instagram-actions.ts",
    "utf8",
  );
  const adminUi = readFileSync(
    "src/components/admin/integrations-panel.tsx",
    "utf8",
  );

  it("behält Admin- und state/CSRF-Prüfung vor dem Token-Tausch", () => {
    const sessionCheck = callback.indexOf("getAdminSession()");
    const stateCheck = callback.indexOf("safeCompare(state, expectedState)");
    const exchange = callback.indexOf("exchangeInstagramCode(code)");

    assert.ok(sessionCheck >= 0);
    assert.ok(stateCheck > sessionCheck);
    assert.ok(exchange > stateCheck);
    assert.match(actions, /httpOnly:\s*true/);
    assert.match(actions, /sameSite:\s*"lax"/);
    assert.match(actions, /secure:\s*process\.env\.NODE_ENV === "production"/);
  });

  it("speichert Tokens ausschließlich verschlüsselt und trennt nur explizit", () => {
    assert.match(integration, /encryptSecret\(input\.accessToken\)/);
    assert.match(integration, /accessTokenEncrypted/);
    assert.match(integration, /integrationCredential\.deleteMany/);
    assert.doesNotMatch(integration, /accessToken:\s*input\.accessToken/);
  });

  it("enthält keine Facebook-Page-Discovery oder alten Scopes mehr", () => {
    const runtime = `${integration}\n${protocol}`;

    for (const legacy of [
      "graph.facebook.com",
      "www.facebook.com",
      "/me/accounts",
      "pages_show_list",
      "business_management",
    ]) {
      assert.ok(!runtime.includes(legacy), `Legacy-Abhängigkeit gefunden: ${legacy}`);
    }

    assert.doesNotMatch(adminUi, /zu Facebook|Facebook-Seite erforderlich/);
  });

  it("erkennt Legacy-Credentials, statt sie automatisch zu löschen", () => {
    assert.match(integration, /hasRequiredInstagramScopes\(stored\.scopes\)/);
    assert.match(integration, /tokenStatus:\s*"legacy"/);
    assert.match(adminUi, /Neu verbinden erforderlich/);
  });

  it("dokumentiert den vorerst einzelnen Bild-Post", () => {
    const readme = readFileSync("src/integrations/instagram/README.md", "utf8");
    assert.match(
      readme,
      /Instagram Carousel \/ mehrere Bilder sind noch nicht implementiert/,
    );
  });

  it("verschlüsselt und entschlüsselt ein Token ohne Klartextspeicherung", async () => {
    const previous = {
      databaseUrl: process.env.DATABASE_URL,
      authSecret: process.env.AUTH_SECRET,
      encryptionKey: process.env.ENCRYPTION_KEY,
    };

    process.env.DATABASE_URL ??= "postgresql://localhost:5432/autotal_test";
    process.env.AUTH_SECRET ??= "test-auth-secret-with-minimum-length";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { decryptSecret, encryptSecret } = await import("@/lib/crypto");

    const encrypted = encryptSecret("instagram-access-token");
    assert.notEqual(encrypted, "instagram-access-token");
    assert.ok(!encrypted.includes("instagram-access-token"));
    assert.equal(decryptSecret(encrypted), "instagram-access-token");

    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.authSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous.authSecret;
    if (previous.encryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous.encryptionKey;
    resetEnvCache();
  });
});
