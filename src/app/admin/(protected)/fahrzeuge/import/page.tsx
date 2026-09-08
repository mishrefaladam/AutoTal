import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { VehicleImport } from "@/components/admin/vehicle-import";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Bestand importieren" };

/**
 * Bestandsimport aus einer CSV-Datei des Händlersystems.
 *
 * Die Seite liegt in der geschützten Route-Gruppe – ohne Anmeldung führt jeder
 * Aufruf zur Anmeldeseite. Der Upload-Endpunkt prüft die Anmeldung zusätzlich
 * selbst.
 */
export default function VehicleImportPage() {
  return (
    <>
      <AdminPageHeader
        title="Bestand importieren"
        description="Laden Sie den CSV-Export aus Ihrem Fahrzeugverwaltungssystem hoch. Sie sehen zuerst, was passieren würde, und lösen den Import danach ausdrücklich aus."
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
    </>
  );
}
