"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CENTS_PER_EURO, formatNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { buildVehiclesHref, hasActiveFilters } from "@/modules/vehicles/filters";
import {
  BODY_TYPE_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
} from "@/modules/vehicles/labels";
import type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleFacets,
  VehicleFilters,
} from "@/modules/vehicles/types";

/**
 * Filterpanel für den Fahrzeugbestand (US-04).
 *
 * Der Zustand lebt in der URL, nicht in React: Ergebnisse bleiben teilbar und
 * der Zurück-Button funktioniert wie erwartet.
 *
 * Auswahllisten und Ankreuzfelder wirken sofort. Zahlenfelder werden
 * entprellt, damit nicht jede getippte Ziffer eine Navigation auslöst.
 *
 * Angeboten werden nur Marken, Modelle und Optionen, die im aktuellen Bestand
 * tatsächlich vorkommen – ein Filter, der garantiert null Treffer liefert,
 * ist keine Hilfe.
 */

const DEBOUNCE_MS = 450;
const ALL_VALUE = "__alle__";

export function VehicleFilterPanel({
  facets,
  filters,
  onApplied,
  className,
}: {
  facets: VehicleFacets;
  filters: VehicleFilters;
  /** Wird nach einer Filteränderung aufgerufen – schließt auf Mobil das Sheet. */
  onApplied?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Zahlenfelder werden lokal gehalten, damit das Tippen nicht bei jedem
  // Zeichen von einer Navigation unterbrochen wird.
  const [draft, setDraft] = useState(() => toDraft(filters));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kommt eine Änderung von außen (Zurück-Button, "Filter zurücksetzen"),
  // werden die lokalen Felder nachgezogen. Das passiert bewusst während des
  // Renderings statt in einem Effekt – so rendert React direkt mit dem
  // richtigen Wert weiter, statt kurz den veralteten anzuzeigen.
  const filterSignature = JSON.stringify(filters);
  const [lastSignature, setLastSignature] = useState(filterSignature);

  if (filterSignature !== lastSignature) {
    setLastSignature(filterSignature);
    setDraft(toDraft(filters));
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const navigate = useCallback(
    (next: VehicleFilters) => {
      startTransition(() => {
        // Jede Filteränderung springt zurück auf Seite 1 – sonst landet man
        // auf einer Seite, die es im neuen Ergebnis nicht mehr gibt.
        router.push(buildVehiclesHref({ ...next, page: 1 }), { scroll: false });
        onApplied?.();
      });
    },
    [router, onApplied],
  );

  /** Sofort wirksame Änderung (Auswahllisten, Ankreuzfelder). */
  const apply = useCallback(
    (patch: Partial<VehicleFilters>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      navigate({ ...filters, ...patch });
    },
    [filters, navigate],
  );

  /** Entprellte Änderung für Zahlenfelder. */
  const applyDebounced = useCallback(
    (patch: Partial<VehicleFilters>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => navigate({ ...filters, ...patch }), DEBOUNCE_MS);
    },
    [filters, navigate],
  );

  const models = useMemo(
    () => (filters.make ? (facets.modelsByMake[filters.make] ?? []) : []),
    [facets.modelsByMake, filters.make],
  );

  const active = hasActiveFilters(filters);

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  return (
    <div
      className={cn("space-y-7", isPending && "opacity-70 transition-opacity", className)}
      aria-busy={isPending}
    >
      {/* Marke und Modell */}
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">Marke und Modell</legend>

        <div className="space-y-1.5">
          <Label htmlFor="filter-make">Marke</Label>
          <Select
            value={filters.make ?? ALL_VALUE}
            onValueChange={(value) =>
              // Beim Markenwechsel muss das Modell weg – "Golf" passt nicht zu Audi.
              apply({
                make: value === ALL_VALUE ? null : value,
                model: null,
              })
            }
          >
            <SelectTrigger id="filter-make" className="w-full">
              <SelectValue placeholder="Alle Marken" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Alle Marken</SelectItem>
              {facets.makes.map((make) => (
                <SelectItem key={make.value} value={make.value}>
                  {make.value} ({make.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-model">Modell</Label>
          <Select
            value={filters.model ?? ALL_VALUE}
            disabled={!filters.make || models.length === 0}
            onValueChange={(value) =>
              apply({ model: value === ALL_VALUE ? null : value })
            }
          >
            <SelectTrigger id="filter-model" className="w-full">
              <SelectValue
                placeholder={filters.make ? "Alle Modelle" : "Zuerst Marke wählen"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Alle Modelle</SelectItem>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      {/* Preis */}
      <RangeField
        legend="Preis"
        unit="€"
        fromId="filter-price-min"
        toId="filter-price-max"
        fromValue={draft.minPrice}
        toValue={draft.maxPrice}
        fromPlaceholder={formatNumber(
          Math.floor(facets.priceRange.minCents / CENTS_PER_EURO),
        )}
        toPlaceholder={formatNumber(
          Math.ceil(facets.priceRange.maxCents / CENTS_PER_EURO),
        )}
        onFromChange={(value) => {
          setDraft((current) => ({ ...current, minPrice: value }));
          applyDebounced({
            minPriceCents: value === "" ? null : Number(value) * CENTS_PER_EURO,
          });
        }}
        onToChange={(value) => {
          setDraft((current) => ({ ...current, maxPrice: value }));
          applyDebounced({
            maxPriceCents: value === "" ? null : Number(value) * CENTS_PER_EURO,
          });
        }}
      />

      {/* Kilometerstand */}
      <RangeField
        legend="Kilometerstand"
        unit="km"
        fromId="filter-mileage-min"
        toId="filter-mileage-max"
        fromValue={draft.minMileage}
        toValue={draft.maxMileage}
        fromPlaceholder={formatNumber(facets.mileageRange.minKm)}
        toPlaceholder={formatNumber(facets.mileageRange.maxKm)}
        onFromChange={(value) => {
          setDraft((current) => ({ ...current, minMileage: value }));
          applyDebounced({ minMileageKm: value === "" ? null : Number(value) });
        }}
        onToChange={(value) => {
          setDraft((current) => ({ ...current, maxMileage: value }));
          applyDebounced({ maxMileageKm: value === "" ? null : Number(value) });
        }}
      />

      {/* Erstzulassung */}
      <RangeField
        legend="Erstzulassung"
        unit="Jahr"
        fromId="filter-year-min"
        toId="filter-year-max"
        fromValue={draft.minYear}
        toValue={draft.maxYear}
        fromPlaceholder={String(facets.yearRange.min)}
        toPlaceholder={String(facets.yearRange.max)}
        onFromChange={(value) => {
          setDraft((current) => ({ ...current, minYear: value }));
          applyDebounced({
            minFirstRegistrationYear: value === "" ? null : Number(value),
          });
        }}
        onToChange={(value) => {
          setDraft((current) => ({ ...current, maxYear: value }));
          applyDebounced({
            maxFirstRegistrationYear: value === "" ? null : Number(value),
          });
        }}
      />

      {/* Kraftstoff */}
      <CheckboxGroup
        legend="Kraftstoff"
        name="kraftstoff"
        options={facets.fuels.map((entry) => ({
          value: entry.value,
          label: FUEL_LABELS[entry.value],
          count: entry.count,
        }))}
        selected={filters.fuel}
        onToggle={(value) =>
          apply({ fuel: toggle(filters.fuel, value as FuelType) })
        }
      />

      {/* Getriebe */}
      <CheckboxGroup
        legend="Getriebe"
        name="getriebe"
        options={facets.transmissions.map((entry) => ({
          value: entry.value,
          label: TRANSMISSION_LABELS[entry.value],
          count: entry.count,
        }))}
        selected={filters.transmission}
        onToggle={(value) =>
          apply({
            transmission: toggle(filters.transmission, value as TransmissionType),
          })
        }
      />

      {/* Aufbau */}
      <CheckboxGroup
        legend="Aufbau"
        name="aufbau"
        options={facets.bodyTypes.map((entry) => ({
          value: entry.value,
          label: BODY_TYPE_LABELS[entry.value],
          count: entry.count,
        }))}
        selected={filters.bodyType}
        onToggle={(value) =>
          apply({ bodyType: toggle(filters.bodyType, value as BodyType) })
        }
      />

      {active && (
        <Button
          variant="outline"
          size="xl"
          className="w-full"
          onClick={() =>
            apply({
              make: null,
              model: null,
              minPriceCents: null,
              maxPriceCents: null,
              minMileageKm: null,
              maxMileageKm: null,
              minFirstRegistrationYear: null,
              maxFirstRegistrationYear: null,
              fuel: [],
              transmission: [],
              bodyType: [],
            })
          }
        >
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}

// --- Bausteine -------------------------------------------------------------

type DraftState = {
  minPrice: string;
  maxPrice: string;
  minMileage: string;
  maxMileage: string;
  minYear: string;
  maxYear: string;
};

function toDraft(filters: VehicleFilters): DraftState {
  return {
    minPrice:
      filters.minPriceCents === null
        ? ""
        : String(Math.round(filters.minPriceCents / CENTS_PER_EURO)),
    maxPrice:
      filters.maxPriceCents === null
        ? ""
        : String(Math.round(filters.maxPriceCents / CENTS_PER_EURO)),
    minMileage: filters.minMileageKm === null ? "" : String(filters.minMileageKm),
    maxMileage: filters.maxMileageKm === null ? "" : String(filters.maxMileageKm),
    minYear:
      filters.minFirstRegistrationYear === null
        ? ""
        : String(filters.minFirstRegistrationYear),
    maxYear:
      filters.maxFirstRegistrationYear === null
        ? ""
        : String(filters.maxFirstRegistrationYear),
  };
}

/** Nur Ziffern zulassen – verhindert "1e9" und Vorzeichen im Zahlenfeld. */
function sanitizeNumeric(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 9);
}

function RangeField({
  legend,
  unit,
  fromId,
  toId,
  fromValue,
  toValue,
  fromPlaceholder,
  toPlaceholder,
  onFromChange,
  onToChange,
}: {
  legend: string;
  unit: string;
  fromId: string;
  toId: string;
  fromValue: string;
  toValue: string;
  fromPlaceholder: string;
  toPlaceholder: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">
        {legend} <span className="text-muted-foreground font-normal">({unit})</span>
      </legend>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={fromId} className="text-muted-foreground text-xs">
            von
          </Label>
          <Input
            id={fromId}
            inputMode="numeric"
            autoComplete="off"
            value={fromValue}
            placeholder={fromPlaceholder}
            onChange={(event) => onFromChange(sanitizeNumeric(event.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={toId} className="text-muted-foreground text-xs">
            bis
          </Label>
          <Input
            id={toId}
            inputMode="numeric"
            autoComplete="off"
            value={toValue}
            placeholder={toPlaceholder}
            onChange={(event) => onToChange(sanitizeNumeric(event.target.value))}
          />
        </div>
      </div>
    </fieldset>
  );
}

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{legend}</legend>

      <div className="space-y-2.5">
        {options.map((option) => {
          const id = `filter-${name}-${option.value}`;

          return (
            <div key={option.value} className="flex items-center gap-2.5">
              <Checkbox
                id={id}
                checked={selected.includes(option.value)}
                onCheckedChange={() => onToggle(option.value)}
              />
              <Label
                htmlFor={id}
                className="flex flex-1 cursor-pointer items-center justify-between gap-2 font-normal"
              >
                <span>{option.label}</span>
                <span className="text-muted-foreground tabular text-xs">
                  {option.count}
                </span>
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
