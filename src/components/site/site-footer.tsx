import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { SocialIcon, socialLabel } from "@/components/site/social-icon";
import { LEGAL_NAV, MAIN_NAV } from "@/lib/navigation";
import { groupOpeningHours } from "@/modules/company/opening-hours";
import type { CompanyDto } from "@/modules/company/types";

/**
 * Fußzeile mit Kontaktdaten, Öffnungszeiten und Rechtsverweisen.
 * Alle Angaben stammen aus den im Admin gepflegten Unternehmensdaten.
 */
export function SiteFooter({ company }: { company: CompanyDto }) {
  const openingDays = groupOpeningHours(company.openingHours);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-ink-foreground mt-auto">
      <div className="container-page py-14 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Marke und Kurzbeschreibung */}
          <div className="lg:pr-6">
            <Logo name={company.displayName} className="text-ink-foreground" />

            {company.tagline && (
              <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                {company.tagline}
              </p>
            )}

            {company.socialLinks.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {company.socialLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="border-ink-border text-ink-muted hover:text-ink-foreground flex size-10 items-center justify-center rounded-lg border transition-colors hover:bg-white/8 focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
                      aria-label={`${socialLabel(link.platform, link.label)} (öffnet in neuem Tab)`}
                    >
                      <SocialIcon platform={link.platform} className="size-[1.125rem]" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Navigation */}
          <nav aria-labelledby="footer-nav-heading">
            <h2
              id="footer-nav-heading"
              className="text-ink-foreground text-sm font-semibold"
            >
              Navigation
            </h2>
            <ul className="mt-4 space-y-2.5">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-ink-muted hover:text-ink-foreground rounded text-sm transition-colors focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Kontakt */}
          <section aria-labelledby="footer-contact-heading">
            <h2
              id="footer-contact-heading"
              className="text-ink-foreground text-sm font-semibold"
            >
              Kontakt
            </h2>

            <address className="mt-4 space-y-3 text-sm not-italic">
              {company.addressLine && (
                <p className="text-ink-muted flex gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    {company.street}
                    <br />
                    {company.postalCode} {company.city}
                  </span>
                </p>
              )}

              {company.phone && (
                <p className="flex gap-2.5">
                  <Phone
                    className="text-ink-muted mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <a
                    href={`tel:${company.phoneHref}`}
                    className="text-ink-muted hover:text-ink-foreground tabular rounded transition-colors focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
                  >
                    {company.phone}
                  </a>
                </p>
              )}

              {company.email && (
                <p className="flex gap-2.5">
                  <Mail
                    className="text-ink-muted mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <a
                    href={`mailto:${company.email}`}
                    className="text-ink-muted hover:text-ink-foreground rounded break-all transition-colors focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
                  >
                    {company.email}
                  </a>
                </p>
              )}
            </address>
          </section>

          {/* Öffnungszeiten */}
          <section aria-labelledby="footer-hours-heading">
            <h2
              id="footer-hours-heading"
              className="text-ink-foreground flex items-center gap-2 text-sm font-semibold"
            >
              <Clock className="size-4" aria-hidden="true" />
              Öffnungszeiten
            </h2>

            <dl className="mt-4 space-y-1.5 text-sm">
              {openingDays.map((day) => (
                <div key={day.weekday} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{day.label}</dt>
                  <dd className="text-ink-foreground tabular text-right">
                    {day.closed ? (
                      <span className="text-ink-muted">geschlossen</span>
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
          </section>
        </div>

        <hr className="border-ink-border mt-12 mb-6" />

        <div className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-muted">
            © {year} {company.legalName || company.displayName}
          </p>

          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-ink-muted hover:text-ink-foreground rounded transition-colors focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
