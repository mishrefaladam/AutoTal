import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VehicleStatusCounts } from "@/modules/vehicles/admin-repository";
import { VEHICLE_STATUS_LABELS } from "@/modules/vehicles/labels";
import type { VehicleStatus } from "@/generated/prisma/enums";

/**
 * Orientierung über der Fahrzeugliste.
 *
 * Bewusste Aufgabenteilung, damit es nicht zwei Bedienelemente für denselben
 * Zustand gibt: Diese Karten INFORMIEREN nur (drei Zahlen zum eigenen
 * Bestand), gefiltert wird ausschließlich über die Tabs darunter.
 *
 * Einzige Ausnahme ist die vierte Karte: Ankaufanfragen sind Fahrzeuge, die
 * jemand AutoTal anbietet – ungeprüfte Kundenangaben, die nicht in denselben
 * Topf gehören wie der eigene Bestand. Sie liegen deshalb auf einer eigenen
 * Seite, stehen hier aber als Absprung, weil sie im Alltag zur selben Frage
 * gehören ("was liegt an?") und sonst leicht übersehen werden.
 */

/** Reihenfolge der Statuskarten – vom Verfügbaren zum Abgeschlossenen. */
const STATUS_ORDER: VehicleStatus[] = ["IN_STOCK", "RESERVED", "SOLD"];

export function VehicleOverview({
  counts,
  openInquiries,
}: {
  counts: VehicleStatusCounts;
  /** Offene Ankaufanfragen – abgeschlossene zählen hier nicht mit. */
  openInquiries: number;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STATUS_ORDER.map((status) => (
        <div
          key={status}
          className="border-border bg-background rounded-xl border p-4"
        >
          <p className="font-display tabular text-2xl font-bold">
            {counts[status]}
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {VEHICLE_STATUS_LABELS[status]}
          </p>
        </div>
      ))}

      {/* Führt bewusst von dieser Seite weg – andere Datenart, eigene Seite. */}
      <Link
        href="/admin/ankauf"
        className={cn(
          "group border-border bg-background block rounded-xl border p-4 transition-colors",
          "hover:border-brand/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        <p className="font-display tabular text-2xl font-bold">
          {openInquiries}
        </p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm">
          Ankaufanfragen
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          offen · von Kunden angeboten
        </p>
      </Link>
    </div>
  );
}

/**
 * Statusfilter der eigenen Fahrzeuge.
 *
 * Als Links umgesetzt, nicht als Client-State: Der Filter steht damit in der
 * URL, ist teilbar, überlebt einen Reload und braucht kein JavaScript.
 */
export function VehicleStatusTabs({
  counts,
  activeStatus,
}: {
  counts: VehicleStatusCounts;
  /** `null` = alle Fahrzeuge. */
  activeStatus: VehicleStatus | null;
}) {
  const tabs: { label: string; value: VehicleStatus | null; count: number }[] = [
    { label: "Alle", value: null, count: counts.total },
    ...STATUS_ORDER.map((status) => ({
      label: VEHICLE_STATUS_LABELS[status],
      value: status,
      count: counts[status],
    })),
  ];

  return (
    <div
      role="tablist"
      aria-label="Fahrzeuge nach Status filtern"
      className="border-border mb-5 flex flex-wrap gap-1 border-b pb-px"
    >
      {tabs.map((tab) => {
        const active = tab.value === activeStatus;

        return (
          <Link
            key={tab.label}
            role="tab"
            aria-selected={active}
            href={
              tab.value
                ? `/admin/fahrzeuge?status=${tab.value.toLowerCase()}`
                : "/admin/fahrzeuge"
            }
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active
                ? "border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
            <span className="tabular text-muted-foreground ml-1.5 text-xs">
              {tab.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
