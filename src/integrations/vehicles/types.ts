import type {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
} from "@/generated/prisma/enums";

/**
 * VehicleProvider – die einzige Schnittstelle, über die Fahrzeugdaten in die
 * Anwendung gelangen (US-06, US-25).
 *
 * Die Anwendung kennt NUR dieses Interface. Sie weiß nicht, ob die Daten aus
 * einem Mock, aus autoPro24, aus Willhaben oder aus einer CSV kommen. Ein
 * neuer Anbieter wird angebunden, indem dieses Interface implementiert und in
 * `src/integrations/vehicles/index.ts` registriert wird – ohne Änderung an
 * Seiten, Komponenten oder Sync-Logik.
 *
 * Wichtig: Hier wird NICHT gescrapt. Ein Provider, für den keine offizielle
 * API-Dokumentation und keine Zugangsdaten vorliegen, meldet über
 * `isConfigured() === false`, dass er nicht einsatzbereit ist, statt erfundene
 * Endpunkte aufzurufen.
 */

/** Verfügbarkeitsstatus beim Anbieter – steuert `Vehicle.active` (US-07). */
export type ProviderVehicleStatus =
  | "available"
  | "reserved"
  | "sold"
  | "withdrawn";

export type ProviderVehicleImage = {
  url: string;
  alt?: string | null;
  position: number;
  width?: number | null;
  height?: number | null;
  externalId?: string | null;
};

/**
 * Normalisiertes Fahrzeug, wie es ein Provider liefert.
 * Enthält bewusst keine Datenbank-IDs – das Mapping auf `Vehicle` macht der
 * Sync-Service.
 */
export type ProviderVehicle = {
  /** Stabile ID beim Anbieter. Muss über Syncs hinweg gleich bleiben. */
  externalId: string;
  status: ProviderVehicleStatus;

  make: string;
  model: string;
  variant?: string | null;

  priceCents: number;
  vatDeductible?: boolean;

  mileageKm: number;
  firstRegistration?: Date | null;

  fuel: FuelType;
  transmission: TransmissionType;
  bodyType?: BodyType;
  condition?: VehicleCondition;

  powerKw?: number | null;
  displacementCcm?: number | null;
  color?: string | null;
  doors?: number | null;
  seats?: number | null;
  previousOwners?: number | null;
  inspectionValidUntil?: Date | null;

  description?: string;
  features?: string[];
  images?: ProviderVehicleImage[];
};

export type ListVehiclesOptions = {
  /** Seitengröße für Anbieter mit Pagination. */
  limit?: number;
  /** Opaker Cursor des Anbieters – wird unverändert zurückgereicht. */
  cursor?: string | null;
};

export type ProviderListResult = {
  vehicles: ProviderVehicle[];
  /** Nicht-null, wenn beim Anbieter weitere Seiten existieren. */
  nextCursor?: string | null;
  /**
   * true, wenn das Ergebnis den *vollständigen* Bestand abbildet.
   * Nur dann darf der Sync fehlende Fahrzeuge deaktivieren (US-07) –
   * bei einem Teilergebnis würde er sonst den halben Bestand abräumen.
   */
  isCompleteInventory: boolean;
};

export interface VehicleProvider {
  /** Wird als `Vehicle.externalSource` gespeichert, z. B. "mock". */
  readonly source: string;
  /** Anzeigename im Admin, z. B. "Testdaten (Mock)". */
  readonly label: string;

  /**
   * Liegen alle nötigen Zugangsdaten vor? Ein nicht konfigurierter Provider
   * wird im Admin sichtbar als "nicht eingerichtet" gemeldet, statt bei jedem
   * Sync zu scheitern.
   */
  isConfigured(): boolean;

  listVehicles(options?: ListVehiclesOptions): Promise<ProviderListResult>;

  getVehicleById(externalId: string): Promise<ProviderVehicle | null>;
}

/**
 * Fehler eines Providers, dessen Meldung dem Admin angezeigt werden darf.
 * Enthält niemals Tokens, URLs mit Keys oder Stacktraces.
 */
export class VehicleProviderError extends Error {
  readonly source: string;
  readonly retryable: boolean;

  constructor(
    source: string,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "VehicleProviderError";
    this.source = source;
    this.retryable = options.retryable ?? true;
  }
}
