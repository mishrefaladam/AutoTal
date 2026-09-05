import { weekdayLabel } from "@/modules/vehicles/labels";

import type { OpeningDay, OpeningHourSlot, OpeningStatus } from "./types";

/**
 * Auswertung der Öffnungszeiten.
 *
 * Frei von Server-Abhängigkeiten, damit der Öffnungsstatus auch im Browser
 * berechnet werden kann.
 *
 * Zeitzone: Die Zeiten sind als lokale Zeit des Autohauses (Europe/Vienna)
 * gemeint. Auf dem Server läuft die Berechnung deshalb ausdrücklich gegen
 * diese Zeitzone – sonst würde ein Server in UTC das Autohaus zwei Stunden zu
 * früh schließen.
 */

const SHOP_TIME_ZONE = "Europe/Vienna";

/** Anzeigetext, solange im Admin keine Öffnungszeiten gepflegt sind. */
export const OPENING_HOURS_UNKNOWN_LABEL = "Öffnungszeiten folgen";

/** "08:00" -> 480 (Minuten seit Mitternacht) */
function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatRange(slot: OpeningHourSlot): string | null {
  if (slot.closed || !slot.opensAt || !slot.closesAt) return null;
  return `${slot.opensAt} – ${slot.closesAt} Uhr`;
}

/**
 * Gruppiert die Slots zu sieben Wochentagen, Montag zuerst.
 *
 * Ohne einen einzigen Slot ist im Admin schlicht noch nichts gepflegt –
 * dann liefert die Funktion eine leere Liste statt sieben erfundener
 * "geschlossen"-Tage. Die Aufrufer zeigen in diesem Fall
 * OPENING_HOURS_UNKNOWN_LABEL statt einer Tabelle.
 */
export function groupOpeningHours(slots: OpeningHourSlot[]): OpeningDay[] {
  if (slots.length === 0) return [];

  return Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const daySlots = slots
      .filter((slot) => slot.weekday === weekday)
      .sort((a, b) => a.position - b.position);

    const ranges = daySlots
      .map(formatRange)
      .filter((range): range is string => range !== null);

    return {
      weekday,
      label: weekdayLabel(weekday),
      closed: ranges.length === 0,
      ranges,
      note: daySlots.find((slot) => slot.note)?.note ?? null,
    };
  });
}

/** Aktuelle Zeit im Autohaus als { weekday (1–7), minutes }. */
function nowInShopTimeZone(reference: Date): {
  weekday: number;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(reference);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekday = weekdayNames.indexOf(lookup("weekday")) + 1;

  return {
    weekday: weekday > 0 ? weekday : 1,
    minutes: Number(lookup("hour")) * 60 + Number(lookup("minute")),
  };
}

/**
 * Ist gerade geöffnet? Liefert zusätzlich einen fertigen Anzeigetext.
 * Wird auf der Startseite und im Header verwendet (US-01).
 */
export function getOpeningStatus(
  slots: OpeningHourSlot[],
  reference: Date = new Date(),
): OpeningStatus {
  if (slots.length === 0) {
    return { isOpen: false, label: "Öffnungszeiten auf Anfrage" };
  }

  const now = nowInShopTimeZone(reference);

  const todaySlots = slots
    .filter((slot) => slot.weekday === now.weekday && !slot.closed)
    .sort((a, b) => a.position - b.position);

  for (const slot of todaySlots) {
    if (!slot.opensAt || !slot.closesAt) continue;

    const opens = toMinutes(slot.opensAt);
    const closes = toMinutes(slot.closesAt);
    if (opens === null || closes === null) continue;

    if (now.minutes >= opens && now.minutes < closes) {
      return { isOpen: true, label: `Jetzt geöffnet – bis ${slot.closesAt} Uhr` };
    }

    // Öffnet heute noch.
    if (now.minutes < opens) {
      return { isOpen: false, label: `Geschlossen – öffnet heute um ${slot.opensAt} Uhr` };
    }
  }

  // Nächsten geöffneten Tag suchen (maximal eine Woche voraus).
  for (let offset = 1; offset <= 7; offset += 1) {
    const weekday = ((now.weekday - 1 + offset) % 7) + 1;
    const next = slots
      .filter((slot) => slot.weekday === weekday && !slot.closed && slot.opensAt)
      .sort((a, b) => a.position - b.position)[0];

    if (next?.opensAt) {
      const dayLabel = offset === 1 ? "morgen" : weekdayLabel(weekday);
      return {
        isOpen: false,
        label: `Geschlossen – öffnet ${dayLabel} um ${next.opensAt} Uhr`,
      };
    }
  }

  return { isOpen: false, label: "Öffnungszeiten auf Anfrage" };
}

/**
 * Öffnungszeiten im schema.org-Format für strukturierte Daten,
 * z. B. "Mo-Fr 08:00-18:00".
 */
export function toSchemaOpeningHours(slots: OpeningHourSlot[]): string[] {
  const dayCodes = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return slots
    .filter((slot) => !slot.closed && slot.opensAt && slot.closesAt)
    .sort((a, b) => a.weekday - b.weekday || a.position - b.position)
    .map((slot) => `${dayCodes[slot.weekday - 1]} ${slot.opensAt}-${slot.closesAt}`);
}
