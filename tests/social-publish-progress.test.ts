import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseNdjsonChunks } from "@/modules/social/ndjson";

/**
 * Zwischenstand während der Instagram-Veröffentlichung.
 *
 * Grundsatz: Angezeigt wird nur, was der Server tatsächlich gemeldet hat –
 * der Beginn eines Schritts. Keine Prozentwerte, keine Zeitschätzung.
 */

const route = readFileSync("src/app/api/admin/social/drafts/[id]/publish/route.ts", "utf8");
const client = readFileSync("src/modules/social/publish-client.ts", "utf8");
const manager = readFileSync("src/components/admin/social-media-manager.tsx", "utf8");
const actions = readFileSync("src/modules/social/actions.ts", "utf8");
const protocol = readFileSync("src/integrations/instagram/protocol.ts", "utf8");

describe("Streaming-Route", () => {
  it("verlangt eine Admin-Sitzung und ruft dieselben Actions auf wie die Schaltflächen", () => {
    assert.match(route, /if \(!\(await getAdminSession\(\)\)\)/);
    assert.match(route, /status: 401/);
    assert.match(route, /await retryPublish\(draftId, hooks\)/);
    assert.match(route, /await republishDeletedDraft\(draftId, hooks\)/);
    assert.match(route, /await publishDraft\(draftId, hooks\)/);
    assert.match(route, /z\.enum\(\["publish", "retry", "republish"\]\)/);
  });

  it("streamt NDJSON ohne Zwischenspeicher und ohne Cache", () => {
    assert.match(route, /new ReadableStream<Uint8Array>/);
    assert.match(route, /application\/x-ndjson/);
    assert.match(route, /"cache-control": "no-store"/);
    assert.match(route, /"x-accel-buffering": "no"/);
    assert.match(route, /export const maxDuration = 60/);
  });

  it("meldet nur echte Schritte – keine Prozentwerte, keine Zeitschätzung", () => {
    assert.match(route, /onPhase: \(phase: InstagramPublishPhase\) => send\(\{ phase \}\)/);
    for (const [name, source] of [["route", route], ["client", client], ["manager", manager]] as const) {
      assert.ok(!/\bpercent\b|\d\s*%|progress\s*[:=]\s*\d/i.test(source), `${name}: kein Fake-Fortschritt`);
      assert.ok(!/setTimeout\([^)]*Phase/i.test(source), `${name}: keine zeitgesteuerten Phasen`);
    }
  });

  it("die Phasen kommen aus dem Protokoll, an den tatsächlichen Übergängen", () => {
    const carousel = protocol.slice(protocol.indexOf("export async function publishInstagramCarousel"));
    const images = carousel.indexOf('options.onPhase?.("images")');
    const children = carousel.indexOf('measure("childCreation"');
    const parent = carousel.indexOf('options.onPhase?.("carousel")');
    const parentCreate = carousel.indexOf('measure("parentCreation"');
    const publish = carousel.indexOf('options.onPhase?.("publish")');
    const mediaPublish = carousel.indexOf('measure("mediaPublish"');
    assert.ok(images >= 0 && images < children, "images vor dem Anlegen der Kinder");
    assert.ok(parent > children && parent < parentCreate, "carousel vor dem Parent");
    assert.ok(publish > parentCreate && publish < mediaPublish, "publish vor media_publish");
  });
});

describe("Client", () => {
  it("zerlegt NDJSON auch dann richtig, wenn Zeilen über Chunks verteilt ankommen", () => {
    const events: unknown[] = [];
    parseNdjsonChunks(
      ['{"phase":"ima', 'ges"}\n{"phase":"carousel"}\n{"pha', 'se":"publish"}\n{"result":{"ok":true}}'],
      (event) => events.push(event),
    );
    assert.deepEqual(events, [
      { phase: "images" },
      { phase: "carousel" },
      { phase: "publish" },
      { result: { ok: true } },
    ]);
  });

  it("fällt ohne Streaming auf die Server Action zurück", () => {
    assert.match(client, /catch \{\s*return viaServerAction\(draftId, mode\);/);
    assert.match(client, /if \(!response\.ok \|\| !response\.body\) return viaServerAction\(draftId, mode\);/);
  });

  it("meldet einen Abbruch ehrlich – und dass nichts doppelt veröffentlicht wird", () => {
    assert.match(client, /Die Verbindung wurde unterbrochen, bevor Instagram geantwortet hat/);
    assert.match(client, /nicht doppelt veröffentlicht/);
  });

  it("zeigt die drei Schritte mit ihren Texten und lädt danach neu", () => {
    assert.match(client, /images: "Bilder werden vorbereitet …"/);
    assert.match(client, /carousel: "Carousel wird erstellt …"/);
    assert.match(client, /publish: "Beitrag wird veröffentlicht …"/);
    assert.match(manager, /Instagram-Veröffentlichung wird gestartet …/);
    assert.match(manager, /"Bild wird vorbereitet …"/);
    assert.match(manager, /router\.refresh\(\)/);
    for (const mode of ["publish", "retry", "republish"]) {
      assert.match(manager, new RegExp(`onClick=\\{\\(\\) => publish\\("${mode}"\\)\\}`), mode);
    }
  });
});

describe("Lokale Wartezeiten", () => {
  it("prüft die Erreichbarkeit der Bilder gleichzeitig statt nacheinander", () => {
    assert.match(actions, /await Promise\.all\(imageUrls\.map\(\(url\) => imageUnreachable\(url\)\)\)/);
  });

  it("verzichtet beim Carousel auf die Wartezeit vor dem ersten Poll, nicht auf die weiteren", () => {
    assert.match(protocol, /function withoutInitialWait\(delaysMs: readonly number\[\]\)/);
    assert.match(protocol, /\[0, \.\.\.delaysMs\.slice\(1\)\]/);
    const carousel = protocol.slice(protocol.indexOf("export async function publishInstagramCarousel"));
    assert.equal((carousel.match(/delaysMs: pollDelaysMs/g) ?? []).length, 2);
    // Der Einzelbild-Weg bleibt unverändert.
    const single = protocol.slice(
      protocol.indexOf("export async function publishInstagramImage("),
      protocol.indexOf("type PublishOptions ="),
    );
    assert.ok(!/withoutInitialWait/.test(single));
  });
});
