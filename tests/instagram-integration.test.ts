import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { UserFacingError } from "@/lib/result";
import {
  INSTAGRAM_GRAPH_API_VERSION,
  INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE,
  INSTAGRAM_PUBLISH_PERMISSION_MESSAGE,
  INSTAGRAM_REQUIRED_SCOPES,
  InstagramPublishOutcomeUnknownError,
  buildInstagramAuthorizationUrl,
  createInstagramImageContainer,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  getInstagramMediaPermalink,
  getInstagramProfile,
  getInstagramPublishingLimit,
  hasRequiredInstagramScopes,
  publishInstagramImage,
  publishInstagramImageContainer,
  refreshInstagramLongLivedToken,
  requireInstagramApiConfig,
} from "@/integrations/instagram/protocol";

const CONFIG = {
  appId: "instagram-app-id",
  appSecret: "instagram-app-secret",
  redirectUri: "https://autotal.at/api/integrations/instagram/callback",
};

const NO_WAIT = async () => undefined;

async function withMutedConsole<T>(callback: () => Promise<T>): Promise<T> {
  const previous = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;

  try {
    return await callback();
  } finally {
    console.log = previous.log;
    console.warn = previous.warn;
    console.error = previous.error;
  }
}

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

  it("prüft die Quote und veröffentlicht bei verfügbarem Kontingent", async () => {
    const { fetcher, calls } = createFetchSequence([
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
      { body: { id: "container-id" } },
      { body: { status_code: "FINISHED", status: "Container fertig" } },
      { body: { id: "published-media-id" } },
      { body: { permalink: "https://www.instagram.com/p/example/" } },
    ]);

    const result = await publishInstagramImage(
      {
        accountId: "ig-user",
        accessToken: "token",
        imageUrl: "https://autotal.at/car.jpg",
        caption: "Fahrzeug",
      },
      fetcher,
      { sleep: NO_WAIT },
    );

    assert.deepEqual(result, {
      postId: "published-media-id",
      permalink: "https://www.instagram.com/p/example/",
      alreadyPublished: false,
    });
    assert.deepEqual(
      calls.map(({ url }) => url.pathname),
      [
        `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/content_publishing_limit`,
        `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media`,
        `/${INSTAGRAM_GRAPH_API_VERSION}/container-id`,
        `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media_publish`,
        `/${INSTAGRAM_GRAPH_API_VERSION}/published-media-id`,
      ],
    );
  });

  it("blockiert nur bei einer tatsächlich ausgeschöpften Quote", async () => {
    const { fetcher, calls } = createFetchSequence([
      {
        body: {
          quota_usage: 100,
          config: { quota_total: 100, quota_duration: 86_400 },
        },
      },
    ]);

    await assert.rejects(
      publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
      ),
      (error) =>
        error instanceof UserFacingError && error.code === "RATE_LIMITED",
    );
    assert.equal(calls.length, 1);
  });

  it("protokolliert Meta Code 200 sicher und versucht danach /media", async () => {
    const secretToken = "never-log-this-access-token";
    const errors: string[] = [];
    const warnings: string[] = [];
    const previousError = console.error;
    const previousWarn = console.warn;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));

    try {
      const { fetcher, calls } = createFetchSequence([
        {
          status: 400,
          body: {
            error: {
              type: "IGApiException",
              code: 200,
              error_subcode: 2207013,
              message: `Permissions error for ${secretToken}`,
              error_user_title: "Veröffentlichung nicht möglich",
              error_user_msg: "Bitte Berechtigung erneut erteilen.",
              fbtrace_id: "safe-trace-id",
            },
          },
        },
        { body: { id: "container-id" } },
        { body: { status_code: "FINISHED", status: "Container fertig" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      const result = await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: secretToken,
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
        { sleep: NO_WAIT },
      );

      assert.equal(result.postId, "published-media-id");
      assert.equal(
        calls[1].url.pathname,
        `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media`,
      );

      const log = errors
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((entry) => entry.message === "Instagram-API hat einen Fehler gemeldet");
      assert.ok(log);
      assert.deepEqual(log.context, {
        operation: "GET /ig-user/content_publishing_limit",
        status: 400,
        errorType: "IGApiException",
        apiCode: 200,
        errorSubcode: 2207013,
        errorMessage: "Permissions error for [redacted]",
        errorUserTitle: "Veröffentlichung nicht möglich",
        errorUserMessage: "Bitte Berechtigung erneut erteilen.",
        fbtraceId: "safe-trace-id",
      });
      assert.match(warnings.join("\n"), /konnte nicht gelesen werden/);
      assert.doesNotMatch(`${errors.join("\n")}\n${warnings.join("\n")}`, new RegExp(secretToken));
    } finally {
      console.error = previousError;
      console.warn = previousWarn;
    }
  });

  it("übersetzt einen Permissions-Fehler von /media in den Reconnect-Hinweis", async () => {
    const previousError = console.error;
    console.error = () => undefined;

    try {
      const { fetcher, calls } = createFetchSequence([
        {
          body: {
            quota_usage: 1,
            config: { quota_total: 100, quota_duration: 86_400 },
          },
        },
        {
          status: 400,
          body: {
            error: {
              type: "IGApiException",
              code: 200,
              message: "Permissions error",
              fbtrace_id: "trace-id",
            },
          },
        },
      ]);

      await assert.rejects(
        publishInstagramImage(
          {
            accountId: "ig-user",
            accessToken: "token",
            imageUrl: "https://autotal.at/car.jpg",
            caption: "Fahrzeug",
          },
          fetcher,
        ),
        (error) =>
          error instanceof UserFacingError &&
          error.code === "UNAUTHORIZED" &&
          error.message === INSTAGRAM_PUBLISH_PERMISSION_MESSAGE,
      );
      assert.equal(
        calls[1].url.pathname,
        `/${INSTAGRAM_GRAPH_API_VERSION}/ig-user/media`,
      );
    } finally {
      console.error = previousError;
    }
  });

  it("wiederholt media_publish nach einem API-Fehler nicht automatisch", async () => {
    const previousError = console.error;
    console.error = () => undefined;

    try {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "FINISHED", status: "Container fertig" } },
        {
          status: 503,
          body: {
            error: {
              type: "IGApiException",
              code: 2,
              message: "Temporary service failure",
              fbtrace_id: "trace-id",
            },
          },
        },
        { body: { id: "must-not-be-used" } },
      ]);

      await assert.rejects(
        publishInstagramImage(
          {
            accountId: "ig-user",
            accessToken: "token",
            imageUrl: "https://autotal.at/car.jpg",
            caption: "Fahrzeug",
          },
          fetcher,
          { sleep: NO_WAIT },
        ),
        (error) =>
          error instanceof InstagramPublishOutcomeUnknownError &&
          error.message === INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE,
      );

      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        1,
      );
      assert.equal(calls.length, 4);
    } finally {
      console.error = previousError;
    }
  });

  it("wartet bei IN_PROGRESS bis FINISHED und publiziert genau einmal", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "IN_PROGRESS", status: "Verarbeitung" } },
        { body: { status_code: "IN_PROGRESS", status: "Verarbeitung" } },
        { body: { status_code: "FINISHED", status: "Fertig" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      const result = await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
        { delaysMs: [0, 0, 0], sleep: NO_WAIT },
      );

      assert.equal(result.postId, "published-media-id");
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        1,
      );
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/container-id")).length,
        3,
      );
    });
  });

  for (const scenario of [
    {
      statusCode: "ERROR",
      message: /konnte das Bild nicht verarbeiten/,
    },
    {
      statusCode: "EXPIRED",
      message: /Mediencontainer ist abgelaufen/,
    },
  ]) {
    it(`bricht bei ${scenario.statusCode} ohne media_publish ab`, async () => {
      await withMutedConsole(async () => {
        const { fetcher, calls } = createFetchSequence([
          { body: {} },
          { body: { id: "container-id" } },
          { body: { status_code: scenario.statusCode } },
        ]);

        await assert.rejects(
          publishInstagramImage(
            {
              accountId: "ig-user",
              accessToken: "token",
              imageUrl: "https://autotal.at/car.jpg",
              caption: "Fahrzeug",
            },
            fetcher,
            { delaysMs: [0], sleep: NO_WAIT },
          ),
          (error) =>
            error instanceof UserFacingError && scenario.message.test(error.message),
        );
        assert.equal(
          calls.filter(({ url }) => url.pathname.endsWith("/media_publish"))
            .length,
          0,
        );
      });
    });
  }

  it("behandelt PUBLISHED als veröffentlicht und sendet kein media_publish", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "PUBLISHED", status: "Veröffentlicht" } },
      ]);

      const result = await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
        { delaysMs: [0], sleep: NO_WAIT },
      );

      assert.deepEqual(result, {
        postId: null,
        permalink: null,
        alreadyPublished: true,
      });
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        0,
      );
    });
  });

  it("beendet das Polling nach dem Maximum mit der Timeout-Meldung", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "IN_PROGRESS" } },
      ]);

      await assert.rejects(
        publishInstagramImage(
          {
            accountId: "ig-user",
            accessToken: "token",
            imageUrl: "https://autotal.at/car.jpg",
            caption: "Fahrzeug",
          },
          fetcher,
          { delaysMs: [0, 0, 0], sleep: NO_WAIT },
        ),
        (error) =>
          error instanceof UserFacingError &&
          error.message ===
            "Instagram verarbeitet das Bild noch. Bitte versuchen Sie die Veröffentlichung in einem Moment erneut.",
      );
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/container-id")).length,
        3,
      );
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        0,
      );
    });
  });

  it("bricht bei unbekanntem Status sicher ab und loggt keinen Token", async () => {
    const secretToken = "status-check-secret-token";
    const logs: string[] = [];
    const previousLog = console.log;
    const previousError = console.error;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    console.error = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "UNEXPECTED", status: "Unbekannt" } },
      ]);

      await assert.rejects(
        publishInstagramImage(
          {
            accountId: "ig-user",
            accessToken: secretToken,
            imageUrl: "https://autotal.at/car.jpg",
            caption: "Fahrzeug",
          },
          fetcher,
          { delaysMs: [0], sleep: NO_WAIT },
        ),
        (error) =>
          error instanceof UserFacingError &&
          /unbekannten Verarbeitungsstatus/.test(error.message),
      );
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        0,
      );
      assert.match(logs.join("\n"), /"containerId":"container-id"/);
      assert.match(logs.join("\n"), /"attempt":1/);
      assert.match(logs.join("\n"), /"statusCode":"UNEXPECTED"/);
      assert.doesNotMatch(logs.join("\n"), new RegExp(secretToken));
    } finally {
      console.log = previousLog;
      console.error = previousError;
    }
  });

  it("prüft bei 9007/2207027 erneut und erlaubt genau einen Publish-Retry", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "FINISHED" } },
        {
          status: 400,
          body: {
            error: {
              type: "IGApiException",
              code: 9007,
              error_subcode: 2207027,
              message: "Media ID is not available",
              error_user_msg:
                "Die Medien können noch nicht veröffentlicht werden. Bitte warte noch einen Moment.",
              fbtrace_id: "trace-id",
            },
          },
        },
        { body: { status_code: "FINISHED" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      const result = await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
        {
          delaysMs: [0],
          retryDelaysMs: [0],
          sleep: NO_WAIT,
        },
      );

      assert.equal(result.postId, "published-media-id");
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        2,
      );
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/container-id")).length,
        2,
      );
    });
  });

  it("sendet nach 9007 keinen Retry, wenn der Container PUBLISHED ist", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "container-id" } },
        { body: { status_code: "FINISHED" } },
        {
          status: 400,
          body: {
            error: {
              type: "IGApiException",
              code: 9007,
              error_subcode: 2207027,
              message: "Media ID is not available",
            },
          },
        },
        { body: { status_code: "PUBLISHED" } },
      ]);

      const result = await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
        },
        fetcher,
        {
          delaysMs: [0],
          retryDelaysMs: [0],
          sleep: NO_WAIT,
        },
      );

      assert.equal(result.alreadyPublished, true);
      assert.equal(
        calls.filter(({ url }) => url.pathname.endsWith("/media_publish")).length,
        1,
      );
    });
  });

  it("überspringt alle API-Aufrufe bei vorhandener Instagram Media ID", async () => {
    const { fetcher, calls } = createFetchSequence([]);

    assert.deepEqual(
      await publishInstagramImage(
        {
          accountId: "ig-user",
          accessToken: "token",
          imageUrl: "https://autotal.at/car.jpg",
          caption: "Fahrzeug",
          publishedMediaId: "existing-media-id",
          publishedPermalink: "https://www.instagram.com/p/existing/",
        },
        fetcher,
        { sleep: NO_WAIT },
      ),
      {
        postId: "existing-media-id",
        permalink: "https://www.instagram.com/p/existing/",
        alreadyPublished: true,
      },
    );
    assert.equal(calls.length, 0);
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
  const socialActions = readFileSync("src/modules/social/actions.ts", "utf8");
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
    assert.match(adminUi, /nicht die erforderliche Veröffentlichungsberechtigung/);
  });

  it("dokumentiert den vorerst einzelnen Bild-Post", () => {
    const readme = readFileSync("src/integrations/instagram/README.md", "utf8");
    assert.match(
      readme,
      /Instagram Carousel \/ mehrere Bilder sind noch nicht implementiert/,
    );
  });

  it("persistiert die Media ID sofort und sperrt parallele Retries", () => {
    const publishCall = socialActions.indexOf("publishImagePost(");
    const immediatePersistence = socialActions.indexOf(
      "externalPostId: postId",
      publishCall,
    );
    const finalPublishedStatus = socialActions.indexOf(
      'status: "PUBLISHED"',
      immediatePersistence,
    );

    assert.ok(publishCall >= 0);
    assert.ok(immediatePersistence > publishCall);
    assert.ok(finalPublishedStatus > immediatePersistence);
    assert.match(socialActions, /INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER/);
    assert.match(
      socialActions,
      /claimed\.count\s*!==\s*1/,
    );
    assert.match(
      socialActions,
      /draft\.externalPostId[\s\S]*?return ok\(/,
    );
    assert.match(
      socialActions,
      /errorMessage\s*===\s*INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE/,
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
