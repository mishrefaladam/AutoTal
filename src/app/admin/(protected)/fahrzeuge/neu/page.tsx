import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { Button } from "@/components/ui/button";
import { EMPTY_VEHICLE_FORM } from "@/modules/vehicles/admin-schemas";

export const metadata: Metadata = { title: "Fahrzeug anlegen" };

export default function NewVehiclePage() {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/admin/fahrzeuge">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Zurück zur Übersicht
        </Link>
      </Button>

      <AdminPageHeader
        title="Fahrzeug anlegen"
        description="Nach dem Speichern können Sie die Bilder hochladen."
      />

      <VehicleForm mode="create" defaultValues={EMPTY_VEHICLE_FORM} />
    </>
  );
}
