import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/env";

/**
 * Sitemap.
 *
 * Enthält ausschließlich eigene Seiten. Einzelne Fahrzeuge stehen bewusst
 * NICHT darin: Der Bestand wird über die eingebettete willhaben-Fahrzeugbörse
 * angezeigt und hat auf dieser Website keine eigenen URLs. Die
 * Fahrzeug-Detailseiten liegen bei willhaben und werden dort indexiert.
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

  return staticRoutes;
}
