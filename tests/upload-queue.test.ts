import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UploadError, runUploadQueue, type UploadItemState } from "@/lib/upload-queue";

/**
 * Upload-Warteschlange: begrenzte Parallelität, kontrollierte Wiederholung.
 *
 * Die Arbeiter hier sind gefälscht und geben nach Belieben nach; `sleep` ist
 * ein No-op, damit kein Test auf eine Wartezeit wartet.
 */

const noSleep = async () => {};

/** Ein Arbeiter, der zählt, wie viele gleichzeitig laufen. */
function concurrencyProbe() {
  let running = 0;
  let peak = 0;
  const worker = async (item: number) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 2));
    running -= 1;
    return item * 10;
  };
  return { worker, peak: () => peak };
}

describe("Upload-Warteschlange", () => {
  it("lädt zehn Dateien mit höchstens zwei gleichzeitig hoch", async () => {
    const probe = concurrencyProbe();
    const items = Array.from({ length: 10 }, (_, i) => i);

    const outcomes = await runUploadQueue(items, probe.worker, {
      concurrency: 2,
      maxAttempts: 2,
      backoffMs: 0,
      sleep: noSleep,
    });

    assert.equal(probe.peak(), 2);
    assert.equal(outcomes.length, 10);
    assert.ok(outcomes.every((o) => o.ok));
    // Reihenfolge der Ergebnisse = Reihenfolge der Eingabe.
    assert.deepEqual(
      outcomes.map((o) => (o.ok ? o.value : null)),
      items.map((i) => i * 10),
    );
  });

  it("hält die anderen nicht auf, wenn eine Datei scheitert", async () => {
    const outcomes = await runUploadQueue(
      ["a", "b", "c", "d"],
      async (item) => {
        if (item === "b") throw new UploadError("nur JPEG, PNG oder WebP", false);
        return item.toUpperCase();
      },
      { concurrency: 2, maxAttempts: 2, backoffMs: 0, sleep: noSleep },
    );

    assert.deepEqual(
      outcomes.map((o) => (o.ok ? o.value : "✕")),
      ["A", "✕", "C", "D"],
    );
    assert.equal(outcomes.filter((o) => o.ok).length, 3);
  });

  it("wiederholt einen Netzwerkfehler einmal und meldet danach Erfolg", async () => {
    const attempts: number[] = [];
    const states: UploadItemState[] = [];

    const outcomes = await runUploadQueue(
      ["x"],
      async (_item, attempt) => {
        attempts.push(attempt);
        if (attempt === 1) throw new TypeError("Load failed");
        return "ok";
      },
      {
        concurrency: 2,
        maxAttempts: 2,
        backoffMs: 100,
        sleep: noSleep,
        onState: (_index, state) => states.push(state),
      },
    );

    assert.deepEqual(attempts, [1, 2]);
    assert.deepEqual(outcomes[0], { ok: true, value: "ok", attempts: 2 });
    assert.deepEqual(
      states.map((s) => s.kind),
      ["uploading", "retrying", "uploading", "done"],
    );
  });

  it("markiert nach dem letzten Fehlversuch nur diese eine Datei als fehlgeschlagen", async () => {
    const calls = new Map<string, number>();

    const outcomes = await runUploadQueue(
      ["good", "flaky", "fine"],
      async (item) => {
        calls.set(item, (calls.get(item) ?? 0) + 1);
        if (item === "flaky") throw new Error("network");
        return item;
      },
      { concurrency: 2, maxAttempts: 2, backoffMs: 0, sleep: noSleep },
    );

    assert.equal(calls.get("flaky"), 2, "genau zwei automatische Versuche");
    assert.equal(calls.get("good"), 1);
    assert.equal(calls.get("fine"), 1);

    assert.ok(outcomes[0].ok);
    assert.ok(outcomes[2].ok);
    const failed = outcomes[1];
    assert.ok(!failed.ok);
    assert.equal(failed.retryable, true);
    assert.equal(failed.attempts, 2);
    assert.equal(failed.message, "Die Verbindung ist abgebrochen.");
  });

  it("wiederholt keine Ablehnung – ein kaputtes Bild bleibt kaputt", async () => {
    let calls = 0;
    const outcomes = await runUploadQueue(
      ["bad"],
      async () => {
        calls += 1;
        throw new UploadError("über 8 MB", false);
      },
      { concurrency: 2, maxAttempts: 2, backoffMs: 0, sleep: noSleep },
    );

    assert.equal(calls, 1);
    assert.deepEqual(outcomes[0], {
      ok: false,
      message: "über 8 MB",
      retryable: false,
      attempts: 1,
    });
  });

  it("schickt beim erneuten Versuch nur die gescheiterten Dateien noch einmal", async () => {
    // So verfährt die Oberfläche: Erfolgreiche bleiben, nur die Fehlschläge
    // gehen erneut in die Warteschlange.
    const sent: string[] = [];
    const worker = async (item: string) => {
      sent.push(item);
      if (item === "b" && sent.filter((s) => s === "b").length <= 2) throw new Error("net");
      return item;
    };
    const options = { concurrency: 2, maxAttempts: 2, backoffMs: 0, sleep: noSleep };

    const first = await runUploadQueue(["a", "b", "c"], worker, options);
    const failed = ["a", "b", "c"].filter((_item, index) => !first[index].ok);
    assert.deepEqual(failed, ["b"]);

    const second = await runUploadQueue(failed, worker, options);
    assert.ok(second[0].ok);
    assert.deepEqual(sent, ["a", "b", "c", "b", "b"]);
  });

  it("liefert die Zahlen für „7 von 11 hochgeladen“", async () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    const outcomes = await runUploadQueue(
      items,
      async (item) => {
        if ([2, 5, 8, 10].includes(item)) throw new UploadError("abgelehnt", false);
        return item;
      },
      { concurrency: 3, maxAttempts: 2, backoffMs: 0, sleep: noSleep },
    );

    const done = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.filter((o) => !o.ok).length;
    assert.equal(done, 7);
    assert.equal(failed, 4);
    assert.equal(`${done} von ${outcomes.length} hochgeladen`, "7 von 11 hochgeladen");
  });

  it("nennt einen Abbruch als Verbindungsproblem, eine Ablehnung mit ihrem Grund", async () => {
    const outcomes = await runUploadQueue(
      ["net", "rejected"],
      async (item) => {
        if (item === "net") throw new DOMException("The operation was aborted.", "AbortError");
        throw new UploadError("Datei zu groß (über 8 MB)", false);
      },
      { concurrency: 2, maxAttempts: 1, backoffMs: 0, sleep: noSleep },
    );

    assert.ok(!outcomes[0].ok && outcomes[0].message === "Die Verbindung ist abgebrochen.");
    assert.ok(!outcomes[1].ok && outcomes[1].message === "Datei zu groß (über 8 MB)");
    assert.equal(outcomes[0].ok ? null : outcomes[0].retryable, true);
    assert.equal(outcomes[1].ok ? null : outcomes[1].retryable, false);
  });

  it("wartet vor dem zweiten Versuch mit wachsendem Abstand", async () => {
    const waits: number[] = [];
    let n = 0;
    await runUploadQueue(
      ["x"],
      async () => {
        n += 1;
        if (n < 3) throw new Error("net");
        return "ok";
      },
      {
        concurrency: 1,
        maxAttempts: 3,
        backoffMs: 1500,
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    assert.deepEqual(waits, [1500, 3000]);
  });
});
