import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getOpeningStatus,
  groupOpeningHours,
  toSchemaOpeningHours,
} from "@/modules/company/opening-hours";
import type { OpeningHourSlot } from "@/modules/company/types";

/**
 * Der Öffnungsstatus wird prominent im Hero angezeigt. Ein Fehler hier führt
 * dazu, dass die Website "Jetzt geöffnet" behauptet, während niemand da ist.
 *
 * Alle Testzeitpunkte sind als UTC angegeben; gerechnet wird gegen
 * Europe/Vienna (im Sommer UTC+2, im Winter UTC+1).
 */

function slot(
  weekday: number,
  opensAt: string | null,
  closesAt: string | null,
  position = 0,
): OpeningHourSlot {
  return {
    id: `${weekday}-${position}`,
    weekday,
    opensAt,
    closesAt,
    closed: opensAt === null,
    note: null,
    position,
  };
}

// Mo–Fr 08:00–12:00 und 13:00–18:00, Sa 09:00–13:00, So geschlossen
const HOURS: OpeningHourSlot[] = [
  ...[1, 2, 3, 4, 5].flatMap((day) => [
    slot(day, "08:00", "12:00", 0),
    slot(day, "13:00", "18:00", 1),
  ]),
  slot(6, "09:00", "13:00", 0),
  slot(7, null, null, 0),
];

describe("groupOpeningHours", () => {
  it("liefert immer sieben Tage, Montag zuerst", () => {
    const days = groupOpeningHours(HOURS);

    assert.equal(days.length, 7);
    assert.equal(days[0].label, "Montag");
    assert.equal(days[6].label, "Sonntag");
  });

  it("fasst mehrere Zeitfenster eines Tages zusammen", () => {
    const monday = groupOpeningHours(HOURS)[0];

    assert.equal(monday.ranges.length, 2);
    assert.equal(monday.ranges[0], "08:00 – 12:00 Uhr");
    assert.equal(monday.ranges[1], "13:00 – 18:00 Uhr");
  });

  it("markiert einen Tag ohne Zeiten als geschlossen", () => {
    const sunday = groupOpeningHours(HOURS)[6];

    assert.equal(sunday.closed, true);
    assert.deepEqual(sunday.ranges, []);
  });
});

describe("getOpeningStatus", () => {
  it("meldet geöffnet innerhalb eines Zeitfensters", () => {
    // Dienstag, 1.9.2026, 15:00 Wiener Zeit (Sommerzeit = 13:00 UTC)
    const status = getOpeningStatus(HOURS, new Date("2026-09-01T13:00:00Z"));

    assert.equal(status.isOpen, true);
    assert.match(status.label, /bis 18:00/);
  });

  it("meldet geschlossen während der Mittagspause", () => {
    // Dienstag, 12:30 Wiener Zeit
    const status = getOpeningStatus(HOURS, new Date("2026-09-01T10:30:00Z"));

    assert.equal(status.isOpen, false);
    assert.match(status.label, /öffnet heute um 13:00/);
  });

  it("nennt vor Öffnung die heutige Öffnungszeit", () => {
    // Dienstag, 07:00 Wiener Zeit
    const status = getOpeningStatus(HOURS, new Date("2026-09-01T05:00:00Z"));

    assert.equal(status.isOpen, false);
    assert.match(status.label, /öffnet heute um 08:00/);
  });

  it("verweist nach Feierabend auf den nächsten Tag", () => {
    // Dienstag, 20:00 Wiener Zeit
    const status = getOpeningStatus(HOURS, new Date("2026-09-01T18:00:00Z"));

    assert.equal(status.isOpen, false);
    assert.match(status.label, /morgen um 08:00/);
  });

  it("überspringt den geschlossenen Sonntag", () => {
    // Sonntag, 6.9.2026, 12:00 Wiener Zeit
    const status = getOpeningStatus(HOURS, new Date("2026-09-06T10:00:00Z"));

    assert.equal(status.isOpen, false);
    assert.match(status.label, /morgen um 08:00/);
  });

  it("rechnet in Wiener Zeit, nicht in UTC", () => {
    // 17:30 UTC = 19:30 in Wien -> geschlossen.
    // Ohne Zeitzonenumrechnung wäre das Ergebnis fälschlich "geöffnet".
    const status = getOpeningStatus(HOURS, new Date("2026-09-01T17:30:00Z"));

    assert.equal(status.isOpen, false);
  });

  it("kommt mit leeren Öffnungszeiten zurecht", () => {
    const status = getOpeningStatus([], new Date());

    assert.equal(status.isOpen, false);
    assert.equal(status.label, "Öffnungszeiten auf Anfrage");
  });
});

describe("toSchemaOpeningHours", () => {
  it("erzeugt schema.org-konforme Angaben", () => {
    const result = toSchemaOpeningHours(HOURS);

    assert.ok(result.includes("Mo 08:00-12:00"));
    assert.ok(result.includes("Sa 09:00-13:00"));
    assert.ok(!result.some((entry) => entry.startsWith("Su")));
  });
});
