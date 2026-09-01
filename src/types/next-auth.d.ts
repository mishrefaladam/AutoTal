import type { DefaultSession } from "next-auth";

/**
 * Erweiterung der Auth.js-Typen um die projektspezifischen Felder.
 * Ohne diese Deklaration kennt TypeScript weder `session.user.id` noch
 * `session.user.role`.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

export {};
