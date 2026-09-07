import Script from "next/script";

import { LOADER_SRC } from "./willhaben-lite-config";

/**
 * willhaben „Carport Widget Lite“.
 *
 * Widget Lite ist im Vertrag des Kunden enthalten. willhaben stellt den
 * Einbettungscode bereit; Design und Funktionsumfang sind nicht anpassbar.
 * Änderungen, die der Händler auf willhaben vornimmt, erscheinen laut
 * Anbieter unmittelbar im Widget.
 *
 * Es gibt für diesen Händler KEINEN individuellen API-Zugang. Es wird nichts
 * synchronisiert, zwischengespeichert oder ausgelesen – das Widget lädt seine
 * Daten selbst direkt bei willhaben.
 *
 * EINBETTUNG (offizielle Anleitung, willhaben, Stand 06.09.2026):
 * https://fahrzeughandel.willhaben.at/widget-lite-doku/
 *
 *   <widget-lite></widget-lite>
 *   <script src="https://widget-lite.willhaben.at/production/<ID>/loader.js"></script>
 *
 * Zwei Vorgaben aus der Anleitung bestimmen den Aufbau hier:
 *
 *   1. „Die Reihenfolge (erst das Element, danach das Script) […] ist
 *      entscheidend, damit das Widget korrekt initialisiert wird.“
 *      Deshalb steht <widget-lite> im JSX vor <Script>.
 *   2. Es entsteht KEIN iframe und es werden keine Stylesheets nachgeladen –
 *      das Widget rendert direkt in das Custom Element (Shadow DOM).
 *
 * Kennung und Status liegen in willhaben-lite-config.ts, damit die
 * Server-Komponente den Status abfragen kann, ohne diesen Client-Code zu
 * laden.
 */
export function WillhabenLiteEmbed() {
  return (
    <>
      {/* Einhängepunkt. Muss vor dem Script stehen – siehe oben. */}
      <widget-lite />

      {/*
       * `afterInteractive` lädt den Loader, sobald die Seite bedienbar ist:
       * früh genug, dass der Bestand ohne spürbare Verzögerung erscheint,
       * ohne das erste Rendern zu blockieren. Zu diesem Zeitpunkt steht das
       * Element bereits im DOM.
       *
       * Kein `dangerouslySetInnerHTML` – das Markup ist gewöhnliches JSX,
       * das Script lädt Next.js selbst.
       */}
      <Script src={LOADER_SRC} strategy="afterInteractive" />
    </>
  );
}
