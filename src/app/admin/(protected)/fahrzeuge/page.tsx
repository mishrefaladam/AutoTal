import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Car, ExternalLink, ImageOff, Plus } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { formatEuro, formatKilometers } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listVehiclesForAdmin } from "@/modules/vehicles/admin-repository";
import {
  VEHICLE_STATUS_LABELS,
  formatDateTime,
} from "@/modules/vehicles/labels";

export const metadata: Metadata = { title: "Fahrzeuge" };

/**
 * Fahrzeugübersicht im Admin.
 *
 * Zeigt auch Fahrzeuge aus externen Quellen an – die sind aber nicht
 * bearbeitbar, weil der nächste Sync jede Änderung überschreiben würde.
 */
export default async function AdminVehiclesPage() {
  const vehicles = await listVehiclesForAdmin();

  const inStock = vehicles.filter(
    (vehicle) => vehicle.status === "IN_STOCK",
  ).length;
  const sold = vehicles.filter((vehicle) => vehicle.status === "SOLD").length;
  const external = vehicles.filter(
    (vehicle) => vehicle.externalSource !== MANUAL_SOURCE,
  ).length;

  return (
    <>
      <AdminPageHeader
        title="Fahrzeuge"
        description={
          `${inStock} im Bestand, ${sold} verkauft, ${vehicles.length} insgesamt.` +
          (external > 0
            ? ` ${external} stammen aus einer externen Quelle und werden dort gepflegt.`
            : "")
        }
        action={
          <Button asChild variant="brand" size="xl">
            <Link href="/admin/fahrzeuge/neu">
              <Plus data-icon="inline-start" aria-hidden="true" />
              Fahrzeug anlegen
            </Link>
          </Button>
        }
      />

      {vehicles.length === 0 ? (
        <AdminCard>
          <div className="py-12 text-center">
            <Car className="text-muted-foreground mx-auto size-9" aria-hidden="true" />
            <h2 className="font-display mt-4 text-lg font-bold">
              Noch keine Fahrzeuge
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
              Legen Sie das erste Fahrzeug an. Sie können danach Bilder
              hochladen und es jederzeit wieder offline nehmen.
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

                      {!editable && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {vehicle.externalSource}
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
                    {vehicle.active && (
                      <Button asChild variant="ghost" size="xl">
                        <a
                          href={`/fahrzeuge/${vehicle.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink data-icon="inline-start" aria-hidden="true" />
                          Ansehen
                        </a>
                      </Button>
                    )}

                    {editable ? (
                      <Button asChild variant="outline" size="xl">
                        <Link href={`/admin/fahrzeuge/${vehicle.id}`}>
                          Bearbeiten
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="xl" disabled>
                        Extern gepflegt
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
