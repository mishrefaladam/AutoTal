import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Konfiguration der Prisma-CLI (Migrationen, Studio, Generate).
 *
 * Zur Laufzeit verbindet sich die Anwendung über den Driver Adapter in
 * src/lib/prisma.ts – ebenfalls über DATABASE_URL.
 *
 * MIGRATIONEN BRAUCHEN EINE DIREKTE VERBINDUNG:
 * Verwaltete Postgres-Anbieter wie Neon stellen zwei Endpunkte bereit – einen
 * gepoolten (PgBouncer, Hostname mit "-pooler") für die Anwendung und einen
 * direkten für Wartungsarbeiten. `prisma migrate deploy` nimmt einen
 * Advisory Lock, und der ist sitzungsgebunden; über einen Transaction-Pooler
 * kann er verlorengehen, sodass die Migration hängt oder fehlschlägt.
 *
 * Deshalb: Ist DIRECT_URL gesetzt, laufen Migrationen darüber. Ist sie nicht
 * gesetzt – etwa lokal, wo es keinen Pooler gibt –, bleibt es bei
 * DATABASE_URL. Es kommt also keine Pflichtvariable hinzu.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
