import "server-only";

import type { InteractionChannel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import { INTERACTION_CHANNEL_ORDER } from "./channels";

/**
 * Datenzugriff der Website-Interaktionen.
 *
 * Siehe ./channels.ts für die Abgrenzung zum CRM. Kurz: Hier stehen Klicks,
 * dort stehen Anfragen. Die beiden werden nirgends addiert.
 */

/**
 * Tagesbeginn in UTC.
 *
 * Die Spalte ist ein reines Datum. Würde man `new Date()` unverändert
 * speichern, entstünde je nach Server-Zeitzone ein Zeitstempel, und aus einem
 * Tageszähler würde ungewollt eine feinere Spur.
 */
export function toDayBucket(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Zählt einen Klick.
 *
 * `upsert` statt lesen-und-schreiben: Zwei gleichzeitige Klicks würden sich
 * sonst gegenseitig überschreiben. `increment` rechnet in der Datenbank.
 */
export async function recordInteraction(
  channel: InteractionChannel,
  now: Date = new Date(),
): Promise<void> {
  const day = toDayBucket(now);

  await prisma.interactionCounter.upsert({
    where: { channel_day: { channel, day } },
    create: { channel, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export type InteractionStatistics = {
  /** Klicks je Kanal im betrachteten Zeitraum. */
  byChannel: Record<InteractionChannel, number>;
  /** Summe aller Kanäle – ausdrücklich eine Klickzahl, keine Anfragenzahl. */
  total: number;
  /** Betrachteter Zeitraum in Tagen, für die Beschriftung im Admin. */
  periodDays: number;
};

function emptyByChannel(): Record<InteractionChannel, number> {
  return {
    PHONE: 0,
    WHATSAPP: 0,
    EMAIL: 0,
    WILLHABEN: 0,
    AUTOSCOUT: 0,
    GEBRAUCHTWAGEN: 0,
    INSTAGRAM: 0,
  };
}

/**
 * Klicks der letzten `periodDays` Tage, je Kanal.
 *
 * Der Zeitraum wird hier berechnet und nicht in der Seite: `Date.now()` im
 * Render einer Komponente ist unrein und wird vom React-Compiler beanstandet.
 */
export async function getInteractionStatistics(
  periodDays = 30,
  now: Date = new Date(),
): Promise<InteractionStatistics> {
  const since = toDayBucket(
    new Date(now.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000),
  );

  const rows = await prisma.interactionCounter.groupBy({
    by: ["channel"],
    where: { day: { gte: since } },
    _sum: { count: true },
  });

  const byChannel = emptyByChannel();
  let total = 0;

  for (const row of rows) {
    const value = row._sum.count ?? 0;
    byChannel[row.channel] = value;
    total += value;
  }

  return { byChannel, total, periodDays };
}

/** Nur für Tests und Wartung – die Kanäle in fester Reihenfolge. */
export const KNOWN_CHANNELS = INTERACTION_CHANNEL_ORDER;
