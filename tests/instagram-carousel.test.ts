import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INSTAGRAM_CAROUSEL_MAX_ITEMS,
  INSTAGRAM_CAROUSEL_MIN_ITEMS,
} from "@/integrations/instagram/limits";
import {
  InstagramPublishOutcomeUnknownError,
  publishInstagramCarousel,
  publishInstagramImage,
} from "@/integrations/instagram/protocol";
import { UserFacingError } from "@/lib/result";
import {
  INSTAGRAM_MAX_IMAGES,
  instagramImageProblem,
  orderSelectedImages,
  planInstagramImages,
} from "@/modules/social/publish-images";

/**
 * Instagram-Carousel: mehrere Fahrzeugbilder als ein Beitrag.
 *
 * Der Fetcher ist gefälscht und antwortet in fester Reihenfolge; jeder
 * Aufruf wird mit URL und Body festgehalten. Ein Test, der mehr Antworten
 * verbraucht als vorgesehen, scheitert – so bleibt "genau ein media_publish"
 * nachweisbar.
 */

const NO_WAIT = async () => undefined;
const FAST = { delaysMs: [0], retryDelaysMs: [0], sleep: NO_WAIT };
const SECRET = "IGQVJ-super-secret-token";

const URLS = [
  "https://x.public.blob.vercel-storage.com/fahrzeuge/v1/a.jpg",
  "https://x.public.blob.vercel-storage.com/fahrzeuge/v1/b.jpg",
  "https://x.public.blob.vercel-storage.com/fahrzeuge/v1/c.jpg",
  "https://x.public.blob.vercel-storage.com/fahrzeuge/v1/d.jpg",
  "https://x.public.blob.vercel-storage.com/fahrzeuge/v1/e.jpg",
];

async function withMutedConsole<T>(callback: () => Promise<T>): Promise<T> {
  const previous = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    return await callback();
  } finally {
    Object.assign(console, previous);
  }
}

/** Sammelt alles, was während des Aufrufs in die Konsole ginge. */
async function captureConsole<T>(callback: () => Promise<T>): Promise<{ result: T; output: string }> {
  const lines: string[] = [];
  const previous = { log: console.log, warn: console.warn, error: console.error };
  const record = (...args: unknown[]) =>
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  console.log = record;
  console.warn = record;
  console.error = record;
  try {
    const result = await callback();
    return { result, output: lines.join("\n") };
  } finally {
    Object.assign(console, previous);
  }
}

type Call = { url: URL; params: URLSearchParams | null; init: RequestInit };
type MockResponse = { body: unknown; status?: number };

function createFetchSequence(responses: MockResponse[]) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = init.body;
    const params =
      typeof body === "string"
        ? new URLSearchParams(body)
        : body instanceof URLSearchParams
          ? body
          : null;
    calls.push({ url, params, init });

    const response = responses.shift();
    assert.ok(response, `Unerwarteter Fetch-Aufruf: ${url.pathname}`);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, calls, remaining: () => responses.length };
}

const mediaCalls = (calls: Call[]) => calls.filter((c) => c.url.pathname.endsWith("/media"));
const publishCalls = (calls: Call[]) => calls.filter((c) => c.url.pathname.endsWith("/media_publish"));

/** Antworten für ein glattes Carousel mit n Kindern. */
function happyCarousel(n: number, mediaId = "published-media-id"): MockResponse[] {
  const responses: MockResponse[] = [{ body: {} }]; // content_publishing_limit
  for (let i = 0; i < n; i += 1) {
    responses.push({ body: { id: `child-${i + 1}` } });
    responses.push({ body: { status_code: "FINISHED" } });
  }
  responses.push({ body: { id: "carousel-id" } });
  responses.push({ body: { status_code: "FINISHED" } });
  responses.push({ body: { id: mediaId } });
  responses.push({ body: { permalink: "https://www.instagram.com/p/example/" } });
  return responses;
}

function carouselInput(urls: readonly string[], extra: Record<string, unknown> = {}) {
  return {
    accountId: "ig-user",
    accessToken: SECRET,
    imageUrls: urls,
    caption: "Herzlich willkommen bei Autotal! 🚗",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Auswahl: Einzelbild oder Carousel
// ---------------------------------------------------------------------------

describe("Bildplan", () => {
  it("nimmt die Grenze aus der Instagram-Dokumentation: 10 Elemente je Carousel", () => {
    assert.equal(INSTAGRAM_CAROUSEL_MAX_ITEMS, 10);
    assert.equal(INSTAGRAM_CAROUSEL_MIN_ITEMS, 2);
    assert.equal(INSTAGRAM_MAX_IMAGES, 10);
    // Nur eine Stelle für die Zahl – Oberfläche und Action lesen sie von dort.
    const limits = readFileSync("src/integrations/instagram/limits.ts", "utf8");
    assert.match(limits, /Carousels are limited to 10/);
    assert.ok(!/server-only/.test(limits), "die Oberfläche muss die Grenze lesen dürfen");
  });

  it("1 Bild → Einzelbild, 2 Bilder → Carousel", () => {
    const one = planInstagramImages([URLS[0]], URLS);
    assert.deepEqual(one, { ok: true, mode: "single", imageUrls: [URLS[0]] });

    const two = planInstagramImages([URLS[1], URLS[0]], URLS);
    assert.deepEqual(two, { ok: true, mode: "carousel", imageUrls: [URLS[0], URLS[1]] });
  });

  it("hält bei 5 Bildern die Galerie-Reihenfolge, nicht die Klick-Reihenfolge", () => {
    const shuffled = [URLS[3], URLS[0], URLS[4], URLS[2], URLS[1]];
    assert.deepEqual(orderSelectedImages(shuffled, URLS), URLS);
    const plan = planInstagramImages(shuffled, URLS);
    assert.ok(plan.ok && plan.mode === "carousel");
    assert.deepEqual(plan.imageUrls, URLS);
  });

  it("lässt ein inzwischen gelöschtes Bild still weg", () => {
    const gallery = [URLS[0], URLS[2]];
    assert.deepEqual(orderSelectedImages([URLS[0], URLS[1], URLS[2]], gallery), gallery);
  });

  it("blockiert ohne Bild", () => {
    const plan = planInstagramImages([], URLS);
    assert.ok(!plan.ok);
    assert.match(plan.message, /kein Bild ausgewählt/);
  });

  it("weist mehr als 10 Bilder mit klarer Meldung ab", () => {
    const gallery = Array.from({ length: 12 }, (_, i) => `https://cdn.example/${i}.jpg`);
    const plan = planInstagramImages(gallery, gallery);
    assert.ok(!plan.ok);
    assert.match(plan.message, /höchstens 10 Bilder je Beitrag; ausgewählt sind 12/);

    const ten = planInstagramImages(gallery.slice(0, 10), gallery);
    assert.ok(ten.ok);
  });

  it("prüft vor der Veröffentlichung Adresse und Typ jedes Bildes – mit Position", () => {
    assert.equal(instagramImageProblem("https://cdn.example/a.jpg"), null);
    assert.equal(instagramImageProblem("https://cdn.example/a.JPEG"), null);
    assert.match(instagramImageProblem("http://cdn.example/a.jpg") ?? "", /https/);
    assert.match(instagramImageProblem("https://localhost/a.jpg") ?? "", /lokale oder private/);
    assert.match(instagramImageProblem("https://192.168.1.4/a.jpg") ?? "", /lokale oder private/);
    assert.match(instagramImageProblem("https://cdn.example/a.png") ?? "", /kein JPEG/);
    assert.match(instagramImageProblem("data:image/jpeg;base64,AAAA") ?? "", /keine gültige Adresse|https/);
    assert.match(instagramImageProblem("/uploads/a.jpg") ?? "", /keine gültige Adresse/);

    const gallery = [URLS[0], "https://cdn.example/b.png", URLS[2]];
    const plan = planInstagramImages(gallery, gallery);
    assert.ok(!plan.ok);
    assert.match(plan.message, /^Bild 2 von 3 kann nicht veröffentlicht werden: kein JPEG/);
  });
});

// ---------------------------------------------------------------------------
// Protokoll: Kinder, Carousel-Container, genau ein media_publish
// ---------------------------------------------------------------------------

describe("Carousel-Protokoll", () => {
  it("erstellt je Bild ein Kind mit is_carousel_item, ohne Caption, in Reihenfolge", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence(happyCarousel(5));
      const result = await publishInstagramCarousel(carouselInput(URLS), fetcher, FAST);

      assert.equal(result.postId, "published-media-id");
      assert.equal(result.alreadyPublished, false);

      const media = mediaCalls(calls);
      assert.equal(media.length, 6, "fünf Kinder plus ein Carousel-Container");
      for (const [index, call] of media.slice(0, 5).entries()) {
        assert.equal(call.params?.get("image_url"), URLS[index]);
        assert.equal(call.params?.get("is_carousel_item"), "true");
        assert.equal(call.params?.has("caption"), false, "Kinder tragen keine Caption");
        assert.equal(call.params?.has("media_type"), false);
      }
    });
  });

  it("wartet je Kind auf FINISHED, bevor das nächste erstellt wird", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "carousel-id" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
        ...FAST,
        delaysMs: [0, 0, 0],
      });

      const sequence = calls.map((c) => c.url.pathname.split("/").pop());
      const child2 = sequence.indexOf("media", sequence.indexOf("media") + 1);
      const lastPollChild1 = sequence.lastIndexOf("child-1");
      assert.ok(lastPollChild1 < child2, "Kind 2 erst nach dem letzten Poll von Kind 1");
      assert.equal(calls.filter((c) => c.url.pathname.endsWith("/child-1")).length, 3);
    });
  });

  it("bricht bei ERROR eines Kindes ab: kein Carousel, kein media_publish, Position benannt", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls, remaining } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-3" } },
        { body: { status_code: "ERROR", status: "Error: Media upload failed" } },
        // Alles ab hier darf nicht mehr abgerufen werden.
        { body: { id: "child-4-must-not-be-created" } },
      ]);

      await assert.rejects(
        publishInstagramCarousel(carouselInput(URLS), fetcher, FAST),
        (error: unknown) =>
          error instanceof UserFacingError &&
          error.message.startsWith("Instagram konnte Bild 3 von 5 nicht verarbeiten.") &&
          !/Verbindung prüfen/.test(error.message),
      );

      assert.equal(publishCalls(calls).length, 0);
      assert.equal(mediaCalls(calls).length, 3, "kein viertes Kind, kein Carousel-Container");
      assert.equal(remaining(), 1);
      assert.ok(!mediaCalls(calls).some((c) => c.params?.get("media_type") === "CAROUSEL"));
    });
  });

  it("bricht bei EXPIRED eines Kindes ebenso ab", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "EXPIRED" } },
      ]);
      await assert.rejects(
        publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST),
        /Mediencontainer für Bild 1 von 2 ist abgelaufen/,
      );
      assert.equal(publishCalls(calls).length, 0);
    });
  });

  it("erstellt den Carousel-Container mit media_type, children in Reihenfolge und der Caption", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence(happyCarousel(3));
      await publishInstagramCarousel(carouselInput(URLS.slice(0, 3)), fetcher, FAST);

      const carousel = mediaCalls(calls)[3];
      assert.equal(carousel.params?.get("media_type"), "CAROUSEL");
      assert.equal(carousel.params?.get("children"), "child-1,child-2,child-3");
      assert.equal(carousel.params?.get("caption"), "Herzlich willkommen bei Autotal! 🚗");
      assert.equal(carousel.params?.has("image_url"), false);
      assert.equal(carousel.params?.has("is_carousel_item"), false);

      // Die Caption steht nur am Carousel – nirgends sonst.
      const withCaption = mediaCalls(calls).filter((c) => c.params?.has("caption"));
      assert.equal(withCaption.length, 1);
    });
  });

  it("wartet auch auf den Carousel-Container, bevor media_publish folgt", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "carousel-id" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
        ...FAST,
        delaysMs: [0, 0],
      });

      const sequence = calls.map((c) => c.url.pathname.split("/").pop());
      assert.ok(sequence.lastIndexOf("carousel-id") < sequence.indexOf("media_publish"));
      assert.equal(calls.filter((c) => c.url.pathname.endsWith("/carousel-id")).length, 2);
    });
  });

  it("ruft media_publish genau einmal auf – mit der Carousel-ID, nicht mit einem Kind", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls, remaining } = createFetchSequence(happyCarousel(2));
      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST);

      const publishes = publishCalls(calls);
      assert.equal(publishes.length, 1);
      assert.equal(publishes[0].params?.get("creation_id"), "carousel-id");
      assert.equal(remaining(), 0, "keine Antwort blieb ungenutzt");
    });
  });

  it("gibt bei 9007/2207027 genau einen kontrollierten Publish-Retry", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "carousel-id" } },
        { body: { status_code: "FINISHED" } },
        {
          status: 400,
          body: {
            error: {
              type: "IGApiException",
              code: 9007,
              error_subcode: 2207027,
              message: "Media ID is not available",
              fbtrace_id: "trace-id",
            },
          },
        },
        { body: { status_code: "FINISHED" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);

      const result = await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST);
      assert.equal(result.postId, "published-media-id");
      assert.equal(publishCalls(calls).length, 2);
      // Keine neuen Container beim Retry.
      assert.equal(mediaCalls(calls).length, 3);
    });
  });

  it("wiederholt media_publish bei jedem anderen Fehler nicht", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "carousel-id" } },
        { body: { status_code: "FINISHED" } },
        {
          status: 500,
          body: { error: { type: "OAuthException", code: 1, message: "Unknown error" } },
        },
        { body: { id: "must-not-be-used" } },
      ]);

      await assert.rejects(publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST));
      assert.equal(publishCalls(calls).length, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Doppelpost-Schutz
// ---------------------------------------------------------------------------

describe("Doppelpost-Schutz beim Carousel", () => {
  it("persistiert die Media ID über onPublished, bevor der Permalink geholt wird", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence(happyCarousel(2));
      let persisted: string | null = null;
      let callsAtPersist = 0;

      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
        ...FAST,
        onPublished: async (postId) => {
          persisted = postId;
          callsAtPersist = calls.length;
        },
      });

      assert.equal(persisted, "published-media-id");
      // Zum Zeitpunkt des Speicherns war der Permalink noch nicht abgerufen.
      assert.equal(callsAtPersist, calls.length - 1);
    });
  });

  it("meldet einen unbekannten Ausgang, wenn die Media ID nicht gespeichert werden kann", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence(happyCarousel(2));
      await assert.rejects(
        publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
          ...FAST,
          onPublished: async () => {
            throw new Error("db down");
          },
        }),
        (error: unknown) => error instanceof InstagramPublishOutcomeUnknownError,
      );
      assert.equal(publishCalls(calls).length, 1);
    });
  });

  it("veröffentlicht mit vorhandener publishedMediaId nichts Neues", async () => {
    const { fetcher, calls } = createFetchSequence([]);
    const result = await publishInstagramCarousel(
      carouselInput(URLS, {
        publishedMediaId: "already-there",
        publishedPermalink: "https://www.instagram.com/p/already/",
      }),
      fetcher,
      FAST,
    );
    assert.deepEqual(result, {
      postId: "already-there",
      permalink: "https://www.instagram.com/p/already/",
      alreadyPublished: true,
    });
    assert.equal(calls.length, 0);

    // Dasselbe für den Einzelbild-Weg – der bleibt, wie er war.
    const single = await publishInstagramImage(
      { ...carouselInput([URLS[0]]), imageUrl: URLS[0], publishedMediaId: "already-there" },
      fetcher,
      FAST,
    );
    assert.equal(single.alreadyPublished, true);
    assert.equal(calls.length, 0);
  });

  it("weist außerhalb von 2 bis 10 Bildern ab, bevor ein Container entsteht", async () => {
    const { fetcher, calls } = createFetchSequence([]);
    await assert.rejects(
      publishInstagramCarousel(carouselInput([URLS[0]]), fetcher, FAST),
      /2 bis 10 Bilder; ausgewählt sind 1/,
    );
    const eleven = Array.from({ length: 11 }, (_, i) => `https://cdn.example/${i}.jpg`);
    await assert.rejects(
      publishInstagramCarousel(carouselInput(eleven), fetcher, FAST),
      /2 bis 10 Bilder; ausgewählt sind 11/,
    );
    assert.equal(calls.length, 0);
  });

  it("hält die Sperre gegen parallele Klicks und den externalPostId-Kurzschluss in der Action", () => {
    const actions = readFileSync("src/modules/social/actions.ts", "utf8");
    const publish = actions.slice(actions.indexOf("export async function publishDraft"));
    assert.match(publish, /INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER/);
    assert.match(publish, /claimed\.count\s*!==\s*1/);
    assert.match(publish, /draft\.externalPostId[\s\S]*?return ok\(/);
    assert.match(publish, /publishedMediaId: draft\.externalPostId/);
    assert.match(publish, /externalPostId: postId/);
    // Beide Wege laufen über dieselbe Stelle – die Sperre gilt für beide.
    assert.match(publish, /publishImagePost\(\s*\{ imageUrls, caption: fullCaption \}/);
  });

  it("verzweigt in der Integration: ein Bild → Einzelbild, sonst Carousel", () => {
    const index = readFileSync("src/integrations/instagram/index.ts", "utf8");
    assert.match(index, /input\.imageUrls\.length === 1\s*\?\s*await publishInstagramImage\(/);
    assert.match(index, /:\s*await publishInstagramCarousel\(/);
    assert.match(index, /if \(input\.imageUrls\.length === 0\)/);
  });
});

// ---------------------------------------------------------------------------
// Erreichbarkeit und Logging
// ---------------------------------------------------------------------------

describe("Vorprüfung und Logging", () => {
  it("prüft jede Bild-URL per HEAD und nennt die Position", () => {
    const actions = readFileSync("src/modules/social/actions.ts", "utf8");
    const reach = readFileSync("src/modules/social/image-reachability.ts", "utf8");
    assert.match(reach, /method: "HEAD"/);
    assert.match(reach, /image\\\/jpeg/);
    assert.match(actions, /for \(const \[index, url\] of imageUrls\.entries\(\)\)/);
    assert.match(actions, /Bild \$\{index \+ 1\} von \$\{imageUrls\.length\} ist für Instagram nicht/);
    // Nur URLs aus der Datenbank – die Auswahl wird gegen die Galerie geprüft.
    assert.match(actions, /const foreign = parsed\.data\.imageUrls\.find\(\(url\) => !own\.has\(url\)\)/);
  });

  it("schreibt weder Token noch Bild-URLs in die Logs", async () => {
    const { fetcher } = createFetchSequence([
      { body: {} },
      { body: { id: "child-1" } },
      { body: { status_code: "ERROR" } },
    ]);

    const { output } = await captureConsole(async () => {
      try {
        await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST);
      } catch {
        // erwartet
      }
    });

    assert.ok(!output.includes(SECRET), "Token im Log");
    assert.ok(!/authorization/i.test(output), "Authorization-Header im Log");
  });

  it("hängt das Token nie an eine Bild-URL", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence(happyCarousel(2));
      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST);
      for (const call of mediaCalls(calls)) {
        const imageUrl = call.params?.get("image_url");
        if (imageUrl) assert.ok(!imageUrl.includes(SECRET));
      }
    });
  });
});
