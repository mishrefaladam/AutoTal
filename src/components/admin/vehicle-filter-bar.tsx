"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VehicleStatus } from "@/generated/prisma/enums";
import {
  hasActiveVehicleFilters,
  vehicleFiltersHref,
  type VehicleFilters,
} from "@/modules/vehicles/filters";
import { VEHICLE_STATUS_LABELS } from "@/modules/vehicles/labels";

/**
 * Filterleiste für Fahrzeuglisten: Suche, Marke, Modell, optional Status.
 *
 * Die Leiste hält keinen eigenen Zustand über das Tippen hinaus. Jede Änderung
 * wird zur Adresse: `?make=BMW&model=X5&q=30d`. Die Seite lädt dann
 * serverseitig neu – so bleibt ein Reload beim Filter, Zurück/Vor
 * funktioniert, und ein Link ist teilbar. Die eigentliche Filterung passiert
 * in der Datenbank (siehe modules/vehicles/filters.ts), nicht hier.
 *
 * Suche und Auswahl gehen unterschiedlich in den Verlauf: Eine Auswahl ist ein
 * Schritt und wird gepusht; das Tippen ersetzt den Eintrag, sonst bräuchte
 * "Zurück" für "X5 30d" sechs Klicks.
 */
export function VehicleFilterBar({
  basePath,
  filters,
  makes,
  models,
  defaultStatus = null,
  showStatus = false,
}: {
  /** Seite, auf der die Filter gelten – z. B. "/admin/fahrzeuge". */
  basePath: string;
  filters: VehicleFilters;
  makes: string[];
  models: string[];
  /** Vorgabestatus der Seite; nur relevant für die Adresse. */
  defaultStatus?: VehicleStatus | null;
  /** Status als Auswahlfeld anzeigen (statt über Tabs der Seite). */
  showStatus?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q);
  const firstRender = useRef(true);

  // Von außen geänderte Filter (Tabs, Zurück-Taste) ins Eingabefeld
  // übernehmen – während des Renderns, nicht in einem Effekt: So gibt es
  // keinen Zwischenzustand mit dem alten Text.
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  if (syncedQuery !== filters.q) {
    setSyncedQuery(filters.q);
    setQuery(filters.q);
  }

  function navigate(next: VehicleFilters, mode: "push" | "replace") {
    const href = vehicleFiltersHref(basePath, next, { defaultStatus });
    if (mode === "push") router.push(href);
    else router.replace(href);
  }

  // Tippen erst nach einer kurzen Pause zur Adresse machen.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed === filters.q) return;

    const timer = setTimeout(() => {
      navigate({ ...filters, q: trimmed }, "replace");
    }, 350);
    return () => clearTimeout(timer);
    // `navigate` hängt nur von Props ab, die hier alle mitlaufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Mit eigenem Statusfeld zählt auch ein vom Vorgabewert abweichender Status
  // als gesetzter Filter.
  const active =
    hasActiveVehicleFilters(filters) ||
    (showStatus && filters.status !== defaultStatus);
  const ALL = "__all__";

  return (
    <form
      role="search"
      aria-label="Fahrzeuge filtern"
      className="border-border bg-muted/40 mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ ...filters, q: query.trim() }, "push");
      }}
    >
      <div className="min-w-[14rem] flex-1 space-y-1.5">
        <Label htmlFor="vehicle-filter-q" className="text-xs">
          Suche
        </Label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="vehicle-filter-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Marke, Modell, Variante, GW-Nr, FIN …"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {showStatus && (
        <div className="w-40 space-y-1.5">
          <Label htmlFor="vehicle-filter-status" className="text-xs">
            Status
          </Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) =>
              navigate(
                {
                  ...filters,
                  status: value === ALL ? null : (value as VehicleStatus),
                },
                "push",
              )
            }
          >
            <SelectTrigger id="vehicle-filter-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle</SelectItem>
              {(["IN_STOCK", "RESERVED", "SOLD"] as const).map((status) => (
                <SelectItem key={status} value={status}>
                  {VEHICLE_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="w-44 space-y-1.5">
        <Label htmlFor="vehicle-filter-make" className="text-xs">
          Marke
        </Label>
        <Select
          value={filters.make ?? ALL}
          onValueChange={(value) =>
            // Marke wechseln setzt das Modell zurück: "A-Klasse" gibt es bei
            // BMW nicht, und eine leere Liste ohne Erklärung hilft niemandem.
            navigate(
              { ...filters, make: value === ALL ? null : value, model: null },
              "push",
            )
          }
        >
          <SelectTrigger id="vehicle-filter-make" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Marken</SelectItem>
            {makes.map((make) => (
              <SelectItem key={make} value={make}>
                {make}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-44 space-y-1.5">
        <Label htmlFor="vehicle-filter-model" className="text-xs">
          Modell
        </Label>
        <Select
          value={filters.model ?? ALL}
          onValueChange={(value) =>
            navigate({ ...filters, model: value === ALL ? null : value }, "push")
          }
        >
          <SelectTrigger id="vehicle-filter-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Modelle</SelectItem>
            {models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Setzt Suche, Marke und Modell zurück. Der Status geht nur mit, wenn
          die Leiste ihn selbst anbietet – sonst gehört er zu den Tabs der
          Seite und bleibt, wie er ist. */}
      <Button
        type="button"
        variant="ghost"
        size="xl"
        disabled={!active}
        onClick={() =>
          navigate(
            {
              q: "",
              make: null,
              model: null,
              status: showStatus ? defaultStatus : filters.status,
            },
            "push",
          )
        }
      >
        <X data-icon="inline-start" aria-hidden="true" />
        Zurücksetzen
      </Button>
    </form>
  );
}
