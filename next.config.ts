import type { NextConfig } from "next";

/**
 * Direktiven, die auf jeder Seite gelten.
 *
 * Bewusst OHNE script-src, img-src, connect-src und style-src.
 *
 * Auf /fahrzeuge läuft mit dem willhaben Widget Lite fremder Code, den wir
 * nicht steuern: Der Loader von widget-lite.willhaben.at zieht splide.js und
 * widget.js nach, das Widget legt <style>- und <link>-Elemente an, holt die
 * Fahrzeugdaten von gms.autopro24.at, bettet Google Maps ein und lädt Matomo
 * von stats.ap24-carports.at. Die Hosts der Fahrzeugfotos stehen erst in den
 * Daten und lassen sich aus dem Code nicht vollständig ableiten.
 *
 * Eine unvollständige script-/img-Liste würde den Fahrzeugbestand still
 * leeren. Diese vier Direktiven gehören deshalb erst gesetzt, wenn die
 * tatsächlich geladenen Hosts im Browser beobachtet wurden – siehe
 * src/components/integrations/vehicle-widget/README.md.
 *
 * Was hier steht, ist unabhängig davon wirksam und für das Widget folgenlos:
 *   base-uri        – verhindert, dass ein eingeschleustes <base> alle
 *                     relativen URLs der Seite umlenkt
 *   object-src      – schließt <object>/<embed> aus, die auf dieser Seite
 *                     niemand braucht
 *   frame-ancestors – Klickjacking-Schutz, entspricht dem ebenfalls
 *                     gesetzten X-Frame-Options
 */
const BASE_CSP_DIRECTIVES = [
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "block-all-mixed-content",
];

/**
 * Next.js ERSETZT bei gleichem Header-Schlüssel den Wert einer allgemeineren
 * Regel, statt ihn zu ergänzen. Die Policy des Adminbereichs muss die
 * Basisdirektiven deshalb wiederholen – sonst verlöre ausgerechnet der
 * sensibelste Bereich base-uri und object-src.
 */
function contentSecurityPolicy(...extra: string[]): string {
  return [...BASE_CSP_DIRECTIVES, ...extra].join("; ");
}

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
      {
        // Vercel Blob – hier landen die im Admin hochgeladenen Fahrzeugbilder.
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
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
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy("frame-ancestors 'self'"),
          },
        ],
      },
      {
        /**
         * Strengere Policy für die Verwaltung. Hier läuft kein Fremdcode,
         * deshalb ist beides gefahrlos:
         *
         *   frame-ancestors 'none' – der Adminbereich darf nirgends
         *     eingebettet werden, auch nicht von der eigenen Domain.
         *     Bewusst über CSP statt über ein zweites X-Frame-Options:
         *     Zwei widersprüchliche X-Frame-Options-Header ignorieren
         *     manche Browser vollständig.
         *   form-action 'self' – ein eingeschleustes Formular kann
         *     Kundendaten nicht an eine fremde Adresse senden. Alle
         *     Adminformulare laufen über Server Actions auf die eigene
         *     Domain; die Instagram-Verbindung ist eine Navigation über
         *     window.location, kein Formular.
         */
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(
              "frame-ancestors 'none'",
              "form-action 'self'",
            ),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
