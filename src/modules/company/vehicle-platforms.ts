import type { InteractionChannel } from "@/generated/prisma/enums";

/**
 * Fahrzeugplattformen, auf denen AutoTal ebenfalls inseriert.
 *
 * `channel` ordnet jede Plattform dem Zähler der Website-Interaktionen zu.
 * Wichtig: Ein Klick darauf ist ein Klick – keine Anfrage und kein Verkauf.
 * Siehe src/modules/interactions/channels.ts.
 */
export const VEHICLE_PLATFORMS = [
  { field: "willhabenUrl", label: "Willhaben", channel: "WILLHABEN" },
  { field: "autoscoutUrl", label: "AutoScout24", channel: "AUTOSCOUT" },
  {
    field: "gebrauchtwagenUrl",
    label: "gebrauchtwagen.at",
    channel: "GEBRAUCHTWAGEN",
  },
] as const satisfies readonly {
  field: string;
  label: string;
  channel: InteractionChannel;
}[];
