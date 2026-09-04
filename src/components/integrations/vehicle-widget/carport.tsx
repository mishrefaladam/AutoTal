import type { VehicleWidgetStatus } from "./config";

/**
 * willhaben „Carport Widget“ – kostenpflichtige Alternative zu Widget Lite.
 *
 * Vorbereitet, aber nicht bestellt. Sollte Widget Lite optisch oder funktional
 * nicht ausreichen, wird in `config.ts` der Anbieter auf "carport" umgestellt
 * und hier der von willhaben gelieferte Code eingesetzt. Die Seite
 * /fahrzeuge, die Navigation und die übrige Logik bleiben unverändert.
 *
 * ---------------------------------------------------------------------------
 * TODO: Insert official willhaben Carport Widget embed code here.
 * ---------------------------------------------------------------------------
 *
 * Zum Vorgehen siehe README, Abschnitt „Migration Widget Lite → Carport“.
 */

const EMBED_AVAILABLE = false;

export function getCarportStatus(): VehicleWidgetStatus {
  return EMBED_AVAILABLE ? "ready" : "missing-embed";
}

export function CarportEmbed() {
  if (!EMBED_AVAILABLE) return null;

  // TODO: Insert official willhaben Carport Widget embed code here.
  return null;
}
