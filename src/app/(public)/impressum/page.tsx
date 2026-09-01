import type { Metadata } from "next";
import Link from "next/link";

import { getCompany } from "@/modules/company/repository";

/**
 * Impressum / Offenlegung.
 *
 * Pflichtangaben nach § 5 ECG, § 63 GewO und § 25 MedienG. Alle Angaben
 * stammen aus den unter /admin/unternehmen gepflegten Daten.
 *
 * ACHTUNG (Rechtliches): Diese Seite bildet die üblichen Pflichtangaben ab,
 * ersetzt aber keine rechtliche Prüfung. Vor dem Livegang bitte durch die
 * Wirtschaftskammer oder eine Rechtsanwältin/einen Rechtsanwalt gegenprüfen
 * lassen – insbesondere Gewerbewortlaut, Aufsichtsbehörde, Kammer­zugehörigkeit
 * und die anwendbaren Rechtsvorschriften.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Impressum",
  description: "Impressum und Offenlegung gemäß § 5 ECG und § 25 MedienG.",
  alternates: { canonical: "/impressum" },
  robots: { index: true, follow: true },
};

export default async function ImprintPage() {
  const company = await getCompany();

  const entries: { label: string; value: string | null }[] = [
    { label: "Unternehmen", value: company.legalName },
    {
      label: "Anschrift",
      value: company.addressLine
        ? `${company.street}, ${company.postalCode} ${company.city}, ${company.country}`
        : null,
    },
    { label: "Telefon", value: company.phone },
    { label: "E-Mail", value: company.email },
    { label: "UID-Nummer", value: company.vatId },
    { label: "Firmenbuchnummer", value: company.commercialRegisterNumber },
    { label: "Firmenbuchgericht", value: company.commercialRegisterCourt },
  ].filter((entry) => entry.value);

  return (
    <div className="container-page py-14 lg:py-20">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Impressum
        </h1>
        <p className="text-muted-foreground mt-3">
          Offenlegung gemäß § 5 E-Commerce-Gesetz und § 25 Mediengesetz.
        </p>

        <section aria-labelledby="medieninhaber" className="mt-12">
          <h2
            id="medieninhaber"
            className="font-display text-xl font-bold tracking-tight"
          >
            Medieninhaber und Diensteanbieter
          </h2>

          <dl className="border-border mt-5 border-t">
            {entries.map((entry) => (
              <div
                key={entry.label}
                className="border-border grid gap-1 border-b py-4 sm:grid-cols-[12rem_1fr] sm:gap-6"
              >
                <dt className="text-muted-foreground text-sm">{entry.label}</dt>
                <dd className="text-sm font-medium">
                  {entry.label === "E-Mail" ? (
                    <a href={`mailto:${entry.value}`} className="hover:underline">
                      {entry.value}
                    </a>
                  ) : entry.label === "Telefon" ? (
                    <a
                      href={`tel:${company.phoneHref}`}
                      className="tabular hover:underline"
                    >
                      {entry.value}
                    </a>
                  ) : (
                    entry.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="gewerbe" className="mt-12 space-y-4 text-sm leading-relaxed">
          <h2
            id="gewerbe"
            className="font-display text-xl font-bold tracking-tight"
          >
            Unternehmensgegenstand und Behörden
          </h2>

          {/*
            TODO(rechtliches): Die folgenden Angaben sind vom Autohaus zu
            bestätigen bzw. zu ergänzen:
              - exakter Gewerbewortlaut laut Gewerberegister
              - zuständige Bezirkshauptmannschaft / Magistrat
              - Kammerzugehörigkeit und Fachgruppe
            Bis dahin bleibt dieser Abschnitt bewusst allgemein gehalten und
            wird NICHT als geprüft ausgegeben.
          */}
          <dl className="space-y-4">
            <div>
              <dt className="text-muted-foreground">Unternehmensgegenstand</dt>
              <dd className="mt-0.5 font-medium">
                Handel mit Kraftfahrzeugen
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">Kammerzugehörigkeit</dt>
              <dd className="mt-0.5 font-medium">
                Wirtschaftskammer Österreich, Fachgruppe Fahrzeughandel
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">Anwendbare Rechtsvorschrift</dt>
              <dd className="mt-0.5 font-medium">
                Gewerbeordnung (GewO) –{" "}
                <a
                  href="https://www.ris.bka.gv.at"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  ris.bka.gv.at
                </a>
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">Aufsichtsbehörde</dt>
              <dd className="mt-0.5 font-medium">
                Bezirkshauptmannschaft bzw. Magistrat am Unternehmenssitz
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="streitbeilegung"
          className="mt-12 space-y-4 text-sm leading-relaxed"
        >
          <h2
            id="streitbeilegung"
            className="font-display text-xl font-bold tracking-tight"
          >
            Online-Streitbeilegung
          </h2>
          <p className="text-muted-foreground">
            Verbraucher haben die Möglichkeit, Beschwerden an die
            Online-Streitbeilegungsplattform der Europäischen Kommission zu
            richten:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              ec.europa.eu/consumers/odr
            </a>
            . Sie können sich mit Beschwerden auch an die oben angeführte
            E-Mail-Adresse wenden.
          </p>
        </section>

        <section
          aria-labelledby="haftung"
          className="mt-12 space-y-4 text-sm leading-relaxed"
        >
          <h2
            id="haftung"
            className="font-display text-xl font-bold tracking-tight"
          >
            Haftung für Inhalte und Links
          </h2>
          <p className="text-muted-foreground">
            Die Inhalte dieser Website werden mit Sorgfalt erstellt. Für
            Angaben zu Fahrzeugen – insbesondere Ausstattung, Kilometerstand
            und technische Daten – behalten wir uns Irrtümer und
            Zwischenverkauf vor. Verbindlich sind ausschließlich die Angaben im
            Kaufvertrag.
          </p>
          <p className="text-muted-foreground">
            Für Inhalte externer Websites, auf die wir verlinken, sind
            ausschließlich deren Betreiber verantwortlich. Zum Zeitpunkt der
            Verlinkung waren keine Rechtsverstöße erkennbar.
          </p>
        </section>

        <section
          aria-labelledby="urheberrecht"
          className="mt-12 space-y-4 text-sm leading-relaxed"
        >
          <h2
            id="urheberrecht"
            className="font-display text-xl font-bold tracking-tight"
          >
            Urheberrecht
          </h2>
          <p className="text-muted-foreground">
            Die auf dieser Website veröffentlichten Inhalte und Bilder sind
            urheberrechtlich geschützt. Eine Verwendung außerhalb der Grenzen
            des Urheberrechts bedarf unserer vorherigen schriftlichen
            Zustimmung.
          </p>
        </section>

        <p className="text-muted-foreground mt-12 text-sm">
          Informationen zur Verarbeitung Ihrer Daten finden Sie in unserer{" "}
          <Link href="/datenschutz" className="text-brand hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
