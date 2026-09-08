import "server-only";

import { createHash } from "node:crypto";

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

  // Vorprüfung in loginAction – greift auf dem regulären Weg über das
  // Anmeldeformular zuerst und liefert die verständliche Meldung.
  login: { bucket: "login", limit: 10, windowSeconds: 60 * 15 },

  // Harte Grenze direkt im Credentials-Provider. Sie greift auf JEDEM Weg,
  // auch bei einem direkten POST auf /api/auth/callback/credentials – dieser
  // Endpunkt geht nicht durch loginAction und war deshalb ungebremst.
  // Bewusst höher als `login`, damit auf dem regulären Weg weiterhin die
  // freundliche Meldung von `login` zuerst erscheint.
  loginCredentials: { bucket: "login-credentials", limit: 20, windowSeconds: 60 * 15 },

  // Kontobezogen statt nur nach IP: Gegen verteilte Angriffe (Credential
  // Stuffing) aus vielen Adressen hilft ein IP-Limit allein nicht.
  loginAccount: { bucket: "login-account", limit: 30, windowSeconds: 60 * 15 },
  // Klickzähler der Website-Interaktionen. Großzügig, weil ein Besucher
  // mehrere Schaltflächen ausprobieren darf – aber nicht offen, sonst ließe
  // sich die Statistik von außen beliebig aufblasen.
  interaction: { bucket: "interaction", limit: 60, windowSeconds: 60 * 10 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Sekunden bis zum Zurücksetzen des Fensters */
  retryAfterSeconds: number;
};

/**
 * Kopfzeilen, aus denen die Client-Adresse gelesen wird – in dieser
 * Reihenfolge.
 *
 * Hinter einem Reverse Proxy ist jede dieser Angaben nur so vertrauenswürdig
 * wie der Proxy, der sie setzt: Der Client schickt seine Anfrage samt
 * beliebiger Kopfzeilen, und nur der Proxy kann sie überschreiben. Deshalb
 * zuerst die von Vercel selbst gesetzten und für Clients reservierten Felder,
 * und erst danach `x-forwarded-for`, das jeder Absender mitschicken kann.
 *
 * Ohne diese Reihenfolge bestimmt der Absender selbst, in welchen Zähler er
 * einsortiert wird – und kann jedes Limit umgehen, indem er den Wert pro
 * Anfrage variiert.
 */
const CLIENT_IDENTIFIER_HEADERS = [
  "x-vercel-forwarded-for",
  "x-real-ip",
  "x-forwarded-for",
] as const;

/** Nimmt `Headers` ebenso wie das Ergebnis von `next/headers`. */
type HeaderReader = { get(name: string): string | null };

/**
 * Ermittelt die Client-Adresse aus bereits vorliegenden Kopfzeilen.
 *
 * Eigene Funktion, weil sie auch dort gebraucht wird, wo `next/headers` nicht
 * zur Verfügung steht – etwa im Credentials-Provider von Auth.js, der die
 * ursprüngliche Anfrage als Argument bekommt.
 *
 * Fällt auf einen konstanten Bucket zurück, wenn nichts ermittelbar ist –
 * dann teilen sich unbekannte Clients ein Limit, was bewusst konservativ ist.
 */
export function clientIdentifierFromHeaders(headerList: HeaderReader): string {
  for (const name of CLIENT_IDENTIFIER_HEADERS) {
    // Mehrere Stationen stehen kommagetrennt; die erste ist der Ursprung.
    const first = headerList.get(name)?.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

/** Client-Adresse der laufenden Anfrage. */
export async function getClientIdentifier(): Promise<string> {
  return clientIdentifierFromHeaders(await headers());
}

/**
 * Schlüssel für kontobezogene Limits.
 *
 * Die E-Mail-Adresse wird gehasht, statt sie im Klartext in die Zählertabelle
 * zu schreiben: Der Zähler muss nur wiedererkennen, ob es dieselbe Adresse
 * ist – wissen muss er sie nicht. Die Zeilen laufen ohnehin ab und werden
 * aufgeräumt.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("base64url")
    .slice(0, 32);
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
