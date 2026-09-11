import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INTERACTION_CHANNEL_LABELS,
  INTERACTION_CHANNEL_MEANINGS,
  INTERACTION_CHANNEL_ORDER,
  interactionChannelForSocialPlatform,
  parseInteractionChannel,
} from "@/modules/interactions/channels";

/**
 * TikTok als Interaktionskanal.
 *
 * Warum er gefehlt hat: Das Symbol und die Beschriftung gab es längst, der
 * Link im Footer wurde also angezeigt. Gezählt wurde er nur nie – die
 * Zuordnung stand als Bedingung im Footer und kannte ausschließlich
 * Instagram. TikTok-Klicks liefen deshalb ins Leere.
 */

describe("TikTok als Kanal", () => {
  it("ist ein gültiger InteractionChannel", () => {
    assert.equal(parseInteractionChannel("TIKTOK"), "TIKTOK");
    assert.ok(INTERACTION_CHANNEL_ORDER.includes("TIKTOK"));
  });

  it("weist unbekannte Werte weiterhin ab", () => {
    // Der Zählendpunkt ist öffentlich – es darf nur zählen, was hier durchkommt.
    assert.equal(parseInteractionChannel("SNAPCHAT"), null);
    assert.equal(parseInteractionChannel("tiktok"), null);
    assert.equal(parseInteractionChannel(42), null);
  });

  it("ordnet den TikTok-Link dem Zähler zu", () => {
    assert.equal(interactionChannelForSocialPlatform("tiktok"), "TIKTOK");
    assert.equal(interactionChannelForSocialPlatform("TikTok"), "TIKTOK");
    assert.equal(interactionChannelForSocialPlatform(" tiktok "), "TIKTOK");
  });

  it("zählt Instagram unverändert und lässt andere Netzwerke ungezählt", () => {
    assert.equal(interactionChannelForSocialPlatform("instagram"), "INSTAGRAM");
    assert.equal(interactionChannelForSocialPlatform("facebook"), null);
    assert.equal(interactionChannelForSocialPlatform("youtube"), null);
  });

  it("erscheint beschriftet in der Admin-Auswertung", () => {
    // Die Auswertung läuft über INTERACTION_CHANNEL_ORDER – ein Kanal ohne
    // Beschriftung stünde dort als roher Enum-Wert.
    assert.equal(INTERACTION_CHANNEL_LABELS.TIKTOK, "TikTok");
    assert.equal(INTERACTION_CHANNEL_MEANINGS.TIKTOK, "TikTok-Profil geöffnet");

    for (const channel of INTERACTION_CHANNEL_ORDER) {
      assert.ok(INTERACTION_CHANNEL_LABELS[channel]?.length > 0);
      assert.ok(INTERACTION_CHANNEL_MEANINGS[channel]?.length > 0);
    }
  });

  it("wird in der Statistik mitgezählt, auch bei null Klicks", () => {
    // Der Leerzähler muss jeden Kanal führen, sonst fehlt TikTok in der
    // Auswertung, solange noch niemand geklickt hat.
    const repository = readFileSync(
      "src/modules/interactions/repository.ts",
      "utf8",
    );

    const block = repository.slice(
      repository.indexOf("function emptyByChannel"),
      repository.indexOf("Klicks der letzten"),
    );

    for (const channel of INTERACTION_CHANNEL_ORDER) {
      assert.match(block, new RegExp(`${channel}: 0`), `${channel} fehlt`);
    }
  });

  it("holt die Zuordnung im Footer aus den Kanälen statt sie dort zu verdrahten", () => {
    const footer = readFileSync("src/components/site/site-footer.tsx", "utf8");

    assert.match(footer, /interactionChannelForSocialPlatform\(link\.platform\)/);
    assert.ok(
      !/link\.platform === "instagram"/.test(footer),
      "die alte Sonderbehandlung darf nicht zurückkehren",
    );
  });

  it("speichert weiterhin nur Kanal, Tag und Anzahl", () => {
    // Datenschutz: kein Ereignisdatensatz, keine IP, kein User-Agent.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = schema.slice(
      schema.indexOf("model InteractionCounter"),
      schema.indexOf("model InteractionCounter") + 400,
    );

    assert.match(model, /channel InteractionChannel/);
    assert.match(model, /day\s+DateTime/);
    assert.match(model, /count\s+Int/);

    for (const forbidden of ["ip", "userAgent", "sessionId", "userId"]) {
      assert.ok(!model.includes(forbidden), `${forbidden} gehört nicht hierher`);
    }
  });

  it("ergänzt den Aufzählungswert additiv", () => {
    const migration = readFileSync(
      "prisma/migrations/20260912090000_interaction_channel_tiktok/migration.sql",
      "utf8",
    );

    assert.match(migration, /ADD VALUE IF NOT EXISTS 'TIKTOK'/);
    assert.ok(!/DROP|DELETE|TRUNCATE|ALTER TABLE/i.test(migration));
  });
});
