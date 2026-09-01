import type {
  ListVehiclesOptions,
  ProviderListResult,
  ProviderVehicle,
  VehicleProvider,
} from "../types";
import { MOCK_VEHICLES } from "./data";

/**
 * Provider mit statischen Testdaten (US-26).
 *
 * Damit läuft die komplette Anwendung ohne jeden externen Zugang – lokal,
 * in der CI und in Vorschau-Deployments. Standardprovider, solange
 * VEHICLE_PROVIDER nicht anders gesetzt ist.
 */
export class MockVehicleProvider implements VehicleProvider {
  readonly source = "mock";
  readonly label = "Testdaten (Mock)";

  /** Braucht keine Konfiguration – deshalb immer einsatzbereit. */
  isConfigured(): boolean {
    return true;
  }

  async listVehicles(
    options: ListVehiclesOptions = {},
  ): Promise<ProviderListResult> {
    const { limit, cursor } = options;

    // Ohne Limit wird der komplette Bestand in einem Rutsch geliefert.
    if (!limit) {
      return {
        vehicles: [...MOCK_VEHICLES],
        nextCursor: null,
        isCompleteInventory: true,
      };
    }

    // Mit Limit wird die Pagination echter Anbieter nachgebildet, damit der
    // Sync-Service gegen beide Fälle getestet ist.
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
    const page = MOCK_VEHICLES.slice(start, start + limit);
    const nextOffset = start + page.length;
    const hasMore = nextOffset < MOCK_VEHICLES.length;

    return {
      vehicles: page,
      nextCursor: hasMore ? String(nextOffset) : null,
      // Erst die letzte Seite schließt den Bestand ab.
      isCompleteInventory: !hasMore,
    };
  }

  async getVehicleById(externalId: string): Promise<ProviderVehicle | null> {
    return (
      MOCK_VEHICLES.find((vehicle) => vehicle.externalId === externalId) ?? null
    );
  }
}

export { MOCK_VEHICLES };
