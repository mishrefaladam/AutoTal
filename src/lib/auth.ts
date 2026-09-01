import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { logger } from "./logger";
import { prisma } from "./prisma";

/**
 * Vollständige Auth.js-Konfiguration (Node-Laufzeit).
 *
 * Anmeldung über E-Mail und Passwort gegen die Tabelle `AdminUser`.
 * Passwörter liegen ausschließlich als bcrypt-Hash vor.
 *
 * Sicherheitsentscheidungen:
 *   - Bei falscher E-Mail wird trotzdem ein Hash-Vergleich durchgeführt.
 *     Sonst wäre an der Antwortzeit ablesbar, welche Adressen existieren.
 *   - Fehlermeldungen unterscheiden nicht zwischen "Benutzer unbekannt" und
 *     "Passwort falsch".
 *   - Deaktivierte Benutzer (`active: false`) können sich nicht anmelden.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Dummy-Hash für den Zeitabgleich bei unbekannter E-Mail-Adresse.
 * Entspricht einem bcrypt-Hash mit denselben Kostenfaktoren wie echte Hashes.
 */
const TIMING_SAFE_DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9UwPT7yQyrsxTKr/EmVIhOsfx0nzxLu";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },

      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);

        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.adminUser.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
            passwordHash: true,
          },
        });

        // Auch ohne Treffer wird verglichen – konstante Antwortzeit.
        const passwordMatches = await bcrypt.compare(
          password,
          user?.passwordHash ?? TIMING_SAFE_DUMMY_HASH,
        );

        if (!user || !user.active || !passwordMatches) {
          logger.warn("Fehlgeschlagener Anmeldeversuch im Adminbereich");
          return null;
        }

        // Nicht blockierend: Ein Fehler beim Zeitstempel darf die Anmeldung
        // nicht verhindern.
        prisma.adminUser
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch((error) =>
            logger.warn("lastLoginAt konnte nicht aktualisiert werden", { error }),
          );

        logger.info("Anmeldung im Adminbereich erfolgreich", { userId: user.id });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
