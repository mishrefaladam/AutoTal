import type { NextAuthConfig } from "next-auth";

/**
 * Edge-taugliche Basiskonfiguration von Auth.js.
 *
 * Enthält bewusst KEINE Provider: Der Credentials-Provider braucht Prisma und
 * bcrypt, und beides läuft nicht in der Edge-Laufzeit der Middleware. Die
 * Middleware bindet nur diese Datei ein und prüft damit ausschließlich das
 * bereits signierte Session-Token.
 *
 * Die vollständige Konfiguration steht in src/lib/auth.ts.
 */
export const authConfig = {
  // Leer und in src/lib/auth.ts überschrieben: Der Credentials-Provider
  // braucht Prisma und bcrypt, die in der Edge-Laufzeit nicht laufen.
  providers: [],

  // Credentials erfordern die JWT-Strategie – es gibt keine Session-Tabelle.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },

  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },

  trustHost: true,

  callbacks: {
    /**
     * Rolle und Benutzer-ID ins Token übernehmen, damit die Middleware und
     * Server-Komponenten sie ohne Datenbankzugriff lesen können.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "ADMIN";
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },

    /**
     * Grobe Zugangskontrolle für die Middleware.
     *
     * Das ist die erste, nicht die einzige Hürde: Jede Admin-Seite und jede
     * Admin-Action prüft zusätzlich serverseitig gegen die Datenbank
     * (siehe requireAdmin()). Ein Benutzer, der nach der Token-Ausstellung
     * deaktiviert wurde, käme sonst bis zum Ablauf des Tokens weiter hinein.
     */
    authorized({ auth, request }) {
      const isAdminArea = request.nextUrl.pathname.startsWith("/admin");
      const isLoginPage = request.nextUrl.pathname === "/admin/login";

      if (isLoginPage) return true;
      if (!isAdminArea) return true;

      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
