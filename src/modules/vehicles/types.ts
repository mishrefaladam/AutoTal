import type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
} from "@/generated/prisma/enums";

/**
 * Domänentypen für Fahrzeuge.
 *
 * Die Enum-Werte werden als *Typ* aus dem generierten Prisma-Client bezogen
 * (`import type` – kein Runtime-Import). Damit gibt es genau ein Vokabular für
 * Datenbank, Provider und UI, ohne dass UI-Code an Prisma gekoppelt wäre.
 */

export type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
} from "@/generated/prisma/enums";

export type VehicleImageDto = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/** Für Fahrzeugkarten in der Übersicht (US-03). */
export type VehicleListItem = {
  id: string;
  slug: string;
  make: string;
  model: string;
  variant: string | null;
  /** Vollständige Bezeichnung: "BMW 320d xDrive Touring" */
  title: string;
  priceCents: number;
  vatDeductible: boolean;
  mileageKm: number;
  firstRegistration: Date | null;
  fuel: FuelType;
  transmission: TransmissionType;
  bodyType: BodyType;
  condition: VehicleCondition;
  powerKw: number | null;
  primaryImage: VehicleImageDto | null;
  imageCount: number;
};

/** Für die Fahrzeugdetailseite (US-05). */
export type VehicleDetail = VehicleListItem & {
  images: VehicleImageDto[];
  description: string;
  features: string[];
  color: string | null;
  doors: number | null;
  seats: number | null;
  previousOwners: number | null;
  displacementCcm: number | null;
  inspectionValidUntil: Date | null;
  externalSource: string;
  externalId: string;
  lastSyncedAt: Date;
};

// --- Filter (US-04) --------------------------------------------------------

export type VehicleSortOption =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "mileage-asc"
  | "registration-desc";

export type VehicleFilters = {
  make: string | null;
  model: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  minMileageKm: number | null;
  maxMileageKm: number | null;
  minFirstRegistrationYear: number | null;
  maxFirstRegistrationYear: number | null;
  fuel: FuelType[];
  transmission: TransmissionType[];
  bodyType: BodyType[];
  sort: VehicleSortOption;
  page: number;
};

/**
 * Wertebereiche des tatsächlichen Bestands – speist die Filter-UI, damit
 * Schieberegler und Auswahllisten nie leere Ergebnisse anbieten.
 */
export type VehicleFacets = {
  makes: { value: string; count: number }[];
  modelsByMake: Record<string, string[]>;
  fuels: { value: FuelType; count: number }[];
  transmissions: { value: TransmissionType; count: number }[];
  bodyTypes: { value: BodyType; count: number }[];
  priceRange: { minCents: number; maxCents: number };
  mileageRange: { minKm: number; maxKm: number };
  yearRange: { min: number; max: number };
  totalCount: number;
};

export type VehicleSearchResult = {
  items: VehicleListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
