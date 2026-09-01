import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Moderne Formate zuerst – spart bei Fahrzeugbildern deutlich Bandbreite (US-30).
    formats: ["image/avif", "image/webp"],
    // Zugeschnitten auf die tatsächlich verwendeten Layoutbreiten.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 128, 256, 384],
    // Fahrzeugbilder ändern sich nur beim Sync – 30 Tage Cache sind sicher.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        // Bildquelle der Mock-Testdaten.
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      // TODO(anbindung): Sobald ein echter VehicleProvider angebunden ist,
      // dessen Bild-Hostnamen hier ergänzen. Ohne Eintrag blockiert
      // next/image die Auslieferung – das ist Absicht und verhindert, dass
      // beliebige fremde Hosts über die eigene Domain ausgeliefert werden.
    ],
  },

  // Zusätzliche Absicherung: Vercel liefert diese Header nicht automatisch.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
