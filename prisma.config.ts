import "dotenv/config";
import { defineConfig } from "prisma/config";

import { resolveMigrationUrl } from "./prisma/migration-url";

/**
 * Konfiguration der Prisma-CLI (Migrationen, Studio, Generate).
 *
 * Zur Laufzeit verbindet sich die Anwendung über den Driver Adapter in
 * src/lib/prisma.ts – dort über DATABASE_URL.
 *
 * MIGRATIONEN BRAUCHEN EINE DIREKTE VERBINDUNG:
 * Verwaltete Postgres-Anbieter wie Neon stellen zwei Endpunkte bereit – einen
 * gepoolten (PgBouncer, Hostname mit "-pooler") für die Anwendung und einen
 * direkten für Wartungsarbeiten. `prisma migrate deploy` nimmt einen Advisory
 * Lock, und der ist sitzungsgebunden; über einen Transaction-Pooler kann er
 * verlorengehen, sodass die Migration hängt oder fehlschlägt.
 *
 * Deshalb: Ist DATABASE_URL_UNPOOLED brauchbar gesetzt, laufen Migrationen
 * darüber. DIRECT_URL bleibt als Legacy-Fallback erhalten, DATABASE_URL als
 * letzter Fallback für lokale Entwicklung. Es kommt keine manuell duplizierte
 * Pflichtvariable hinzu.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveMigrationUrl(),
  },
});
