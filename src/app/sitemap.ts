import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/env";
import { listActiveVehicleSlugs } from "@/modules/vehicles/repository";

/**
 * Sitemap.
 *
 * Enthält die statischen Seiten und jede aktive Fahrzeugseite. Deaktivierte
 * Fahrzeuge (verkauft, entfernt) verschwinden automatisch mit, weil
 * `listActiveVehicleSlugs()` nur aktive liefert (US-07).
 */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/fahrzeuge`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/finanzierung`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/auto-verkaufen`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/ueber-uns`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${base}/kontakt`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${base}/impressum`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${base}/datenschutz`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  try {
    const vehicles = await listActiveVehicleSlugs();

    return [
      ...staticRoutes,
      ...vehicles.map((vehicle) => ({
        url: `${base}/fahrzeuge/${vehicle.slug}`,
        lastModified: vehicle.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // Ist die Datenbank kurzzeitig nicht erreichbar, wird lieber eine
    // unvollständige Sitemap ausgeliefert als gar keine.
    return staticRoutes;
  }
}
