import { PendingIntegrationProvider } from "./pending-provider";

/**
 * autoPro24 – Fahrzeugverwaltung vieler österreichischer Händler.
 *
 * STATUS: Adapter vorbereitet, Anbindung noch offen.
 *
 * TODO(anbindung): Für die Umsetzung wird benötigt:
 *   1. Offizielle API-Dokumentation von autoPro24 (Endpunkte, Auth-Verfahren,
 *      Feldnamen, Pagination, Rate Limits).
 *   2. Zugangsdaten für den Händleraccount (API-Key bzw. OAuth-Client).
 *   3. Klärung, ob Bilder als absolute URLs geliefert werden oder über einen
 *      separaten Endpunkt geladen werden müssen.
 *
 * Sobald das vorliegt, ist nur diese Datei zu implementieren:
 *   - `isConfigured()` prüft die Umgebungsvariablen,
 *   - `listVehicles()` paginiert über den Bestand,
 *   - `getVehicleById()` lädt ein einzelnes Fahrzeug,
 *   - `mapToProviderVehicle()` bildet die Anbieterfelder auf
 *     `ProviderVehicle` ab.
 * Der Rest der Anwendung bleibt unverändert.
 *
 * Kein Scraping: Ohne offizielle Schnittstelle bleibt dieser Provider inaktiv.
 */
export class AutoPro24VehicleProvider extends PendingIntegrationProvider {
  readonly source = "autopro24";
  readonly label = "autoPro24";

  protected requiredEnvKeys(): string[] {
    return [
      "AUTOPRO24_API_BASE_URL",
      "AUTOPRO24_API_KEY",
      "AUTOPRO24_DEALER_ID",
    ];
  }

  protected missingPrerequisites(): string {
    return (
      "Es liegen noch keine offizielle API-Dokumentation und keine " +
      "Händler-Zugangsdaten vor."
    );
  }

  // TODO(anbindung): Abbildung der autoPro24-Felder auf ProviderVehicle.
  // Erwartetes Zielformat siehe src/integrations/vehicles/types.ts.
  // Beim Implementieren beachten:
  //   - Preise in Cent umrechnen (priceCents), nicht in Euro belassen.
  //   - Erstzulassung als Date, nicht als String.
  //   - Kraftstoff/Getriebe auf die Enums FuelType/TransmissionType mappen,
  //     unbekannte Werte auf "OTHER" statt auf einen Rateversuch.
  //   - `status` bestimmt, ob das Fahrzeug öffentlich sichtbar bleibt (US-07).
}
