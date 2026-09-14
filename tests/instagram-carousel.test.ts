import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INSTAGRAM_CAROUSEL_MAX_ITEMS,
  INSTAGRAM_CAROUSEL_MIN_ITEMS,
} from "@/integrations/instagram/limits";
import {
  InstagramPublishOutcomeUnknownError,
  INSTAGRAM_CHILD_CONCURRENCY,
  publishInstagramCarousel,
  publishInstagramImage,
} from "@/integrations/instagram/protocol";
import { UserFacingError } from "@/lib/result";
import {
  INSTAGRAM_MAX_IMAGES,
  defaultInstagramImages,
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
  }
  for (let i = 0; i < n; i += 1) {
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
  for (const count of [0, 1, 8, 12]) {
    it(`wählt für einen neuen Draft ${Math.min(count, INSTAGRAM_MAX_IMAGES)} von ${count} Bildern`, () => {
      const images = Array.from({ length: count }, (_, position) => ({
        position, url: `https://cdn.example/${position}.jpg`,
      }));
      const reversed = [...images].reverse();
      const selection = defaultInstagramImages(reversed);
      assert.deepEqual(selection, images.slice(0, INSTAGRAM_MAX_IMAGES).map((i) => i.url));
      assert.deepEqual(reversed, [...images].reverse(), "input not mutated");
      if (count) {
        const plan = planInstagramImages(selection, images.map((i) => i.url));
        assert.ok(plan.ok);
        assert.equal(plan.mode, count === 1 ? "single" : "carousel");
      }
    });
  }

  it("filtert inkompatible Bilder vor dem Limit und entfernt Duplikate", () => {
    const images = ["http://cdn.example/a.jpg", "https://cdn.example/a.png",
      "https://localhost/a.jpg", ...URLS, URLS[0]];
    assert.deepEqual(defaultInstagramImages(images.map((url, position) => ({ url, position }))), URLS);
  });

  it("wendet die neue Vorauswahl nur beim Erstellen an, nicht auf bestehende Drafts", () => {
    const actions = readFileSync("src/modules/social/actions.ts", "utf8");
    assert.equal(actions.match(/defaultInstagramImages\(/g)?.length, 1);
    const create = actions.slice(actions.indexOf("prisma.socialDraft.create("), actions.indexOf('logger.info("Social-Entwurf erzeugt"'));
    assert.match(create, /defaultInstagramImages\(/);
    assert.match(create, /status: "DRAFT"/);
    const saved = [URLS[2]];
    assert.deepEqual(orderSelectedImages(saved, URLS), saved);
    const mapper = readFileSync("src/modules/vehicles/mappers.ts", "utf8");
    assert.match(mapper, /sort\(\(a, b\) => a.position - b.position\)/);
    assert.match(mapper, /images: sorted.map/);
  });

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
  it("stoppt bei Creation-Fehlern den Pool und wartet laufende Requests ab", async () => {
    await withMutedConsole(async () => {
      let started = 0;
      let completed = 0;
      const fetcher = (async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname.endsWith("/content_publishing_limit")) return new Response("{}");
        assert.ok(url.pathname.endsWith("/media"), "no polling or publishing after failure");
        const index = started++;
        if (index === 0) return new Response(JSON.stringify({
          error: { code: 200, message: "Permissions error" },
        }), { status: 400 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        completed++;
        return new Response(JSON.stringify({ id: `child-${index}` }));
      }) as typeof fetch;
      await assert.rejects(publishInstagramCarousel(carouselInput(URLS), fetcher, FAST));
      assert.equal(started, INSTAGRAM_CHILD_CONCURRENCY);
      assert.equal(completed, INSTAGRAM_CHILD_CONCURRENCY - 1, "all in-flight calls drained before returning");
    });
  });

  it("erstellt und pollt 8 Children mit maximal 3 parallelen Requests trotz anderer Antwortreihenfolge", async () => {
    await withMutedConsole(async () => {
      const urls = Array.from({ length: 8 }, (_, i) => `https://cdn.example/${i}.jpg`);
      let creating = 0;
      let polling = 0;
      let maxCreating = 0;
      let maxPolling = 0;
      let publishCount = 0;
      let parentCount = 0;
      const finishedCreation: number[] = [];
      const polls = new Map<string, number>();
      const sleeps: number[] = [];
      const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const body = new URLSearchParams(String(init.body ?? ""));
        const path = url.pathname.split("/").pop()!;
        let result: object = {};
        if (path === "media" && body.has("image_url")) {
          const index = urls.indexOf(body.get("image_url")!);
          assert.ok(index >= 0);
          assert.equal(body.has("caption"), false);
          maxCreating = Math.max(maxCreating, ++creating);
          await new Promise((resolve) => setTimeout(resolve, index === 0 ? 20 : 1));
          creating--;
          finishedCreation.push(index);
          result = { id: `child-${index}` };
        } else if (path.startsWith("child-")) {
          assert.equal(finishedCreation.length, 8);
          maxPolling = Math.max(maxPolling, ++polling);
          await new Promise((resolve) => setTimeout(resolve, 1));
          polling--;
          const count = (polls.get(path) ?? 0) + 1;
          polls.set(path, count);
          result = { status_code: path === "child-0" && count < 3 ? "IN_PROGRESS" : "FINISHED" };
        } else if (path === "media") {
          parentCount++;
          assert.equal(polling, 0);
          assert.equal(polls.size, 8);
          assert.equal(polls.get("child-0"), 3);
          assert.equal(body.get("children"), urls.map((_, i) => `child-${i}`).join(","));
          assert.equal(body.get("caption"), carouselInput(urls).caption);
          result = { id: "parent" };
        } else if (path === "parent") {
          result = { status_code: "FINISHED" };
        } else if (path === "media_publish") {
          publishCount++;
          assert.equal(body.get("creation_id"), "parent");
          result = { id: "post" };
        } else if (path === "post") {
          result = { permalink: "https://www.instagram.com/p/example/" };
        } else {
          assert.equal(path, "content_publishing_limit");
        }
        return new Response(JSON.stringify(result), { status: 200 });
      }) as typeof fetch;
      const result = await publishInstagramCarousel(carouselInput(urls), fetcher, {
        delaysMs: [0, 2, 4],
        sleep: async (ms) => { sleeps.push(ms); },
      });
      assert.equal(result.postId, "post");
      assert.equal(maxCreating, INSTAGRAM_CHILD_CONCURRENCY);
      assert.equal(maxPolling, INSTAGRAM_CHILD_CONCURRENCY);
      assert.equal(INSTAGRAM_CHILD_CONCURRENCY, 3);
      assert.notDeepEqual(finishedCreation, urls.map((_, i) => i));
      for (let i = 1; i < 8; i++) assert.equal(polls.get(`child-${i}`), 1);
      assert.deepEqual(sleeps, [0, 2, 4, 0]);
      assert.equal(parentCount, 1);
      assert.equal(publishCount, 1);
    });
  });

  it("nennt beim Anlegen eines Kindes die Position, wenn Instagram das Bild nicht laden kann", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        {
          status: 400,
          body: {
            error: { type: "IGApiException", code: 9004, message: "Media could not be fetched", fbtrace_id: "t" },
          },
        },
      ]);
      await assert.rejects(
        publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
          ...FAST,
          // Ein Aufruf nach dem anderen, damit die Antwortfolge feststeht.
        }),
        (error: unknown) =>
          error instanceof UserFacingError &&
          error.message.startsWith("Instagram konnte Bild 2 von 2 nicht laden."),
      );
      assert.equal(publishCalls(calls).length, 0);
      assert.equal(mediaCalls(calls).length, 2);
    });
  });

  it("bricht nach gemeinsamem Polling-Timeout ohne Parent ab", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} }, { body: { id: "child-1" } }, { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } }, { body: { status_code: "IN_PROGRESS" } },
      ]);
      await assert.rejects(publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST), /verarbeitet Bild 2 von 2 noch/);
      assert.equal(mediaCalls(calls).length, 2);
      assert.equal(publishCalls(calls).length, 0);
    });
  });

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

  it("pollt offene Kinder gemeinsam und fertige Kinder nicht erneut", async () => {
    await withMutedConsole(async () => {
      const { fetcher, calls } = createFetchSequence([
        { body: {} },
        { body: { id: "child-1" } },
        { body: { id: "child-2" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "FINISHED" } },
        { body: { status_code: "IN_PROGRESS" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "carousel-id" } },
        { body: { status_code: "FINISHED" } },
        { body: { id: "published-media-id" } },
        { body: { permalink: "https://www.instagram.com/p/example/" } },
      ]);
      const waits: number[] = [];
      await publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, {
        delaysMs: [0, 2, 4],
        sleep: async (ms) => { waits.push(ms); },
      });
      assert.equal(calls.filter((c) => c.url.pathname.endsWith("/child-1")).length, 3);
      assert.equal(calls.filter((c) => c.url.pathname.endsWith("/child-2")).length, 1);
      assert.deepEqual(waits, [0, 2, 4, 0], "one sleep per child round plus parent");
      assert.equal(publishCalls(calls).length, 1);
    });
  });

  for (const state of ["ERROR", "EXPIRED", "PUBLISHED", "UNKNOWN"]) {
    it(`bricht bei Child-Status ${state} ab: kein Parent, kein Publish`, async () => {
      await withMutedConsole(async () => {
        const { fetcher, calls } = createFetchSequence([
          { body: {} },
          ...URLS.map((_, i) => ({ body: { id: `child-${i + 1}` } })),
          { body: { status_code: "FINISHED" } },
          { body: { status_code: "FINISHED" } },
          { body: { status_code: state } },
          { body: { status_code: "FINISHED" } },
          { body: { status_code: "FINISHED" } },
        ]);
        await assert.rejects(
          publishInstagramCarousel(carouselInput(URLS), fetcher, FAST),
          /Instagram konnte Bild 3 von 5 nicht verarbeiten/,
        );
        assert.equal(publishCalls(calls).length, 0);
        assert.equal(mediaCalls(calls).length, 5);
        assert.ok(!mediaCalls(calls).some((c) => c.params?.get("media_type") === "CAROUSEL"));
      });
    });
  }

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
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
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
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
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
        { body: { id: "child-2" } },
        { body: { status_code: "FINISHED" } },
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
  it("misst alle Carousel-Phasen ohne Tokens, Caption oder Bild-URLs", async () => {
    const { fetcher } = createFetchSequence(happyCarousel(2));
    const { output } = await captureConsole(() => publishInstagramCarousel(carouselInput(URLS.slice(0, 2)), fetcher, FAST));
    const timing = output.split("\n").map((line) => JSON.parse(line)).find((entry) => entry.message === "Instagram carousel timings");
    assert.ok(timing);
    assert.equal(timing.context.outcome, "published");
    for (const phase of ["quotaCheck", "childCreation", "childPolling", "parentCreation", "parentPolling", "mediaPublish"]) {
      assert.equal(typeof timing.context.durationsMs[phase], "number");
      assert.ok(timing.context.durationsMs[phase] >= 0);
    }
    assert.ok(timing.context.totalMs >= 0);
    assert.ok(!output.includes(SECRET));
    assert.ok(!output.includes(carouselInput(URLS).caption));
    for (const url of URLS) assert.ok(!output.includes(url));
  });

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
      { body: { id: "child-2" } },
      { body: { status_code: "ERROR" } },
      { body: { status_code: "FINISHED" } },
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
