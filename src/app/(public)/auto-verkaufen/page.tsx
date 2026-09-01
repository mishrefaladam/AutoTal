import type { Metadata } from "next";
import { BadgeCheck, Banknote, Clock, FileCheck, Phone } from "lucide-react";

import { SellCarForm } from "@/components/forms/sell-car-form";
import { Section } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCompany } from "@/modules/company/repository";

/**
 * Fahrzeugankauf (US-11).
 *
 * Die Formulardaten gehen ausschließlich per E-Mail an das Autohaus und
 * werden nicht in der Website-Datenbank gespeichert.
 */

export const metadata: Metadata = {
  title: "Auto verkaufen",
  description:
    "Verkaufen Sie Ihr Fahrzeug an uns: Eckdaten senden, Angebot erhalten, " +
    "Abwicklung inklusive Abmeldung. Ankauf aller Marken.",
  alternates: { canonical: "/auto-verkaufen" },
};

const BENEFITS = [
  {
    icon: Clock,
    title: "Antwort binnen 24 Stunden",
    text: "An Werktagen melden wir uns meist noch am selben Tag mit einer ersten Einschätzung.",
  },
  {
    icon: Banknote,
    title: "Sofortige Bezahlung",
    text: "Bei Einigung zahlen wir direkt bei der Übergabe – per Überweisung oder bar.",
  },
  {
    icon: FileCheck,
    title: "Abwicklung übernehmen wir",
    text: "Abmeldung, Kaufvertrag und Übergabeprotokoll erledigen wir für Sie.",
  },
  {
    icon: BadgeCheck,
    title: "Auch mit Mängeln",
    text: "Wir kaufen auch Fahrzeuge mit Reparaturbedarf oder abgelaufenem Pickerl an.",
  },
];

export default async function SellCarPage() {
  const company = await getCompany();

  const whatsappHref = buildWhatsAppUrl(
    company.whatsappNumber,
    "Guten Tag! Ich möchte mein Fahrzeug verkaufen und hätte dazu eine Frage.",
  );

  return (
    <>
      <section className="bg-ink text-ink-foreground">
        <div className="container-page py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">Fahrzeugankauf</p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Wir kaufen Ihr Auto
            </h1>
            <p className="text-ink-muted mt-5 text-lg leading-relaxed text-pretty">
              Kein Inserieren, keine Besichtigungstermine mit Fremden, kein
              Feilschen. Schicken Sie uns die Eckdaten Ihres Fahrzeugs – wir
              melden uns mit einem konkreten Angebot.
            </p>
          </div>
        </div>
      </section>

      {/* Vorteile */}
      <section className="border-border border-b">
        <div className="container-page grid gap-px py-2 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="flex gap-3.5 px-1 py-6">
              <benefit.icon
                className="text-brand mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold">{benefit.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {benefit.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Section aria-labelledby="ankauf-formular">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
          <div className="min-w-0">
            <h2
              id="ankauf-formular"
              className="font-display text-2xl font-bold tracking-tight"
            >
              Fahrzeug anbieten
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
              Je genauer Ihre Angaben, desto verbindlicher unser Angebot. Wenn
              Sie etwas nicht wissen, lassen Sie das Feld einfach frei – wir
              klären den Rest im Gespräch.
            </p>

            <div className="mt-8">
              <SellCarForm />
            </div>
          </div>

          <aside className="lg:pt-14">
            <div className="border-border bg-muted/40 rounded-xl border p-6">
              <h2 className="font-display text-lg font-bold">
                Lieber persönlich?
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                Rufen Sie uns an oder kommen Sie mit dem Fahrzeug vorbei. Eine
                Bewertung vor Ort dauert etwa 20 Minuten – Termin nicht
                zwingend nötig.
              </p>

              <div className="mt-5 space-y-3">
                {company.phoneHref && (
                  <Button asChild variant="brand" size="xl" className="w-full">
                    <a href={`tel:${company.phoneHref}`}>
                      <Phone data-icon="inline-start" aria-hidden="true" />
                      <span className="tabular">{company.phone}</span>
                    </a>
                  </Button>
                )}

                {whatsappHref && (
                  <Button asChild variant="outline" size="xl" className="w-full">
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Über WhatsApp schreiben
                    </a>
                  </Button>
                )}
              </div>

              <div className="border-border mt-6 border-t pt-5">
                <h3 className="text-sm font-semibold">Das brauchen wir</h3>
                <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
                  <li>· Zulassungsschein</li>
                  <li>· Serviceheft und Rechnungen</li>
                  <li>· Alle Schlüssel</li>
                  <li>· Letztes §57a-Gutachten</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
