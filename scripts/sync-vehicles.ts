import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { syncVehicles } from "@/modules/vehicles/sync";

/**
 * Fahrzeugsynchronisierung von der Kommandozeile.
 *
 *   npm run vehicles:sync
 *
 * Nützlich für einen manuellen Abgleich und als Aufhänger für einen
 * Cronjob außerhalb von Vercel. In der Anwendung selbst läuft derselbe
 * Code über /admin/integrationen und /api/cron/sync-vehicles.
 */

async function main() {
  const result = await syncVehicles({ triggeredBy: "cli" });

  console.log(
    JSON.stringify(
      {
        quelle: result.source,
        status: result.status,
        gefunden: result.vehiclesFound,
        neu: result.vehiclesCreated,
        aktualisiert: result.vehiclesUpdated,
        deaktiviert: result.vehiclesDeactivated,
        fehler: result.errorMessage,
      },
      null,
      2,
    ),
  );

  if (result.status === "FAILED") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Synchronisierung fehlgeschlagen:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
