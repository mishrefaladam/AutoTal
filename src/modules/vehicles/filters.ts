import {
  BodyType,
  FuelType,
  TransmissionType,
} from "@/generated/prisma/enums";
import { CENTS_PER_EURO } from "@/lib/money";

import type { VehicleFilters, VehicleSortOption } from "./types";

/**
 * Übersetzung zwischen URL und Filterobjekt.
 *
 * Die Filter stehen bewusst in der URL und nicht im Client-State: Ergebnisse
 * bleiben teilbar, der Zurück-Button funktioniert, und die Liste kann
 * serverseitig gerendert werden (US-30).
 *
 * Preise stehen in der URL in Euro, weil `?preis_max=25000` lesbar ist –
 * intern wird durchgehend in Cent gerechnet.
 *
 * Dieses Modul ist frei von Server-Abhängigkeiten und wird auch von der
 * Filter-Komponente im Browser benutzt.
 */

export const FILTER_PARAMS = {
  make: "marke",
  model: "modell",
  minPrice: "preis_min",
  maxPrice: "preis_max",
  minMileage: "km_min",
  maxMileage: "km_max",
  minYear: "ez_min",
  maxYear: "ez_max",
  fuel: "kraftstoff",
  transmission: "getriebe",
  bodyType: "aufbau",
  sort: "sortierung",
  page: "seite",
} as const;

export const DEFAULT_SORT: VehicleSortOption = "newest";

const SORT_OPTIONS: VehicleSortOption[] = [
  "newest",
  "price-asc",
  "price-desc",
  "mileage-asc",
  "registration-desc",
];

export const EMPTY_FILTERS: VehicleFilters = {
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
  sort: DEFAULT_SORT,
  page: 1,
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function parseInteger(
  value: string | string[] | undefined,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | null {
  const raw = firstValue(value);
  if (raw === null) return null;

  const parsed = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(parsed)) return null;

  return Math.min(Math.max(parsed, min), max);
}

/**
 * Mehrfachwerte werden als kommagetrennte Liste übertragen
 * (`?kraftstoff=DIESEL,ELECTRIC`), zusätzlich werden wiederholte Parameter
 * akzeptiert. Unbekannte Werte werden still verworfen, statt einen Fehler
 * auszulösen – eine manipulierte URL soll die Seite nicht zerstören.
 */
function parseEnumList<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  if (value === undefined) return [];

  const raw = Array.isArray(value) ? value : [value];
  const candidates = raw.flatMap((entry) =>
    entry.split(",").map((part) => part.trim().toUpperCase()),
  );

  const allowedSet = new Set<string>(allowed);
  const unique = new Set<T>();

  for (const candidate of candidates) {
    if (allowedSet.has(candidate)) unique.add(candidate as T);
  }

  return [...unique];
}

export function parseVehicleFilters(
  searchParams: RawSearchParams,
): VehicleFilters {
  const currentYear = new Date().getFullYear();

  const minPriceEuro = parseInteger(searchParams[FILTER_PARAMS.minPrice]);
  const maxPriceEuro = parseInteger(searchParams[FILTER_PARAMS.maxPrice]);
  const minYear = parseInteger(searchParams[FILTER_PARAMS.minYear], {
    min: 1900,
    max: currentYear + 1,
  });
  const maxYear = parseInteger(searchParams[FILTER_PARAMS.maxYear], {
    min: 1900,
    max: currentYear + 1,
  });
  const minMileage = parseInteger(searchParams[FILTER_PARAMS.minMileage]);
  const maxMileage = parseInteger(searchParams[FILTER_PARAMS.maxMileage]);

  const sortCandidate = firstValue(searchParams[FILTER_PARAMS.sort]);
  const sort = SORT_OPTIONS.includes(sortCandidate as VehicleSortOption)
    ? (sortCandidate as VehicleSortOption)
    : DEFAULT_SORT;

  // Vertauschte Grenzen (min > max) werden getauscht statt verworfen –
  // sonst liefert ein Tippfehler im Schieberegler null Treffer.
  const [priceLow, priceHigh] = orderPair(minPriceEuro, maxPriceEuro);
  const [mileageLow, mileageHigh] = orderPair(minMileage, maxMileage);
  const [yearLow, yearHigh] = orderPair(minYear, maxYear);

  return {
    make: firstValue(searchParams[FILTER_PARAMS.make]),
    model: firstValue(searchParams[FILTER_PARAMS.model]),
    minPriceCents: priceLow === null ? null : priceLow * CENTS_PER_EURO,
    maxPriceCents: priceHigh === null ? null : priceHigh * CENTS_PER_EURO,
    minMileageKm: mileageLow,
    maxMileageKm: mileageHigh,
    minFirstRegistrationYear: yearLow,
    maxFirstRegistrationYear: yearHigh,
    fuel: parseEnumList(
      searchParams[FILTER_PARAMS.fuel],
      Object.values(FuelType),
    ),
    transmission: parseEnumList(
      searchParams[FILTER_PARAMS.transmission],
      Object.values(TransmissionType),
    ),
    bodyType: parseEnumList(
      searchParams[FILTER_PARAMS.bodyType],
      Object.values(BodyType),
    ),
    sort,
    page: parseInteger(searchParams[FILTER_PARAMS.page], { min: 1 }) ?? 1,
  };
}

function orderPair(
  low: number | null,
  high: number | null,
): [number | null, number | null] {
  if (low !== null && high !== null && low > high) return [high, low];
  return [low, high];
}

/** Baut aus dem Filterobjekt wieder einen Query-String. */
export function filtersToSearchParams(
  filters: VehicleFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  };

  set(FILTER_PARAMS.make, filters.make);
  set(FILTER_PARAMS.model, filters.model);
  set(
    FILTER_PARAMS.minPrice,
    filters.minPriceCents === null
      ? null
      : Math.round(filters.minPriceCents / CENTS_PER_EURO),
  );
  set(
    FILTER_PARAMS.maxPrice,
    filters.maxPriceCents === null
      ? null
      : Math.round(filters.maxPriceCents / CENTS_PER_EURO),
  );
  set(FILTER_PARAMS.minMileage, filters.minMileageKm);
  set(FILTER_PARAMS.maxMileage, filters.maxMileageKm);
  set(FILTER_PARAMS.minYear, filters.minFirstRegistrationYear);
  set(FILTER_PARAMS.maxYear, filters.maxFirstRegistrationYear);

  if (filters.fuel.length) {
    params.set(FILTER_PARAMS.fuel, filters.fuel.join(","));
  }
  if (filters.transmission.length) {
    params.set(FILTER_PARAMS.transmission, filters.transmission.join(","));
  }
  if (filters.bodyType.length) {
    params.set(FILTER_PARAMS.bodyType, filters.bodyType.join(","));
  }

  if (filters.sort !== DEFAULT_SORT) params.set(FILTER_PARAMS.sort, filters.sort);
  if (filters.page > 1) params.set(FILTER_PARAMS.page, String(filters.page));

  return params;
}

export function buildVehiclesHref(filters: VehicleFilters): string {
  const query = filtersToSearchParams(filters).toString();
  return query ? `/fahrzeuge?${query}` : "/fahrzeuge";
}

/** Anzahl gesetzter Filter – für das Badge am "Filter"-Button auf Mobil. */
export function countActiveFilters(filters: VehicleFilters): number {
  let count = 0;

  if (filters.make) count += 1;
  if (filters.model) count += 1;
  if (filters.minPriceCents !== null || filters.maxPriceCents !== null) count += 1;
  if (filters.minMileageKm !== null || filters.maxMileageKm !== null) count += 1;
  if (
    filters.minFirstRegistrationYear !== null ||
    filters.maxFirstRegistrationYear !== null
  ) {
    count += 1;
  }
  if (filters.fuel.length) count += 1;
  if (filters.transmission.length) count += 1;
  if (filters.bodyType.length) count += 1;

  return count;
}

export function hasActiveFilters(filters: VehicleFilters): boolean {
  return countActiveFilters(filters) > 0;
}
