import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ExternalLink, Info, Landmark } from "lucide-react";

import { FinanceCalculator } from "@/components/financing/finance-calculator";
import { Section, SectionHeader } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/money";
import {
  getFinanceConfig,
  listFinanceProviders,
} from "@/modules/financing/repository";

/**
 * Finanzierungsseite (US-12, US-13).
 *
 * Der Rechner arbeitet mit einem plausiblen Beispielpreis, sobald Fahrzeuge
 * im Bestand sind – so sieht der Besucher sofort eine realistische Rate statt
 * einer Null.
 */

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Finanzierung",
  description:
    "Berechnen Sie unverbindlich Ihre monatliche Rate: Anzahlung, Laufzeit, " +
    "Zinssatz und Schlussrate frei wählbar. Dazu unsere Finanzierungspartner " +
    "im Überblick.",
  alternates: { canonical: "/finanzierung" },
};

export default async function FinancingPage() {
  const [config, providers] = await Promise.all([
    getFinanceConfig(),
    listFinanceProviders(),
  ]);

  // Startwert des Rechners. Bewusst ein fester, plausibler Betrag: Der
  // Fahrzeugbestand liegt bei willhaben und ist für die Website nicht
  // auslesbar. Aus dem Widget Daten zu ziehen wäre Scraping – das ist
  // ausgeschlossen. Der Wert lässt sich im Rechner frei ändern.
  const initialPriceCents = 2_500_000;

  return (
    <>
      {/* Kopfbereich */}
      <section className="bg-ink text-ink-foreground">
        <div className="container-page py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">Finanzierung</p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Ihre Rate, selbst gerechnet
            </h1>
            <p className="text-ink-muted mt-5 text-lg leading-relaxed text-pretty">
              Stellen Sie Anzahlung, Laufzeit und Schlussrate so ein, wie es zu
              Ihnen passt. Sie sehen sofort, was das monatlich bedeutet – ohne
              Anmeldung und ohne dass Sie uns Daten hinterlassen müssen.
            </p>
          </div>
        </div>
      </section>

      {/* Rechner */}
      <Section aria-labelledby="rechner">
        <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
          <div>
            <h2
              id="rechner"
              className="font-display text-2xl font-bold tracking-tight"
            >
              Finanzierungsrechner
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Die Voreinstellungen entsprechen unseren üblichen Konditionen.
              Alle Werte lassen sich verändern.
            </p>

            <div className="border-border mt-7 rounded-xl border p-5 sm:p-7">
              <FinanceCalculator
                config={config}
                initialPriceCents={initialPriceCents}
                priceEditable
              />
            </div>
          </div>

          {/* Ablauf */}
          <aside className="lg:pt-14">
            <div className="border-border bg-card rounded-xl border p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-display text-lg font-bold">
                So läuft die Finanzierung ab
              </h2>

              <ol className="mt-5 space-y-4">
                {[
                  {
                    title: "Rate durchrechnen",
                    text: "Hier auf der Website oder gemeinsam bei uns im Haus.",
                  },
                  {
                    title: "Unterlagen mitbringen",
                    text: "Ausweis, Meldezettel und die letzten drei Gehaltsnachweise.",
                  },
                  {
                    title: "Antrag stellen",
                    text: "Wir übermitteln den Antrag an den passenden Partner.",
                  },
                  {
                    title: "Zusage und Übergabe",
                    text: "Nach positiver Prüfung meist innerhalb eines Werktags.",
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span
                      aria-hidden="true"
                      className="bg-brand text-brand-foreground tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {step.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Stärkster Abschluss der Seite – bewusst größer als der
                  übrige Text der Karte. */}
              <Button asChild variant="brand" size="2xl" className="mt-8 w-full">
                <Link href="/kontakt">Beratung anfragen</Link>
              </Button>
            </div>
          </aside>
        </div>
      </Section>

      {/* Finanzierungspartner (US-13) */}
      <Section tone="muted" aria-labelledby="partner">
        <SectionHeader
          headingId="partner"
          eyebrow="Partner"
          title="Unsere Finanzierungspartner"
          description="Wir arbeiten mit mehreren Partnern zusammen und holen für Sie das jeweils passende Angebot ein – Sie müssen nicht selbst vergleichen."
        />

        {providers.length > 0 ? (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <li key={provider.id}>
                <article className="border-border bg-card flex h-full flex-col rounded-xl border p-6">
                  <div className="flex items-center gap-3">
                    {provider.logoUrl ? (
                      <Image
                        src={provider.logoUrl}
                        alt={provider.name}
                        width={120}
                        height={40}
                        className="h-9 w-auto object-contain"
                      />
                    ) : (
                      <span className="bg-brand-subtle text-brand-strong flex size-10 items-center justify-center rounded-lg">
                        <Landmark className="size-5" aria-hidden="true" />
                      </span>
                    )}
                  </div>

                  <h3 className="font-display mt-4 text-lg font-bold">
                    {provider.name}
                  </h3>

                  {provider.interestRateBp !== null && (
                    <p className="text-brand-strong tabular mt-1 text-sm font-semibold">
                      ab {formatPercent(provider.interestRateBp)} Sollzins p. a.
                    </p>
                  )}

                  {provider.description && (
                    <p className="text-muted-foreground mt-3 flex-1 text-sm leading-relaxed">
                      {provider.description}
                    </p>
                  )}

                  {provider.websiteUrl && (
                    <a
                      href={provider.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-strong mt-5 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                    >
                      Zum Partner
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed py-14 text-center">
            Unsere Finanzierungspartner werden gerade aktualisiert. Rufen Sie
            uns an – wir beraten Sie gerne persönlich.
          </p>
        )}

        {/* Pflichthinweis */}
        <p className="text-muted-foreground bg-background border-border mt-10 flex gap-3 rounded-lg border p-5 text-sm leading-relaxed">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{config.disclaimer}</span>
        </p>
      </Section>

      {/* Abschluss-CTA */}
      <Section aria-labelledby="finanzierung-cta">
        <div className="bg-ink text-ink-foreground rounded-2xl px-8 py-14 text-center lg:px-12">
          <h2
            id="finanzierung-cta"
            className="font-display text-3xl font-bold tracking-tight text-balance"
          >
            Erst das Auto, dann die Rate
          </h2>
          <p className="text-ink-muted mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
            Sehen Sie sich unseren Bestand an – auf jeder Fahrzeugseite steht
            der Rechner mit dem tatsächlichen Preis bereits fertig eingestellt.
          </p>

          <Button asChild variant="brand" size="2xl" className="mt-8">
            <Link href="/fahrzeuge">
              Fahrzeuge ansehen
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
