import { PendingIntegrationProvider } from "./pending-provider";

/**
 * Willhaben – größter Fahrzeugmarktplatz Österreichs.
 *
 * STATUS: Adapter vorbereitet, Anbindung noch offen.
 *
 * WICHTIG: Hier wird nicht gescrapt. Willhaben untersagt das automatisierte
 * Auslesen der Website in den Nutzungsbedingungen; abgesehen davon würde jede
 * Layout-Änderung den Bestand der Website zerstören. Die Anbindung erfolgt
 * ausschließlich über eine offizielle Händlerschnittstelle.
 *
 * TODO(anbindung): Benötigt werden:
 *   1. Ein Händlervertrag mit Willhaben inklusive Schnittstellenzugang
 *      (üblicherweise läuft die Bestandspflege über einen angebundenen
 *      Fahrzeugverwalter wie autoPro24 – siehe autopro24.ts).
 *   2. Die offizielle Dokumentation der Schnittstelle.
 *   3. Zugangsdaten für den Händleraccount.
 *
 * Bis dahin bleibt dieser Provider inaktiv und die Website läuft mit dem
 * konfigurierten Alternativprovider.
 */
export class WillhabenVehicleProvider extends PendingIntegrationProvider {
  readonly source = "willhaben";
  readonly label = "Willhaben";

  protected requiredEnvKeys(): string[] {
    return [
      "WILLHABEN_API_BASE_URL",
      "WILLHABEN_API_KEY",
      "WILLHABEN_DEALER_ID",
    ];
  }

  protected missingPrerequisites(): string {
    return (
      "Es liegt kein offizieller Schnittstellenzugang vor. Scraping ist " +
      "ausdrücklich keine Option."
    );
  }
}
