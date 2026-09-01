import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

/**
 * Middleware-Schutz für /admin (US-14).
 *
 * Erste Hürde: Ohne gültiges Session-Token führt jeder Aufruf unterhalb von
 * /admin zur Anmeldeseite. Die Middleware nutzt nur die edge-taugliche
 * Basiskonfiguration – sie verifiziert das signierte Token, greift aber nicht
 * auf die Datenbank zu.
 *
 * Die eigentliche Autorisierung passiert serverseitig in `requireAdmin()`
 * (src/modules/admin/auth.ts): Dort wird bei jedem Aufruf geprüft, ob der
 * Benutzer noch existiert und aktiv ist. Sonst käme jemand, dessen Zugang
 * gerade gesperrt wurde, bis zum Ablauf des Tokens weiter hinein.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  /**
   * Alles außer statischen Dateien und Bildern.
   * Die Auth-Routen selbst müssen erreichbar bleiben, sonst wäre die
   * Anmeldung nicht möglich.
   */
  matcher: ["/admin/:path*"],
};
