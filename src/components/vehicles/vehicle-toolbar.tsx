"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";

import { VehicleFilterPanel } from "@/components/vehicles/vehicle-filter-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { buildVehiclesHref, countActiveFilters } from "@/modules/vehicles/filters";
import { SORT_LABELS } from "@/modules/vehicles/labels";
import type {
  VehicleFacets,
  VehicleFilters,
  VehicleSortOption,
} from "@/modules/vehicles/types";

/**
 * Leiste über der Trefferliste: Trefferzahl, Sortierung und – auf kleinen
 * Bildschirmen – der Zugang zu den Filtern.
 *
 * Auf dem Smartphone stehen die Filter in einem Sheet statt in einer
 * Seitenspalte; ein Badge zeigt an, wie viele gesetzt sind, damit man sie
 * nicht versehentlich übersieht (US-28).
 */
export function VehicleToolbar({
  facets,
  filters,
  totalCount,
}: {
  facets: VehicleFacets;
  filters: VehicleFilters;
  totalCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount = countActiveFilters(filters);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        <span className="text-foreground tabular font-semibold">{totalCount}</span>{" "}
        {totalCount === 1 ? "Fahrzeug" : "Fahrzeuge"} gefunden
      </p>

      <div className="flex items-center gap-2">
        {/* Filter – nur auf schmalen Bildschirmen, sonst steht die Spalte links */}
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="xl" className="lg:hidden">
              <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
              Filter
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1 tabular">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>

          <SheetContent side="left" className="w-full max-w-sm overflow-y-auto">
            <SheetHeader className="border-border border-b">
              <SheetTitle>Fahrzeuge filtern</SheetTitle>
            </SheetHeader>

            <div className="p-5">
              <VehicleFilterPanel
                facets={facets}
                filters={filters}
                onApplied={() => setFiltersOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        <Select
          value={filters.sort}
          onValueChange={(value) =>
            startTransition(() => {
              router.push(
                buildVehiclesHref({
                  ...filters,
                  sort: value as VehicleSortOption,
                  page: 1,
                }),
                { scroll: false },
              );
            })
          }
        >
          <SelectTrigger
            className="w-[15rem]"
            aria-label="Fahrzeuge sortieren"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
