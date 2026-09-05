import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Car, ImageOff, Plus } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  VehicleOverview,
  VehicleStatusTabs,
} from "@/components/admin/vehicle-overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { formatEuro, formatKilometers } from "@/lib/money";
import { cn } from "@/lib/utils";
import { countOpenPurchaseInquiries } from "@/modules/purchase-inquiries/repository";
import {
  countVehiclesByStatus,
  listVehiclesForAdmin,
} from "@/modules/vehicles/admin-repository";
import {
  VEHICLE_STATUS_LABELS,
  formatDateTime,
} from "@/modules/vehicles/labels";
import type { VehicleStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Fahrzeuge" };

/**
 * Fahrzeuge von AutoTal (eigener Bestand).
 *
 * Hier stehen ausschließlich Fahrzeuge, die AutoTal selbst führt. Fahrzeuge,
 * die Kundinnen und Kunden AutoTal anbieten, liegen unter /admin/ankauf und
 * werden bewusst nicht vermischt – das sind ungeprüfte Fremdangaben.
 *
 * Diese Datensätze speisen NICHT die öffentliche Fahrzeugbörse; die kommt aus
 * dem eingebetteten willhaben-Widget. Sie sind Datenbasis für Social Media
 * und die interne Bestandsführung.
 */

/** Erlaubte Werte des ?status=-Filters, klein geschrieben wie in der URL. */
const STATUS_BY_PARAM: Record<string, VehicleStatus> = {
  in_stock: "IN_STOCK",
  reserved: "RESERVED",
  sold: "SOLD",
};

export default async function AdminVehiclesPage({
  searchParams,
}: PageProps<"/admin/fahrzeuge">) {
  const params = await searchParams;
  const rawStatus = Array.isArray(params.status)
    ? params.status[0]
    : params.status;

  // Unbekannte Werte fallen still auf "alle" zurück, statt eine leere Liste
  // ohne Erklärung zu zeigen.
  const activeStatus = rawStatus
    ? (STATUS_BY_PARAM[rawStatus.toLowerCase()] ?? null)
    : null;

  const [vehicles, counts, openInquiries] = await Promise.all([
    listVehiclesForAdmin(activeStatus ?? undefined),
    countVehiclesByStatus(),
    countOpenPurchaseInquiries(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Fahrzeuge"
        description="Der eigene Bestand von AutoTal. Fahrzeuge, die Kundinnen und Kunden anbieten, stehen unter Ankaufanfragen."
        action={
          <Button asChild variant="brand" size="xl">
            <Link href="/admin/fahrzeuge/neu">
              <Plus data-icon="inline-start" aria-hidden="true" />
              Fahrzeug anlegen
            </Link>
          </Button>
        }
      />

      <VehicleOverview counts={counts} openInquiries={openInquiries} />

      {counts.total > 0 && (
        <VehicleStatusTabs counts={counts} activeStatus={activeStatus} />
      )}

      {vehicles.length === 0 ? (
        <AdminCard>
          <div className="py-12 text-center">
            <Car className="text-muted-foreground mx-auto size-9" aria-hidden="true" />
            <h2 className="font-display mt-4 text-lg font-bold">
              {counts.total === 0
                ? "Noch keine Fahrzeuge"
                : `Kein Fahrzeug mit Status „${
                    activeStatus ? VEHICLE_STATUS_LABELS[activeStatus] : ""
                  }“`}
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
              {counts.total === 0
                ? "Legen Sie das erste Fahrzeug an. Sie können danach Bilder hochladen und den Status jederzeit ändern."
                : "Wählen Sie oben einen anderen Status oder legen Sie ein Fahrzeug an."}
            </p>
            <Button asChild variant="brand" size="xl" className="mt-6">
              <Link href="/admin/fahrzeuge/neu">
                <Plus data-icon="inline-start" aria-hidden="true" />
                Fahrzeug anlegen
              </Link>
            </Button>
          </div>
        </AdminCard>
      ) : (
        <ul className="space-y-3">
          {vehicles.map((vehicle) => {
            const editable = vehicle.externalSource === MANUAL_SOURCE;

            return (
              <li key={vehicle.id}>
                <article
                  className={cn(
                    "border-border bg-background flex flex-wrap items-center gap-4 rounded-xl border p-4",
                    !vehicle.active && "opacity-70",
                  )}
                >
                  <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-lg">
                    {vehicle.primaryImageUrl ? (
                      <Image
                        src={vehicle.primaryImageUrl}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center">
                        <ImageOff className="size-5" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{vehicle.title}</h2>

                      {vehicle.status !== "IN_STOCK" && (
                        <Badge
                          className={cn(
                            "border-transparent",
                            vehicle.status === "SOLD"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/15 text-warning-foreground",
                          )}
                        >
                          {VEHICLE_STATUS_LABELS[vehicle.status]}
                        </Badge>
                      )}

                      {!vehicle.active && (
                        <Badge variant="secondary">offline</Badge>
                      )}

                      {/* Altbestand aus einer früheren Datenquelle. Es gibt
                          keine Synchronisierung mehr, die solche Datensätze
                          nachführt – deshalb "Altbestand" statt eines
                          Quellennamens, der Automatik suggeriert. */}
                      {!editable && (
                        <Badge variant="secondary" title={`Quelle: ${vehicle.externalSource}`}>
                          Altbestand
                        </Badge>
                      )}

                      {vehicle.imageCount === 0 && (
                        <Badge className="bg-warning/15 text-warning-foreground border-transparent">
                          ohne Bild
                        </Badge>
                      )}
                    </div>

                    <p className="text-muted-foreground tabular mt-1 text-sm">
                      {formatEuro(vehicle.priceCents)} ·{" "}
                      {formatKilometers(vehicle.mileageKm)} ·{" "}
                      {vehicle.imageCount}{" "}
                      {vehicle.imageCount === 1 ? "Bild" : "Bilder"}
                    </p>

                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Zuletzt geändert {formatDateTime(vehicle.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {editable ? (
                      <Button asChild variant="outline" size="xl">
                        <Link href={`/admin/fahrzeuge/${vehicle.id}`}>
                          Bearbeiten
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="xl" disabled>
                        Nicht bearbeitbar
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
