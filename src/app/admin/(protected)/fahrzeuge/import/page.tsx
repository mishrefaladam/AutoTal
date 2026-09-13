import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MissingVehiclesCleanup } from "@/components/admin/missing-vehicles-cleanup";
import { VehicleImport } from "@/components/admin/vehicle-import";
import { Button } from "@/components/ui/button";
import { countMissingImportedVehicles } from "@/modules/vehicles/admin-repository";

export const metadata: Metadata = { title: "Fahrzeugbestand aktualisieren" };

/**
 * Bestandsimport aus einer CSV-Datei des Händlersystems.
 *
 * Die Seite liegt in der geschützten Route-Gruppe – ohne Anmeldung führt jeder
 * Aufruf zur Anmeldeseite. Der Upload-Endpunkt prüft die Anmeldung zusätzlich
 * selbst.
 */
export default async function VehicleImportPage() {
  const missing = await countMissingImportedVehicles();

  return (
    <>
      <AdminPageHeader
        title="Fahrzeugbestand aktualisieren"
        description="Die CSV enthält den Fahrzeugbestand. Eine zusätzliche Fahrzeuglisten-PDF kann technische Daten und Bilder ergänzen. Sie sehen zuerst, was passieren würde, und bestätigen danach ausdrücklich."
        action={
          <Button asChild variant="outline" size="xl">
            <Link href="/admin/fahrzeuge">
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Zurück
            </Link>
          </Button>
        }
      />

      <VehicleImport />

      {/* Steht unter dem Import, weil es dessen Folge ist: Erst der Import mit
          der richtigen Datei markiert das Zuviel als fehlend, dann lässt es
          sich hier in einem Schritt entfernen. */}
      <div className="mt-6">
        <MissingVehiclesCleanup deletable={missing.deletable} kept={missing.kept} />
      </div>
    </>
  );
}
