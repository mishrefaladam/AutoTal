import type { VehicleWidgetStatus } from "./config";

/**
 * willhaben „Widget Lite“.
 *
 * Widget Lite ist im Vertrag des Kunden enthalten. willhaben stellt dafür
 * einen fertigen Einbettungscode bereit; Design und Funktionsumfang sind
 * nicht anpassbar. Änderungen, die der Händler auf willhaben vornimmt,
 * erscheinen laut Anbieter unmittelbar im Widget.
 *
 * Es gibt für diesen Händler KEINEN individuellen API-Zugang. Die im Vertrag
 * erwähnte Export-Schnittstelle dient dem Export aus willhabenPro zu anderen
 * Plattformen und ist keine Datenquelle für diese Website.
 *
 * ---------------------------------------------------------------------------
 * TODO: Insert official willhaben Widget Lite embed code here.
 * ---------------------------------------------------------------------------
 *
 * Der offizielle Einbettungscode liegt noch nicht vor. Es wird bewusst NICHTS
 * geraten – weder eine URL, noch eine Widget-ID, noch ein Script-Tag. Sobald
 * willhaben den Code liefert:
 *
 *   1. Den Code hier einsetzen. Je nach Vorgabe von willhaben kann das ein
 *      <iframe>, ein <script>, ein HTML-Container oder eine Kombination sein.
 *      Für ein <script> die Komponente `next/script` mit `strategy="afterInteractive"`
 *      verwenden – kein dangerouslySetInnerHTML.
 *   2. `EMBED_AVAILABLE` auf true setzen.
 *   3. Die vom Widget benötigten Domains in der CSP freigeben
 *      (siehe README, Abschnitt „Fahrzeugbörse / willhaben Integration“).
 *   4. Responsives Verhalten auf Mobil prüfen – der Container gibt die volle
 *      Breite vor, das Widget selbst wird nicht per CSS manipuliert.
 *
 * Kundenspezifische Kennungen (Händler-ID o. ä.) gehören NICHT hartkodiert,
 * sondern in eine Umgebungsvariable. Welche Kennung Widget Lite überhaupt
 * benötigt, ist noch nicht bekannt – deshalb wird hier noch keine angelegt.
 */

/**
 * Auf `true` setzen, sobald der offizielle Einbettungscode unten eingesetzt
 * wurde. Solange `false`, zeigt die Seite bewusst keinen leeren Bereich,
 * sondern einen erklärenden Hinweis.
 */
const EMBED_AVAILABLE = false;

export function getWillhabenLiteStatus(): VehicleWidgetStatus {
  return EMBED_AVAILABLE ? "ready" : "missing-embed";
}

/**
 * Rendert den Einbettungscode.
 *
 * Wird nur aufgerufen, wenn `getWillhabenLiteStatus()` "ready" meldet – ohne
 * hinterlegten Code gibt es hier nichts auszuliefern.
 */
export function WillhabenLiteEmbed() {
  if (!EMBED_AVAILABLE) return null;

  // TODO: Insert official willhaben Widget Lite embed code here.
  return null;
}
