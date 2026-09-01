import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Handshake, MapPin, Phone, ShieldCheck, Wrench } from "lucide-react";

import { Section, SectionHeader } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { getCompany } from "@/modules/company/repository";
import { countActiveVehicles } from "@/modules/vehicles/repository";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Über uns",
  description:
    "Wer wir sind und wie wir arbeiten: geprüfte Gebrauchtwagen, ehrliche " +
    "Beratung und Service auch nach dem Kauf.",
  alternates: { canonical: "/ueber-uns" },
};

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Transparenz",
    text: "Wir sagen Ihnen, was ein Fahrzeug kann – und was nicht. Bekannte Mängel stehen im Inserat, nicht im Kleingedruckten.",
  },
  {
    icon: Wrench,
    title: "Technik zuerst",
    text: "Jedes Fahrzeug geht vor dem Verkauf durch die Werkstatt. Was nicht in Ordnung ist, wird repariert oder klar benannt.",
  },
  {
    icon: Handshake,
    title: "Beratung ohne Druck",
    text: "Wir verkaufen Ihnen lieber nichts, als das falsche Auto. Wenn ein Fahrzeug nicht zu Ihnen passt, sagen wir das.",
  },
];

export default async function AboutPage() {
  const [company, vehicleCount] = await Promise.all([
    getCompany(),
    countActiveVehicles(),
  ]);

  return (
    <>
      <section className="bg-ink text-ink-foreground">
        <div className="container-page py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">Über uns</p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              {company.displayName}
            </h1>
            {company.tagline && (
              <p className="text-ink-muted mt-5 text-lg leading-relaxed text-pretty">
                {company.tagline}
              </p>
            )}
          </div>
        </div>
      </section>

      <Section aria-labelledby="ueber-uns-text">
        <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
          <div className="max-w-2xl">
            <h2
              id="ueber-uns-text"
              className="font-display text-2xl font-bold tracking-tight"
            >
              Wer wir sind
            </h2>

            <div className="mt-5 space-y-4 leading-relaxed text-pretty">
              {company.aboutText ? (
                company.aboutText
                  .split(/\n{2,}/)
                  .map((paragraph, index) => <p key={index}>{paragraph}</p>)
              ) : (
                <p className="text-muted-foreground">
                  {/* Ohne gepflegten Text bleibt die Seite trotzdem sinnvoll. */}
                  Der Text über unser Autohaus wird gerade überarbeitet. Rufen
                  Sie uns gerne an – wir erzählen Ihnen persönlich, wie wir
                  arbeiten.
                </p>
              )}
            </div>
          </div>

          <aside>
            <div className="border-border bg-muted/40 rounded-xl border p-6">
              <h2 className="font-display text-lg font-bold">Auf einen Blick</h2>

              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Fahrzeuge im Bestand</dt>
                  <dd className="font-display tabular mt-0.5 text-2xl font-bold">
                    {vehicleCount}
                  </dd>
                </div>

                {company.addressLine && (
                  <div>
                    <dt className="text-muted-foreground">Standort</dt>
                    <dd className="mt-0.5 font-medium">
                      {company.postalCode} {company.city}
                    </dd>
                  </div>
                )}

                {company.contactPersonName && (
                  <div>
                    <dt className="text-muted-foreground">Ihr Ansprechpartner</dt>
                    <dd className="mt-0.5 font-medium">
                      {company.contactPersonName}
                      {company.contactPersonRole && (
                        <span className="text-muted-foreground block text-xs font-normal">
                          {company.contactPersonRole}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 space-y-3">
                {company.phoneHref && (
                  <Button asChild variant="brand" size="xl" className="w-full">
                    <a href={`tel:${company.phoneHref}`}>
                      <Phone data-icon="inline-start" aria-hidden="true" />
                      <span className="tabular">{company.phone}</span>
                    </a>
                  </Button>
                )}

                <Button asChild variant="outline" size="xl" className="w-full">
                  <Link href="/kontakt">
                    <MapPin data-icon="inline-start" aria-hidden="true" />
                    Anfahrt und Zeiten
                  </Link>
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="muted" aria-labelledby="werte">
        <SectionHeader
          headingId="werte"
          eyebrow="Haltung"
          title="Wie wir arbeiten"
          align="center"
        />

        <ul className="grid gap-6 lg:grid-cols-3">
          {VALUES.map((value) => (
            <li key={value.title}>
              <article className="border-border bg-card h-full rounded-xl border p-7">
                <span className="bg-brand-subtle text-brand flex size-11 items-center justify-center rounded-lg">
                  <value.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-display mt-5 text-xl font-bold">
                  {value.title}
                </h3>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  {value.text}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </Section>

      <Section aria-labelledby="ueber-uns-cta">
        <div className="bg-ink text-ink-foreground rounded-2xl px-8 py-14 text-center lg:px-12">
          <h2
            id="ueber-uns-cta"
            className="font-display text-3xl font-bold tracking-tight text-balance"
          >
            Schauen Sie sich um
          </h2>
          <p className="text-ink-muted mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
            {vehicleCount} geprüfte Fahrzeuge warten auf Sie – online ansehen
            oder direkt bei uns am Platz.
          </p>

          <Button asChild variant="brand" size="2xl" className="mt-8">
            <Link href="/fahrzeuge">
              Zum Fahrzeugbestand
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
