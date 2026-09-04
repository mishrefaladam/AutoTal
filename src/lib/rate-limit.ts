import "server-only";

import { headers } from "next/headers";

import { logger } from "./logger";
import { prisma } from "./prisma";

/**
 * Fixed-Window Rate Limiting für öffentliche Formulare.
 *
 * Umsetzung über die Datenbank, damit das Limit auch bei mehreren
 * serverless Instanzen greift – ein reiner In-Memory-Zähler wäre auf Vercel
 * pro Lambda isoliert und damit wirkungslos.
 *
 * Fällt die Datenbank aus, wird die Anfrage *durchgelassen* (fail-open) und
 * geloggt: Ein kaputter Zähler soll nicht das Kontaktformular blockieren.
 */

export type RateLimitRule = {
  /** Namensraum, z. B. "contact" */
  bucket: string;
  /** Maximale Anzahl Anfragen pro Fenster */
  limit: number;
  /** Fensterlänge in Sekunden */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  contact: { bucket: "contact", limit: 5, windowSeconds: 60 * 10 },
  vehicleInquiry: { bucket: "vehicle-inquiry", limit: 5, windowSeconds: 60 * 10 },
  testDrive: { bucket: "test-drive", limit: 3, windowSeconds: 60 * 10 },
  sellCar: { bucket: "sell-car", limit: 3, windowSeconds: 60 * 30 },
  login: { bucket: "login", limit: 10, windowSeconds: 60 * 15 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Sekunden bis zum Zurücksetzen des Fensters */
  retryAfterSeconds: number;
};

/**
 * Ermittelt die Client-IP hinter dem Vercel-/Proxy-Layer.
 * Fällt auf einen konstanten Bucket zurück, wenn nichts ermittelbar ist –
 * dann teilen sich unbekannte Clients ein Limit, was bewusst konservativ ist.
 */
export async function getClientIdentifier(): Promise<string> {
  const headerList = await headers();

  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return headerList.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const key = `${rule.bucket}:${identifier}`;
  const now = new Date();
  const windowMs = rule.windowSeconds * 1000;
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    // Ein einzelnes PostgreSQL-Statement verhindert Race Conditions bei
    // parallelen Requests derselben IP.
    const rows = await prisma.$queryRaw<
      { count: number; expiresAt: Date }[]
    >`
      INSERT INTO "RateLimitCounter" ("key", "count", "windowStart", "expiresAt")
      VALUES (${key}, 1, ${now}, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN 1
          ELSE "RateLimitCounter"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN ${now}
          ELSE "RateLimitCounter"."windowStart"
        END,
        "expiresAt" = CASE
          WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN ${expiresAt}
          ELSE "RateLimitCounter"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const updated = rows[0];
    if (!updated) {
      throw new Error("Rate-Limit-Zähler konnte nicht aktualisiert werden.");
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((updated.expiresAt.getTime() - now.getTime()) / 1000),
    );

    if (updated.count > rule.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - updated.count),
      retryAfterSeconds,
    };
  } catch (error) {
    logger.error("Rate-Limit-Prüfung fehlgeschlagen – Anfrage wird zugelassen", {
      bucket: rule.bucket,
      error,
    });
    return {
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: rule.windowSeconds,
    };
  }
}

/** Bequeme Kurzform: Limit anhand der Client-IP prüfen. */
export async function checkRateLimitForRequest(
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  return checkRateLimit(rule, await getClientIdentifier());
}

export function rateLimitMessage(result: RateLimitResult): string {
  const minutes = Math.ceil(result.retryAfterSeconds / 60);
  return (
    `Es wurden zu viele Anfragen von diesem Anschluss gesendet. ` +
    `Bitte versuchen Sie es in ${minutes} ${minutes === 1 ? "Minute" : "Minuten"} erneut – ` +
    `oder rufen Sie uns einfach direkt an.`
  );
}

/** Aufräumen abgelaufener Zähler. Wird vom Sync-Cron mitgenommen. */
export async function pruneRateLimitCounters(): Promise<number> {
  try {
    const { count } = await prisma.rateLimitCounter.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  } catch (error) {
    logger.warn("Aufräumen der Rate-Limit-Zähler fehlgeschlagen", { error });
    return 0;
  }
}
