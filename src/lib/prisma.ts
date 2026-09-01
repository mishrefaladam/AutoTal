import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma-Singleton.
 *
 * Prisma 7 arbeitet mit Driver Adaptern statt der Rust-Query-Engine – hier
 * `@prisma/adapter-pg` auf Basis von node-postgres.
 *
 * Im Dev-Modus würde Hot Reloading bei jedem Rebuild eine neue Instanz
 * erzeugen und den Connection Pool erschöpfen, deshalb der globale Cache.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL fehlt. Bitte .env anhand von .env.example vervollständigen.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
