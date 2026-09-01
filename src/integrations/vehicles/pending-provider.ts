import type {
  ListVehiclesOptions,
  ProviderListResult,
  ProviderVehicle,
  VehicleProvider,
} from "./types";
import { VehicleProviderError } from "./types";

/**
 * Basis für Provider, für die noch keine offizielle Schnittstellen-
 * dokumentation und keine Zugangsdaten vorliegen.
 *
 * Solche Provider erfinden keine Endpunkte und scrapen nichts. Sie melden
 * ehrlich, dass sie nicht einsatzbereit sind – im Admin sichtbar, statt mit
 * einer stillen Fehlfunktion. Sobald die Anbindung geklärt ist, wird
 * `listVehicles` / `getVehicleById` überschrieben und diese Basisklasse
 * verlassen.
 */
export abstract class PendingIntegrationProvider implements VehicleProvider {
  abstract readonly source: string;
  abstract readonly label: string;

  /** Welche Umgebungsvariablen fehlen bzw. gesetzt sein müssen. */
  protected abstract requiredEnvKeys(): string[];

  /** Was zur Anbindung noch fehlt – wird dem Admin angezeigt. */
  protected abstract missingPrerequisites(): string;

  isConfigured(): boolean {
    // Auch mit gesetzten Variablen bleibt der Provider inaktiv, solange die
    // Abbildung der Anbieterfelder nicht implementiert ist. Das verhindert,
    // dass jemand versehentlich auf einen leeren Bestand umschaltet.
    return false;
  }

  protected notImplemented(): never {
    throw new VehicleProviderError(
      this.source,
      `Die Anbindung an ${this.label} ist noch nicht aktiv. ` +
        `${this.missingPrerequisites()} ` +
        `Benötigte Umgebungsvariablen: ${this.requiredEnvKeys().join(", ")}. ` +
        `Solange läuft die Website mit VEHICLE_PROVIDER="mock".`,
      { retryable: false },
    );
  }

  async listVehicles(
    _options?: ListVehiclesOptions,
  ): Promise<ProviderListResult> {
    void _options;
    this.notImplemented();
  }

  async getVehicleById(_externalId: string): Promise<ProviderVehicle | null> {
    void _externalId;
    this.notImplemented();
  }
}
