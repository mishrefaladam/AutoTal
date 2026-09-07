import type { VehicleWidgetStatus } from "./config";

/**
 * Kennung und Status der willhaben-Einbettung.
 *
 * Bewusst getrennt von willhaben-lite.tsx: Dort steht die Einbettung selbst
 * und damit `next/script`, also Client-Code. `VehicleWidget` fragt aber nur
 * den Status ab und ist eine Server-Komponente – sie soll dafür nicht die
 * Client-Komponente mitladen müssen.
 */

/**
 * Händler-ID von AutoTal, aus dem von willhaben gelieferten Einbettungscode
 * (E-Mail vom 06.09.2026).
 *
 * Bewusst mit Standardwert im Code statt als reine Umgebungsvariable: Die ID
 * ist nicht vertraulich – sie steht in der Script-URL auf jeder ausgelieferten
 * Seite. Läge sie ausschließlich in einer Umgebungsvariablen, würde ein
 * vergessener Eintrag in Vercel die Fahrzeugliste still verschwinden lassen.
 *
 * Überschreibbar bleibt sie trotzdem, etwa für einen Testaccount.
 */
export const DEALER_ID =
  process.env.NEXT_PUBLIC_WILLHABEN_DEALER_ID?.trim() || "1005256";

/** Loader von willhaben. Host und Pfad stammen unverändert aus der Anleitung. */
export const LOADER_SRC = `https://widget-lite.willhaben.at/production/${DEALER_ID}/loader.js`;

export function getWillhabenLiteStatus(): VehicleWidgetStatus {
  // Ohne Händler-ID gäbe es keine gültige Loader-URL. Dann lieber ehrlich
  // "nicht eingerichtet" melden als ein Script mit kaputtem Pfad zu laden.
  return DEALER_ID ? "ready" : "missing-embed";
}
