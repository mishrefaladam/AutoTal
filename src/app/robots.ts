import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/env";

/**
 * robots.txt
 *
 * Der Adminbereich und die API-Routen werden ausgeschlossen. Das ist kein
 * Zugriffsschutz – der liegt in der Middleware und der serverseitigen
 * Autorisierung – sondern verhindert nur, dass Suchmaschinen dort landen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
