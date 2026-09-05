import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone, User } from "lucide-react";

import { ContactForm } from "@/components/forms/contact-form";
import { Section } from "@/components/site/section";
import { SocialIcon, socialLabel } from "@/components/site/social-icon";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl, generalWhatsAppMessage } from "@/lib/whatsapp";
import {
  OPENING_HOURS_UNKNOWN_LABEL,
  getOpeningStatus,
  groupOpeningHours,
} from "@/modules/company/opening-hours";
import { getCompany } from "@/modules/company/repository";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kontakt",
  description:
    "So erreichen Sie uns: Telefon, WhatsApp, E-Mail und Kontaktformular. " +
    "Adresse, Anfahrt und Öffnungszeiten im Überblick.",
  alternates: { canonical: "/kontakt" },
};

export default async function ContactPage() {
  const company = await getCompany();
  const openingDays = groupOpeningHours(company.openingHours);
  const openingStatus = getOpeningStatus(company.openingHours);

  const whatsappHref = buildWhatsAppUrl(
    company.whatsappNumber,
    generalWhatsAppMessage(company.displayName),
  );

  const mapsHref = company.addressLine
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${company.legalName}, ${company.addressLine}`,
      )}`
    : null;

  // Ohne einen einzigen Kanal wäre die Karte nur eine Überschrift über einer
  // leeren Liste – das sieht wie ein Fehler aus, nicht wie ein leerer Zustand.
  const hasDirectContact = Boolean(
    company.phone ||
      company.email ||
      company.addressLine ||
      company.contactPersonName ||
      whatsappHref,
  );

  return (
    <Section aria-labelledby="kontakt">
      <div className="mb-10 max-w-2xl lg:mb-14">
        <p className="eyebrow mb-3">Kontakt</p>
        <h1
          id="kontakt"
          className="font-display text-4xl font-bold tracking-tight text-balance"
        >
          Wir sind für Sie da
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed text-pretty">
          Am schnellsten geht es telefonisch. Wenn Sie lieber schreiben,
          nutzen Sie WhatsApp oder das Formular – wir antworten in der Regel
          noch am selben Werktag.
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
        {/* Formular */}
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Nachricht schreiben
          </h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>

        {/* Direktkontakt */}
        <aside className="space-y-6">
          {hasDirectContact && (
            <div className="border-border bg-card rounded-xl border p-6">
              <h2 className="font-display text-lg font-bold">Direkt erreichen</h2>

              <ul className="mt-5 space-y-4 text-sm">
                {company.phone && (
                  <li className="flex gap-3">
                    <Phone
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-muted-foreground">Telefon</p>
                      <a
                        href={`tel:${company.phoneHref}`}
                        className="tabular font-medium hover:underline"
                      >
                        {company.phone}
                      </a>
                    </div>
                  </li>
                )}

                {company.email && (
                  <li className="flex gap-3">
                    <Mail
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-muted-foreground">E-Mail</p>
                      <a
                        href={`mailto:${company.email}`}
                        className="font-medium break-all hover:underline"
                      >
                        {company.email}
                      </a>
                    </div>
                  </li>
                )}

                {company.addressLine && (
                  <li className="flex gap-3">
                    <MapPin
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-muted-foreground">Adresse</p>
                      <address className="font-medium not-italic">
                        {company.street}
                        <br />
                        {company.postalCode} {company.city}
                      </address>
                    </div>
                  </li>
                )}

                {company.contactPersonName && (
                  <li className="flex gap-3">
                    <User
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-muted-foreground">Ansprechpartner</p>
                      <p className="font-medium">{company.contactPersonName}</p>
                      {company.contactPersonRole && (
                        <p className="text-muted-foreground text-xs">
                          {company.contactPersonRole}
                        </p>
                      )}
                    </div>
                  </li>
                )}
              </ul>

              <div className="mt-6 space-y-3">
                {whatsappHref && (
                  <Button
                    asChild
                    size="xl"
                    className="w-full bg-[#25D366] text-white hover:bg-[#1eb757] focus-visible:ring-[#25D366]/40"
                  >
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      Über WhatsApp schreiben
                    </a>
                  </Button>
                )}

                {mapsHref && (
                  <Button asChild variant="outline" size="xl" className="w-full">
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                      <MapPin data-icon="inline-start" aria-hidden="true" />
                      Route planen
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Öffnungszeiten */}
          <div className="border-border bg-card rounded-xl border p-6">
            <h2 className="font-display flex items-center gap-2.5 text-lg font-bold">
              <Clock className="text-brand-strong size-4.5" aria-hidden="true" />
              Öffnungszeiten
            </h2>

            {company.openingHours.length > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full",
                    openingStatus.isOpen ? "bg-success" : "bg-muted-foreground",
                  )}
                />
                {openingStatus.label}
              </p>
            )}

            {openingDays.length > 0 ? (
              <dl className="mt-4 space-y-2.5">
                {openingDays.map((day) => (
                  <div
                    key={day.weekday}
                    className="border-border/60 flex justify-between gap-4 border-b pb-2.5 text-sm last:border-0 last:pb-0"
                  >
                    <dt className="text-muted-foreground">{day.label}</dt>
                    <dd className="tabular text-right">
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
              <p className="text-muted-foreground mt-4 text-sm">
                {OPENING_HOURS_UNKNOWN_LABEL}
              </p>
            )}
          </div>

          {/* Social */}
          {company.socialLinks.length > 0 && (
            <div className="border-border bg-card rounded-xl border p-6">
              <h2 className="font-display text-lg font-bold">Folgen Sie uns</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {company.socialLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <SocialIcon platform={link.platform} className="size-4" />
                      {socialLabel(link.platform, link.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Section>
  );
}
