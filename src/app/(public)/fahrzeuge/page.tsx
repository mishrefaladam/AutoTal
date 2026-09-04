import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Phone, Tag } from "lucide-react";

import { VehicleWidget } from "@/components/integrations/vehicle-widget";
import { Section } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCompany } from "@/modules/company/repository";

/**
 * Fahrzeugbestand (US-03).
 *
 * Der Bestand kommt aus der eingebetteten willhaben-Fahrzeugbörse. Diese
 * Seite kennt den konkreten Anbieter nicht – sie rendert `VehicleWidget`,
 * dahinter steckt derzeit Widget Lite.
 *
 * Bewusst kein eigener Bestand mehr: Es gibt für diesen Händler keinen
 * API-Zugang zu willhaben, und gescrapt wird nicht. Der Händler pflegt seine
 * Fahrzeuge ausschließlich auf willhaben; Änderungen erscheinen laut Anbieter
 * unmittelbar im Widget.
 */

export const metadata: Metadata = {
  title: "Fahrzeuge",
  description:
    "Unser aktueller Fahrzeugbestand – Gebrauchtwagen aus Strasshof an der " +
    "Nordbahn. Alle Fahrzeuge geprüft und sofort verfügbar.",
  alternates: { canonical: "/fahrzeuge" },
};

export default async function VehiclesPage() {
  const company = await getCompany();

  const whatsappHref = buildWhatsAppUrl(
    company.whatsappNumber,
    `Guten Tag! Ich suche ein bestimmtes Fahrzeug und habe es im Bestand von ` +
      `${company.displayName} nicht gefunden. Können Sie mir weiterhelfen?`,
  );

  return (
    <>
      {/* Seitenkopf */}
      <section className="bg-ink text-ink-foreground">
        <div className="container-page py-14 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">Fahrzeugbestand</p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Unsere Fahrzeuge
            </h1>
            <p className="text-ink-muted mt-5 text-lg leading-relaxed text-pretty">
              Alle Fahrzeuge sind sofort verfügbar und wurden vor der Aufnahme
              in den Bestand technisch geprüft. Der Bestand wird laufend
              aktualisiert – Besichtigung und Probefahrt jederzeit nach
              Vereinbarung.
            </p>
          </div>
        </div>
      </section>

      {/* Fahrzeugbörse */}
      <Section aria-labelledby="fahrzeugboerse">
        <h2 id="fahrzeugboerse" className="sr-only">
          Fahrzeugbörse
        </h2>

        <VehicleWidget />
      </Section>

      {/* Abschluss-CTA */}
      <Section tone="muted" aria-labelledby="nicht-gefunden">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="nicht-gefunden"
            className="font-display text-3xl font-bold tracking-tight text-balance"
          >
            Sie haben Ihr Wunschfahrzeug nicht gefunden?
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
            Sagen Sie uns, wonach Sie suchen. Wir halten die Augen offen und
            melden uns, sobald etwas Passendes hereinkommt. Und wenn Sie Ihr
            aktuelles Fahrzeug abgeben möchten, kaufen wir es gerne an.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild variant="brand" size="2xl">
              <Link href="/kontakt">
                <Mail data-icon="inline-start" aria-hidden="true" />
                Suchauftrag aufgeben
              </Link>
            </Button>

            {whatsappHref && (
              <Button
                asChild
                size="2xl"
                className="bg-[#25D366] text-white hover:bg-[#1eb757] focus-visible:ring-[#25D366]/40"
              >
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle data-icon="inline-start" aria-hidden="true" />
                  Über WhatsApp fragen
                </a>
              </Button>
            )}

            <Button asChild variant="outline" size="2xl">
              <Link href="/auto-verkaufen">
                <Tag data-icon="inline-start" aria-hidden="true" />
                Auto verkaufen
              </Link>
            </Button>
          </div>

          {company.phoneHref && (
            <p className="text-muted-foreground mt-8 text-sm">
              Oder rufen Sie einfach an:{" "}
              <a
                href={`tel:${company.phoneHref}`}
                className="text-foreground tabular font-semibold hover:underline"
              >
                <Phone className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
                {company.phone}
              </a>
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
