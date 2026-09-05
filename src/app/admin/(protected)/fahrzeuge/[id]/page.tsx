import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { VehicleImageManager } from "@/components/admin/vehicle-image-manager";
import { VehicleDangerZone } from "@/components/admin/vehicle-danger-zone";
import { Button } from "@/components/ui/button";
import { getFileStorage } from "@/integrations/storage";
import { MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { centsToEuros } from "@/lib/money";
import { getVehicleForEdit } from "@/modules/vehicles/admin-repository";
import type { VehicleFormValues } from "@/modules/vehicles/admin-schemas";

export const metadata: Metadata = { title: "Fahrzeug bearbeiten" };

/** Date -> "JJJJ-MM" für <input type="month">. */
function toMonthValue(date: Date | null): string {
  if (!date) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Date -> "JJJJ-MM-TT" für <input type="date">. */
function toDateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditVehiclePage({
  params,
}: PageProps<"/admin/fahrzeuge/[id]">) {
  const { id } = await params;
  const vehicle = await getVehicleForEdit(id);

  if (!vehicle) notFound();

  const title = [vehicle.make, vehicle.model, vehicle.variant]
    .filter(Boolean)
    .join(" ");

  const editable = vehicle.externalSource === MANUAL_SOURCE;

  const defaultValues: VehicleFormValues = {
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant ?? "",
    priceEuro: String(Math.round(centsToEuros(vehicle.priceCents))),
    vatDeductible: vehicle.vatDeductible,
    mileageKm: String(vehicle.mileageKm),
    firstRegistration: toMonthValue(vehicle.firstRegistration),
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    condition: vehicle.condition,
    status: vehicle.status,
    powerKw: vehicle.powerKw !== null ? String(vehicle.powerKw) : "",
    displacementCcm:
      vehicle.displacementCcm !== null ? String(vehicle.displacementCcm) : "",
    color: vehicle.color ?? "",
    doors: vehicle.doors !== null ? String(vehicle.doors) : "",
    seats: vehicle.seats !== null ? String(vehicle.seats) : "",
    previousOwners:
      vehicle.previousOwners !== null ? String(vehicle.previousOwners) : "",
    inspectionValidUntil: toDateValue(vehicle.inspectionValidUntil),
    description: vehicle.description,
    features: vehicle.features.join("\n"),
    internalNotes: vehicle.internalNotes,
    active: vehicle.active,
  };

  const storage = getFileStorage();
  const storageHint =
    storage.kind === "local"
      ? "Die Bilder liegen derzeit im lokalen Dateisystem. Für den Livebetrieb " +
        "wird ein Vercel-Blob-Store benötigt – auf Vercel ist das Dateisystem " +
        "schreibgeschützt und bei jedem Deployment leer."
      : null;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/admin/fahrzeuge">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Zurück zur Übersicht
        </Link>
      </Button>

      <AdminPageHeader
        title={title}
        description={
          editable
            ? "Änderungen wirken sich sofort auf die öffentliche Website aus."
            : `Dieses Fahrzeug stammt aus der Quelle „${vehicle.externalSource}“ und wird bei der nächsten Synchronisierung überschrieben.`
        }
        action={
          vehicle.active ? (
            <Button asChild variant="outline" size="xl">
              <a
                href={`/fahrzeuge/${vehicle.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                Auf der Website ansehen
              </a>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <VehicleImageManager
          vehicleId={vehicle.id}
          images={vehicle.images.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alt,
          }))}
          storageHint={storageHint}
        />

        {editable ? (
          <>
            <VehicleForm
              mode="edit"
              vehicleId={vehicle.id}
              defaultValues={defaultValues}
            />
            <VehicleDangerZone vehicleId={vehicle.id} title={title} />
          </>
        ) : (
          <AdminCard title="Nicht bearbeitbar">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Fahrzeugdaten aus einer externen Quelle lassen sich hier nicht
              ändern – die nächste Synchronisierung würde jede Änderung
              zurücksetzen. Bearbeiten Sie das Fahrzeug beim Anbieter, oder
              stellen Sie <code className="bg-muted rounded px-1 py-0.5 text-xs">VEHICLE_PROVIDER</code>{" "}
              auf <code className="bg-muted rounded px-1 py-0.5 text-xs">manual</code>,
              wenn der Bestand künftig hier gepflegt werden soll.
            </p>
          </AdminCard>
        )}
      </div>
    </>
  );
}
