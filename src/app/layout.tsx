import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";

import { forceMotionInDevelopment } from "@/components/motion/preferences";
import { Toaster } from "@/components/ui/sonner";
import { siteUrl } from "@/lib/env";
import { getCompany } from "@/modules/company/repository";

import "./globals.css";

/**
 * Wurzel-Layout.
 *
 * Enthält nur, was auf *jeder* Seite gilt – Schriften, Farbschema, Toaster.
 * Kopf- und Fußzeile leben im Layout der öffentlichen Seiten, damit der
 * Adminbereich sie nicht mitschleppt.
 */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Schmale, technische Grotesk für Überschriften – gibt der Seite die
// automobile Anmutung, ohne dass der Fließtext an Lesbarkeit verliert.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany();
  const name = company.displayName || "AutoTal";

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${name} – Gebrauchtwagen${company.city ? ` in ${company.city}` : ""}`,
      template: `%s | ${name}`,
    },
    description:
      company.tagline ||
      `Geprüfte Gebrauchtwagen bei ${name}. Fahrzeugbestand ansehen, ` +
        `Finanzierung berechnen und Probefahrt vereinbaren.`,
    applicationName: name,
    openGraph: {
      type: "website",
      locale: "de_AT",
      siteName: name,
      url: siteUrl(),
      // PNG statt WebP: Einige Social-Vorschauen zeigen WebP nicht an.
      images: [
        {
          url: "/autotal-logo.png",
          width: 400,
          height: 240,
          alt: `${name} – Wähl' das Original`,
        },
      ],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    formatDetection: { telephone: true, address: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1d22" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de-AT"
      data-force-motion={forceMotionInDevelopment ? "true" : undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
