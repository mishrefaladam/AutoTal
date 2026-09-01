import { handlers } from "@/lib/auth";

/**
 * Auth.js-Endpunkte (Anmeldung, Abmeldung, Session, CSRF).
 *
 * Läuft in der Node-Laufzeit, weil der Credentials-Provider bcrypt und
 * Prisma benötigt.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
