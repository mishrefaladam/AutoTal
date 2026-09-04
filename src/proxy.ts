import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

/**
 * Proxy-Schutz für /admin (US-14).
 *
 * Erste Hürde: Ohne gültiges Session-Token führt jeder Aufruf unterhalb von
 * /admin zur Anmeldeseite. Der Proxy nutzt nur die edge-taugliche
 * Basiskonfiguration – er verifiziert das signierte Token, greift aber nicht
 * auf die Datenbank zu.
 *
 * Die eigentliche Autorisierung passiert serverseitig in `requireAdmin()`
 * (src/modules/admin/auth.ts): Dort wird bei jedem Aufruf geprüft, ob der
 * Benutzer noch existiert und aktiv ist. Sonst käme jemand, dessen Zugang
 * gerade gesperrt wurde, bis zum Ablauf des Tokens weiter hinein.
 */
const { auth: authProxy } = NextAuth(authConfig);

export default authProxy((request) => {
  if (request.nextUrl.hostname === "www.autotal.at") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "autotal.at";
    url.port = "";

    return NextResponse.redirect(url, 308);
  }
});

export const config = {
  /**
   * Alles außer Next-Assets und Bilddateien.
   * Die Auth-Routen selbst müssen erreichbar bleiben, sonst wäre die
   * Anmeldung nicht möglich.
   */
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
