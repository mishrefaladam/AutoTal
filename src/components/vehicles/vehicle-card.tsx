import Image from "next/image";
import Link from "next/link";
import { Calendar, Fuel, Gauge, ImageOff, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatEuro, formatKilometers, formatPower } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  CONDITION_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS_SHORT,
  formatRegistration,
} from "@/modules/vehicles/labels";
import type { VehicleListItem } from "@/modules/vehicles/types";

/**
 * Fahrzeugkarte für Übersicht und Startseite (US-03).
 *
 * Zeigt die acht Pflichtangaben: Bild, Marke, Modell, Preis, Kilometerstand,
 * Erstzulassung, Kraftstoff und Getriebe.
 *
 * Die ganze Karte ist ein Link – über ein aufgespanntes Overlay statt eines
 * Links um den gesamten Inhalt. So bleibt die Trefferfläche groß, ohne dass
 * Screenreader den kompletten Kartentext als Linktext vorlesen.
 */
export function VehicleCard({
  vehicle,
  priority = false,
  monthlyRateCents,
  className,
}: {
  vehicle: VehicleListItem;
  /** true für die ersten sichtbaren Karten – lädt das Bild sofort (LCP). */
  priority?: boolean;
  /** Optionale Rate "ab … €/Monat" aus dem Finanzierungsrechner. */
  monthlyRateCents?: number;
  className?: string;
}) {
  const href = `/fahrzeuge/${vehicle.slug}`;

  const specs = [
    {
      icon: Gauge,
      label: "Kilometerstand",
      value: formatKilometers(vehicle.mileageKm),
    },
    {
      icon: Calendar,
      label: "Erstzulassung",
      value: formatRegistration(vehicle.firstRegistration),
    },
    { icon: Fuel, label: "Kraftstoff", value: FUEL_LABELS[vehicle.fuel] },
    {
      icon: Settings2,
      label: "Getriebe",
      value: TRANSMISSION_LABELS_SHORT[vehicle.transmission],
    },
  ];

  return (
    <article
      className={cn(
        "group border-border bg-card relative flex flex-col overflow-hidden rounded-xl border shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)] focus-within:shadow-[var(--shadow-card-hover)]",
        className,
      )}
    >
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        {vehicle.primaryImage ? (
          <Image
            src={vehicle.primaryImage.url}
            alt={vehicle.primaryImage.alt}
            fill
            // Drei Spalten ab Desktop, zwei ab Tablet, sonst volle Breite.
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <ImageOff className="size-7" aria-hidden="true" />
            <span className="text-xs">Kein Bild vorhanden</span>
          </div>
        )}

        {vehicle.condition !== "USED" && (
          <Badge
            variant="secondary"
            className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm"
          >
            {CONDITION_LABELS[vehicle.condition]}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[1.0625rem] leading-snug font-semibold">
          <Link
            href={href}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            <span className="text-muted-foreground block text-sm font-medium">
              {vehicle.make}
            </span>
            {vehicle.model}
            {vehicle.variant && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {vehicle.variant}
              </span>
            )}
          </Link>
        </h3>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {specs.map((spec) => (
            <div key={spec.label} className="flex items-center gap-2">
              <spec.icon
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              <dt className="sr-only">{spec.label}</dt>
              <dd className="tabular truncate">{spec.value}</dd>
            </div>
          ))}
        </dl>

        <div className="border-border mt-5 flex items-end justify-between gap-3 border-t pt-4">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">
              {formatEuro(vehicle.priceCents)}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {vehicle.vatDeductible ? "netto, zzgl. 20 % USt." : "inkl. USt."}
            </p>
          </div>

          {monthlyRateCents !== undefined && monthlyRateCents > 0 && (
            <p className="text-muted-foreground text-right text-xs">
              ab{" "}
              <span className="text-brand tabular text-sm font-semibold">
                {formatEuro(monthlyRateCents)}
              </span>
              <br />
              pro Monat
            </p>
          )}
        </div>

        {vehicle.powerKw !== null && (
          <p className="text-muted-foreground mt-2 text-xs">
            {formatPower(vehicle.powerKw)}
          </p>
        )}
      </div>
    </article>
  );
}
