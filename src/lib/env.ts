import "server-only";

import { z } from "zod";

/**
 * Serverseitige Umgebungsvariablen.
 *
 * Bewusst *lazy* validiert: `next build` rendert Seiten, ohne dass zwingend
 * alle Integrationen konfiguriert sind. Erst der tatsächliche Zugriff auf eine
 * Variable erzwingt die Prüfung. Damit bleibt der Build grün, während zur
 * Laufzeit trotzdem eine klare Fehlermeldung entsteht.
 *
 * Dieses Modul ist mit `server-only` markiert und kann nicht versehentlich in
 * eine Client-Komponente importiert werden.
 */

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET fehlt oder ist zu kurz (>= 16 Zeichen)"),
  ENCRYPTION_KEY: optionalString,

  VEHICLE_PROVIDER: z
    .enum(["mock", "autopro24", "willhaben"])
    .default("mock"),

  AUTOPRO24_API_BASE_URL: optionalString,
  AUTOPRO24_API_KEY: optionalString,
  AUTOPRO24_DEALER_ID: optionalString,

  WILLHABEN_API_BASE_URL: optionalString,
  WILLHABEN_API_KEY: optionalString,
  WILLHABEN_DEALER_ID: optionalString,

  SYNC_CRON_SECRET: optionalString,

  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: optionalString,
  CONTACT_INBOX_EMAIL: optionalString,

  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().trim().default("gpt-4o-mini"),

  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  INSTAGRAM_REDIRECT_URI: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

function parseEnv(): ServerEnv {
  const result = serverSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Ungültige Umgebungskonfiguration:\n${issues}\n\n` +
        `Bitte .env anhand von .env.example vervollständigen.`,
    );
  }

  return result.data;
}

/**
 * Zugriff auf die validierte Serverkonfiguration.
 * Wirft beim ersten Aufruf, wenn Pflichtvariablen fehlen.
 */
export function env(): ServerEnv {
  cached ??= parseEnv();
  return cached;
}

/** Nur für Tests – erzwingt eine erneute Validierung. */
export function resetEnvCache(): void {
  cached = null;
}

// --- Feature-Flags ---------------------------------------------------------
// Ein nicht konfigurierter Dienst ist kein Fehler. Die UI blendet die
// Funktion aus bzw. zeigt einen Hinweis (US-29).

export function isResendConfigured(): boolean {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.RESEND_FROM_EMAIL && e.CONTACT_INBOX_EMAIL);
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

export function isInstagramConfigured(): boolean {
  const e = env();
  return Boolean(e.INSTAGRAM_APP_ID && e.INSTAGRAM_APP_SECRET && e.INSTAGRAM_REDIRECT_URI);
}

export function isEncryptionConfigured(): boolean {
  return Boolean(env().ENCRYPTION_KEY);
}

/**
 * Basis-URL der Website. NEXT_PUBLIC_ ist absichtlich auch im Client lesbar.
 * Auf Vercel greift VERCEL_PROJECT_PRODUCTION_URL als Fallback.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
