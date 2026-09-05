import type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
} from "@/generated/prisma/enums";

/**
 * Domänentypen für erfasste Fahrzeuge.
 *
 * Diese Typen beschreiben die Fahrzeuge, die im Admin gepflegt werden und der
 * Social-Media-Funktion als Datenbasis dienen – nicht den öffentlichen
 * Bestand, der aus der willhaben-Fahrzeugbörse kommt.
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
  VehicleStatus,
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
