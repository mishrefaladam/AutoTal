/**
 * Konfiguration der Fahrzeugbörse.
 *
 * Der Fahrzeugbestand wird nicht mehr selbst verwaltet, sondern von einem
 * Widget des Anbieters eingebettet. Der Kunde nutzt zunächst „Widget Lite“
 * von willhaben; ein späterer Wechsel auf das kostenpflichtige „Carport
 * Widget“ soll nur diese Integrationsschicht betreffen.
 *
 * Bewusst eine typisierte Konstante statt einer Umgebungsvariablen: Der
 * Anbieter wechselt genau einmal, und zwar zusammen mit einem Code-Deployment
 * (der Einbettungscode selbst liegt ja auch im Code). Eine Umgebungsvariable
 * würde nur suggerieren, man könne zur Laufzeit umschalten – kann man nicht,
 * solange der jeweilige Einbettungscode nicht hinterlegt ist.
 */

export type VehicleWidgetProvider = "willhaben-lite" | "carport";

/** Aktiv genutzte Fahrzeugbörse. */
export const VEHICLE_WIDGET_PROVIDER: VehicleWidgetProvider = "willhaben-lite";

/**
 * Zustand der Einbettung.
 *
 * `ready`          – Einbettungscode liegt vor und wird gerendert
 * `missing-embed`  – Der Anbieter ist gewählt, der offizielle Code fehlt aber
 *                    noch. In der Entwicklung erscheint ein Platzhalter, in
 *                    der Produktion eine neutrale Meldung plus Fehlerlog.
 */
export type VehicleWidgetStatus = "ready" | "missing-embed";

export const PROVIDER_LABELS: Record<VehicleWidgetProvider, string> = {
  "willhaben-lite": "willhaben Widget Lite",
  carport: "willhaben Carport Widget",
};
