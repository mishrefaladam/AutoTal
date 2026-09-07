"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { LOADER_SRC } from "./willhaben-lite-config";

let persistentWidget: HTMLElement | null = null;
let widgetParkingLot: DocumentFragment | null = null;

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
 *
 * Der Loader initialisiert nur die Elemente, die beim ersten Ausführen im DOM
 * stehen. Bei einer Next.js-Clientnavigation wird das Script nicht erneut
 * ausgeführt. Deshalb bleibt genau ein Widget-Element über Routenwechsel
 * erhalten: Beim Verlassen wird es in ein DocumentFragment verschoben und
 * beim Zurückkehren wieder in den sichtbaren Host eingesetzt.
 */
export function WillhabenLiteEmbed() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [widgetMounted, setWidgetMounted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const widget = persistentWidget ?? document.createElement("widget-lite");
    persistentWidget = widget;

    // Das Element muss im DOM stehen, bevor Next den Loader einsetzt.
    host.replaceChildren(widget);
    setWidgetMounted(true);

    const resizeFrame = window.requestAnimationFrame(() => {
      // Das erhaltene Widget darf seine Breite nach dem Wiedereinsetzen neu
      // berechnen. Der Drittanbieter lauscht bereits auf dieses Ereignis.
      window.dispatchEvent(new Event("resize"));
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);

      if (widget.parentNode === host) {
        widgetParkingLot ??= document.createDocumentFragment();
        widgetParkingLot.appendChild(widget);
      }
    };
  }, []);

  return (
    <>
      <div ref={hostRef} className="w-full" data-willhaben-widget-host />

      {/*
       * `widgetMounted` wird erst gesetzt, nachdem das Element in den Host
       * eingesetzt wurde. Damit bleibt die von willhaben verlangte Reihenfolge
       * auch bei Hydration und Clientnavigation garantiert.
       *
       * Next.js lädt dieselbe Script-URL pro Browser-Sitzung nur einmal. Das
       * passt zum langlebigen Widget-Element und verhindert doppelte Instanzen.
       */}
      {widgetMounted && (
        <Script src={LOADER_SRC} strategy="afterInteractive" />
      )}
    </>
  );
}
