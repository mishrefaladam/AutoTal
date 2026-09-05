import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Car,
  Clock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Tag,
  Wrench,
} from "lucide-react";

import { Marquee } from "@/components/motion/marquee";
import { Parallax } from "@/components/motion/parallax";
import { Reveal } from "@/components/motion/reveal";
import { Section, SectionHeader } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, generalWhatsAppMessage } from "@/lib/whatsapp";
import {
  OPENING_HOURS_UNKNOWN_LABEL,
  getOpeningStatus,
  groupOpeningHours,
} from "@/modules/company/opening-hours";
import { getCompany } from "@/modules/company/repository";

/**
 * Startseite (US-01).
 *
 * Serverseitig gerendert – der Besucher bekommt sofort echten Inhalt statt
 * eines Ladezustands (US-30). Die Unternehmensdaten ändern sich selten,
 * deshalb wird die Seite für 10 Minuten zwischengespeichert. Beim Speichern
 * im Admin wird sie ohnehin sofort neu validiert.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Ruhiges Hero-Motiv; zeigt bewusst kein konkretes Bestandsfahrzeug.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70" +
  "?auto=format&fit=crop&w=2400&q=80";

export default async function HomePage() {
  const company = await getCompany();

  const openingStatus = getOpeningStatus(company.openingHours);
  const openingDays = groupOpeningHours(company.openingHours);

  const whatsappHref = buildWhatsAppUrl(
    company.whatsappNumber,
    generalWhatsAppMessage(company.displayName),
  );

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-ink text-ink-foreground relative isolate overflow-hidden">
        {/* Der Rahmen ragt oben und unten über den Abschnitt hinaus, damit
            beim Parallax-Versatz keine Kante frei wird. */}
        <Parallax className="absolute inset-x-0 -top-16 -bottom-16" strength={40}>
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-photo object-cover object-center opacity-30"
          />
        </Parallax>
        {/* Verlauf, damit die Schrift auf jedem Bildausschnitt lesbar bleibt. */}
        <div
          aria-hidden="true"
          className="from-ink via-ink/85 to-ink/40 absolute inset-0 bg-gradient-to-r"
        />

        <div className="container-page relative py-20 lg:py-32">
          <div className="max-w-2xl">
            {company.openingHours.length > 0 && (
              <p className="rise-in border-ink-border mb-6 inline-flex items-center gap-2 rounded-full border bg-white/5 px-3.5 py-1.5 text-sm backdrop-blur-sm">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full",
                    openingStatus.isOpen ? "bg-success" : "bg-ink-muted",
                  )}
                />
                {openingStatus.label}
              </p>
            )}

            {/* Die beiden Zeilen kommen nacheinander – die Aussage baut sich
                so auf, statt fertig dazustehen. */}
            <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              <span className="rise-in block" style={{ "--rise-delay": "80ms" } as React.CSSProperties}>
                Ihr nächstes Auto.
              </span>
              <span
                className="rise-in text-brand-strong block"
                style={{ "--rise-delay": "200ms" } as React.CSSProperties}
              >
                Ehrlich geprüft.
              </span>
            </h1>

            {/* Tagline und Fließtext bleiben getrennte Absätze: Die Tagline
                kommt aus dem Admin und endet nicht zwingend mit einem
                Satzzeichen – aneinandergehängt entstünde ein Textfehler. */}
            <p
              className="rise-in text-ink-foreground mt-6 max-w-xl text-lg font-medium text-pretty"
              style={{ "--rise-delay": "320ms" } as React.CSSProperties}
            >
              {company.tagline ?? "Geprüfte Gebrauchtwagen mit lückenloser Historie."}
            </p>

            <p
              className="rise-in text-ink-muted mt-3 max-w-xl text-lg leading-relaxed text-pretty"
              style={{ "--rise-delay": "400ms" } as React.CSSProperties}
            >
              Jedes Fahrzeug wird vor der Übergabe technisch durchgesehen – und
              wir sagen Ihnen auch, was nicht im Prospekt steht.
            </p>

            <div
              className="rise-in mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
              style={{ "--rise-delay": "500ms" } as React.CSSProperties}
            >
              <Button asChild variant="brand" size="2xl">
                <Link href="/fahrzeuge">
                  Fahrzeuge ansehen
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>

              <Button asChild variant="onInk" size="2xl">
                <Link href="/finanzierung">Finanzierung berechnen</Link>
              </Button>

              <Button asChild variant="onInk" size="2xl">
                <Link href="/auto-verkaufen">Auto verkaufen</Link>
              </Button>
            </div>

            {/* Eckdaten als Vertrauensanker.
                Bewusst keine Bestandszahl mehr: Der Fahrzeugbestand liegt
                bei willhaben, die Website kennt ihn nicht. Eine Zahl aus der
                eigenen Datenbank wäre schlicht falsch. */}
            <dl
              style={{ "--rise-delay": "600ms" } as React.CSSProperties}
              className="rise-in border-ink-border mt-12 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6 border-t pt-8 sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted text-sm">Fahrzeuge</dt>
                <dd className="font-display mt-1 text-2xl font-bold">geprüft</dd>
              </div>

              <div>
                <dt className="text-ink-muted text-sm">§57a-Begutachtung</dt>
                <dd className="font-display mt-1 text-2xl font-bold">inklusive</dd>
              </div>

              <div>
                <dt className="text-ink-muted text-sm">Probefahrt</dt>
                <dd className="font-display mt-1 text-2xl font-bold">
                  nach Termin
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Vertrauensmerkmale                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-border border-b">
        <div className="container-page grid gap-px py-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: BadgeCheck,
              title: "Technisch geprüft",
              text: "Jedes Fahrzeug durchläuft vor der Übergabe eine Werkstattkontrolle.",
            },
            {
              icon: ShieldCheck,
              title: "Gewährleistung",
              text: "Gesetzliche Gewährleistung, auf Wunsch mit Garantieverlängerung.",
            },
            {
              icon: Tag,
              title: "Faire Preise",
              text: "Marktorientiert kalkuliert, ohne versteckte Nebenkosten.",
            },
            {
              icon: Wrench,
              title: "Service danach",
              text: "Wir bleiben auch nach dem Kauf Ihre Anlaufstelle.",
            },
          ].map((item, index) => (
            <Reveal
              key={item.title}
              delay={index * 90}
              className="flex gap-3.5 px-1 py-6"
            >
              <item.icon
                className="text-brand-strong mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {item.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Fahrzeugbestand                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Section aria-labelledby="fahrzeugbestand">
        <Reveal className="border-border bg-card rounded-2xl border p-8 text-center lg:p-14">
          <p className="eyebrow mb-3">Fahrzeugbestand</p>
          <h2
            id="fahrzeugbestand"
            className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          >
            Unser aktueller Bestand
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl leading-relaxed text-pretty">
            Alle verfügbaren Fahrzeuge mit Bildern, Ausstattung und Preisen –
            laufend aktuell. Besichtigung und Probefahrt jederzeit nach
            Vereinbarung.
          </p>

          <Button asChild variant="brand" size="2xl" className="mt-8">
            <Link href="/fahrzeuge">
              Fahrzeuge ansehen
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </Reveal>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Laufband – ruhiger Übergang zwischen zwei hellen Abschnitten      */}
      {/* ---------------------------------------------------------------- */}
      <Marquee companyName={company.displayName} />

      {/* ---------------------------------------------------------------- */}
      {/* Leistungen                                                        */}
      {/* ---------------------------------------------------------------- */}
      <Section tone="muted" aria-labelledby="leistungen">
        <SectionHeader
          headingId="leistungen"
          eyebrow="Was wir für Sie tun"
          title="Kaufen, finanzieren, verkaufen"
          align="center"
        />

        <ul className="grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: Car,
              title: "Fahrzeug finden",
              text: "Filtern Sie unseren Bestand nach Marke, Preis, Kilometerstand, Erstzulassung, Kraftstoff und Getriebe – und finden Sie in Minuten die passende Auswahl.",
              href: "/fahrzeuge",
              cta: "Zum Fahrzeugbestand",
            },
            {
              icon: Banknote,
              title: "Finanzierung berechnen",
              text: "Rechnen Sie Ihre monatliche Rate selbst durch: Anzahlung, Laufzeit und Schlussrate frei wählbar. Unverbindlich und ohne Anmeldung.",
              href: "/finanzierung",
              cta: "Rate berechnen",
            },
            {
              icon: Tag,
              title: "Auto verkaufen",
              text: "Sie möchten Ihr Fahrzeug abgeben? Schicken Sie uns die Eckdaten und wir melden uns mit einem konkreten Ankaufangebot zurück.",
              href: "/auto-verkaufen",
              cta: "Fahrzeug anbieten",
            },
          ].map((service, index) => (
            <Reveal as="li" key={service.href} delay={index * 110}>
              <article className="group border-border bg-card relative flex h-full flex-col rounded-xl border p-7 transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]">
                <span className="bg-brand-subtle text-brand-strong flex size-11 items-center justify-center rounded-lg">
                  <service.icon className="size-5" aria-hidden="true" />
                </span>

                <h3 className="font-display mt-5 text-xl font-bold">
                  <Link
                    href={service.href}
                    className="outline-none after:absolute after:inset-0 after:content-['']"
                  >
                    {service.title}
                  </Link>
                </h3>

                <p className="text-muted-foreground mt-3 flex-1 text-sm leading-relaxed">
                  {service.text}
                </p>

                <p className="text-brand-strong mt-5 inline-flex items-center gap-1.5 text-sm font-medium">
                  {service.cta}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Haltung – die visuell stärkste Stelle der Seite                    */}
      {/* ---------------------------------------------------------------- */}
      {/* Der Satz stammt unverändert von /ueber-uns ("Beratung ohne Druck")
          und ist der einzige Ort der Startseite, an dem die Typografie so
          groß wird. Genau deshalb wirkt er. */}
      <Section tone="ink" aria-labelledby="haltung" className="py-24 lg:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="eyebrow mb-7">Unsere Haltung</p>
          </Reveal>

          <h2
            id="haltung"
            className="font-display text-3xl leading-[1.12] font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl"
          >
            <Reveal as="span" delay={90} className="block">
              Wir verkaufen Ihnen lieber nichts,
            </Reveal>
            <Reveal as="span" delay={230} className="text-brand-strong block">
              als das falsche Auto.
            </Reveal>
          </h2>

          <Reveal delay={380}>
            <p className="text-ink-muted mx-auto mt-7 max-w-xl text-lg leading-relaxed text-pretty">
              Wenn ein Fahrzeug nicht zu Ihnen passt, sagen wir das.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Kontakt und Öffnungszeiten                                        */}
      {/* ---------------------------------------------------------------- */}
      <Section aria-labelledby="kontakt-start">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <SectionHeader
              headingId="kontakt-start"
              eyebrow="Kontakt"
              title="Sprechen Sie uns an"
              description="Am schnellsten geht es telefonisch oder per WhatsApp. Schreiben Sie uns auch gerne außerhalb der Öffnungszeiten – wir melden uns am nächsten Werktag."
            />

            <ul className="space-y-4">
              {company.phone && (
                <li>
                  <a
                    href={`tel:${company.phoneHref}`}
                    className="group border-border hover:border-brand/40 flex items-center gap-4 rounded-xl border p-4 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                      <Phone className="size-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="text-muted-foreground block text-sm">
                        Telefon
                      </span>
                      <span className="tabular font-medium">{company.phone}</span>
                    </span>
                  </a>
                </li>
              )}

              {whatsappHref && (
                <li>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group border-border hover:border-brand/40 flex items-center gap-4 rounded-xl border p-4 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/12 text-[#128C7E]">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                        className="size-5"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.548 4.142 1.588 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.9 11.9 0 0 0-3.497-8.4" />
                      </svg>
                    </span>
                    <span>
                      <span className="text-muted-foreground block text-sm">
                        WhatsApp
                      </span>
                      <span className="font-medium">Direkt Nachricht senden</span>
                    </span>
                  </a>
                </li>
              )}

              {company.email && (
                <li>
                  <a
                    href={`mailto:${company.email}`}
                    className="group border-border hover:border-brand/40 flex items-center gap-4 rounded-xl border p-4 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                      <Mail className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-muted-foreground block text-sm">
                        E-Mail
                      </span>
                      <span className="block truncate font-medium">
                        {company.email}
                      </span>
                    </span>
                  </a>
                </li>
              )}
            </ul>

            <Button asChild variant="brand" size="2xl" className="mt-6 w-full sm:w-auto">
              <Link href="/kontakt">Zum Kontaktformular</Link>
            </Button>
          </Reveal>

          {/* Öffnungszeiten und Anfahrt */}
          <Reveal
            delay={120}
            className="border-border bg-muted/40 rounded-2xl border p-7 lg:p-8"
          >
            <h3 className="font-display flex items-center gap-2.5 text-xl font-bold">
              <Clock className="text-brand-strong size-5" aria-hidden="true" />
              Öffnungszeiten
            </h3>

            {openingDays.length > 0 ? (
              <dl className="mt-5 space-y-2.5">
                {openingDays.map((day) => (
                  <div
                    key={day.weekday}
                    className="border-border/60 flex justify-between gap-4 border-b pb-2.5 last:border-0"
                  >
                    <dt className="text-muted-foreground text-sm">{day.label}</dt>
                    <dd className="tabular text-right text-sm">
                      {day.closed ? (
                        <span className="text-muted-foreground">geschlossen</span>
                      ) : (
                        day.ranges.map((range) => (
                          <span key={range} className="block whitespace-nowrap">
                            {range}
                          </span>
                        ))
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground mt-5 text-sm">
                {OPENING_HOURS_UNKNOWN_LABEL}
              </p>
            )}

            {company.addressLine && (
              <>
                <h3 className="font-display mt-8 flex items-center gap-2.5 text-xl font-bold">
                  <MapPin className="text-brand-strong size-5" aria-hidden="true" />
                  Anfahrt
                </h3>

                <address className="mt-4 text-sm leading-relaxed not-italic">
                  {company.legalName}
                  <br />
                  {company.street}
                  <br />
                  {company.postalCode} {company.city}
                </address>

                <Button asChild variant="outline" size="xl" className="mt-5">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${company.legalName}, ${company.addressLine}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin data-icon="inline-start" aria-hidden="true" />
                    Route planen
                  </a>
                </Button>
              </>
            )}
          </Reveal>
        </div>
      </Section>
    </>
  );
}
