import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { VehicleImageManager } from "@/components/admin/vehicle-image-manager";
import { VehiclePriceSheet } from "@/components/admin/vehicle-price-sheet";
import { VehicleDangerZone } from "@/components/admin/vehicle-danger-zone";
import { Button } from "@/components/ui/button";
import { getFileStorage } from "@/integrations/storage";
import { isEditableSource } from "@/modules/vehicles/constants";
import { centsToEuros, formatEuro, formatKilometers } from "@/lib/money";
import { formatMonthYear } from "@/modules/vehicles/labels";
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

  const editable = isEditableSource(vehicle.externalSource);

  const defaultValues: VehicleFormValues = {
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant ?? "",
    stockNumber: vehicle.stockNumber ?? "",
    vin: vehicle.vin ?? "",
    priceEuro: String(Math.round(centsToEuros(vehicle.priceCents))),
    listPriceEuro:
      vehicle.listPriceCents === null
        ? ""
        : String(Math.round(centsToEuros(vehicle.listPriceCents))),
    vatDeductible: vehicle.vatDeductible,
    mileageKm: String(vehicle.mileageKm),
    firstRegistration: toMonthValue(vehicle.firstRegistration),
    // Leer statt geraten: Ein importiertes Fahrzeug ohne Angabe zwingt beim
    // Speichern zur bewussten Auswahl, statt still einen Wert zu erfinden.
    fuel: vehicle.fuel ?? "",
    transmission: vehicle.transmission ?? "",
    drivetrain: vehicle.drivetrain ?? "",
    bodyType: vehicle.bodyType,
    condition: vehicle.condition,
    status: vehicle.status,
    powerKw: vehicle.powerKw !== null ? String(vehicle.powerKw) : "",
    displacementCcm:
      vehicle.displacementCcm !== null ? String(vehicle.displacementCcm) : "",
    grossWeightKg:
      vehicle.grossWeightKg !== null ? String(vehicle.grossWeightKg) : "",
    nationalCode: vehicle.nationalCode ?? "",
    vehicleType: vehicle.vehicleType ?? "",
    daysInStock: vehicle.daysInStock !== null ? String(vehicle.daysInStock) : "",
    color: vehicle.color ?? "",
    doors: vehicle.doors !== null ? String(vehicle.doors) : "",
    seats: vehicle.seats !== null ? String(vehicle.seats) : "",
    previousOwners:
      vehicle.previousOwners !== null ? String(vehicle.previousOwners) : "",
    inspectionValidUntil: toDateValue(vehicle.inspectionValidUntil),
    description: vehicle.description,
    features: vehicle.features.join("\n"),
    extras: vehicle.extras.join("\n"),
    highlights: vehicle.highlights.join("\n"),
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
            ? "Datenbasis für Social Media und die interne Bestandsführung. Der öffentliche Bestand kommt aus der eingebetteten willhaben-Börse."
            : `Altbestand aus der früheren Quelle „${vehicle.externalSource}“. Diese Datensätze werden nicht mehr nachgeführt und sind deshalb schreibgeschützt.`
        }
      />

      {/*
        * Kennzeile: Zwei gleich benannte Fahrzeuge unterscheiden sich hier an
        * Erstzulassung, Laufleistung, Preis, Farbe und Kennungen. Die FIN
        * steht auf dieser geschützten Seite vollständig – öffentlich
        * erscheint sie nirgends.
        */}
      <dl className="border-border bg-muted/40 mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border px-4 py-3 text-sm">
        {[
          { label: "Erstzulassung", value: formatMonthYear(vehicle.firstRegistration) },
          { label: "Kilometerstand", value: formatKilometers(vehicle.mileageKm) },
          { label: "Preis", value: formatEuro(vehicle.priceCents) },
          { label: "Farbe", value: vehicle.color },
          { label: "GW-Nr", value: vehicle.stockNumber },
          { label: "FIN", value: vehicle.vin },
          { label: "Herkunft", value: vehicle.importSource ?? vehicle.externalSource },
        ]
          .filter((entry) => entry.value)
          .map((entry) => (
            <div key={entry.label}>
              <dt className="text-muted-foreground text-xs">{entry.label}</dt>
              <dd className="tabular font-medium">{entry.value}</dd>
            </div>
          ))}
      </dl>

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

        {editable && <VehiclePriceSheet vehicleId={vehicle.id} />}

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
            {/*
              * Der frühere Text verwies auf einen Abgleich und eine
              * Umgebungsvariable, die es beide nicht mehr gibt. Geblieben ist
              * nur der Altbestand aus der abgeschalteten Quelle.
              */}
            <p className="text-muted-foreground text-sm leading-relaxed">
              Dieses Fahrzeug stammt aus der früheren Datenquelle
              „{vehicle.externalSource}“. Solche Datensätze wurden nie im Admin
              gepflegt und ihre Herkunft ist nicht mehr nachvollziehbar –
              deshalb bleiben sie schreibgeschützt. Fahrzeuge aus dem
              CSV-Bestandsimport und von Hand angelegte Fahrzeuge lassen sich
              dagegen vollständig bearbeiten.
            </p>
          </AdminCard>
        )}
      </div>
    </>
  );
}
