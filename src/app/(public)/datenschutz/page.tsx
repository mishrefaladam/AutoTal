import type { Metadata } from "next";
import Link from "next/link";

import { getCompany } from "@/modules/company/repository";

/**
 * Datenschutzerklärung (DSGVO).
 *
 * WICHTIG: Der Text beschreibt exakt das, was diese Anwendung tatsächlich
 * tut – nicht mehr und nicht weniger:
 *   - Formulardaten werden NICHT in der Datenbank gespeichert, sondern
 *     ausschließlich per E-Mail über Resend versendet.
 *   - Es gibt kein Tracking, keine Analyse-Tools und keine Marketing-Cookies.
 *     Deshalb ist auch kein Cookie-Banner nötig.
 *   - Schriften werden über next/font zur Bauzeit selbst gehostet; es entsteht
 *     keine Verbindung zu Google.
 *   - Fahrzeugbilder laufen durch die Bildoptimierung von Next.js und werden
 *     vom eigenen Server ausgeliefert.
 *
 * Wird eine dieser Aussagen durch eine Änderung am Code unwahr (etwa durch
 * das Einbinden von Analytics oder das Speichern von Formulardaten), MUSS
 * dieser Text angepasst werden.
 *
 * TODO(rechtliches): Vor dem Livegang juristisch prüfen lassen. Insbesondere
 * die Auftragsverarbeiterverträge (Resend, Hosting) müssen abgeschlossen sein.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Datenschutz",
  description:
    "Wie wir mit Ihren Daten umgehen: Zwecke, Rechtsgrundlagen, " +
    "Speicherdauer und Ihre Rechte nach der DSGVO.",
  alternates: { canonical: "/datenschutz" },
};

export default async function PrivacyPage() {
  const company = await getCompany();
  // Kein erfundener Fallback: Eine ausgedachte Adresse in der
  // Datenschutzerklärung wäre schlimmer als gar keine – Betroffenenrechte
  // würden ins Leere laufen. Ist keine Adresse gepflegt, verweist die Seite
  // auf die Telefonnummer.
  const contactEmail = company.email.trim() || null;

  return (
    <div className="container-page py-14 lg:py-20">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Datenschutzerklärung
        </h1>
        <p className="text-muted-foreground mt-3">
          Wir verarbeiten Ihre Daten nur, soweit das für die Bearbeitung Ihrer
          Anfrage nötig ist – und sagen Ihnen hier genau, was passiert.
        </p>

        <div className="mt-12 space-y-12 text-sm leading-relaxed">
          {/* 1 */}
          <section aria-labelledby="verantwortlicher">
            <h2
              id="verantwortlicher"
              className="font-display text-xl font-bold tracking-tight"
            >
              1. Verantwortlicher
            </h2>
            <address className="text-muted-foreground mt-4 not-italic">
              {company.legalName}
              {company.addressLine && (
                <>
                  <br />
                  {company.street}
                  <br />
                  {company.postalCode} {company.city}
                  <br />
                  {company.country}
                </>
              )}
              <br />
              <br />
              {contactEmail && (
                <>
                  E-Mail:{" "}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-brand-strong hover:underline"
                  >
                    {contactEmail}
                  </a>
                </>
              )}
              {company.phone && (
                <>
                  <br />
                  Telefon:{" "}
                  <a
                    href={`tel:${company.phoneHref}`}
                    className="text-brand-strong tabular hover:underline"
                  >
                    {company.phone}
                  </a>
                </>
              )}
            </address>
          </section>

          {/* 2 */}
          <section aria-labelledby="formulare">
            <h2
              id="formulare"
              className="font-display text-xl font-bold tracking-tight"
            >
              2. Kontakt-, Anfrage- und Ankaufformulare
            </h2>

            <p className="text-muted-foreground mt-4">
              Wenn Sie eines unserer Formulare absenden – Kontakt,
              Fahrzeuganfrage, Probefahrt oder Fahrzeugankauf – verarbeiten wir
              die von Ihnen eingegebenen Daten, um Ihre Anfrage zu beantworten.
            </p>

            <dl className="mt-5 space-y-4">
              <div>
                <dt className="font-semibold">Verarbeitete Daten</dt>
                <dd className="text-muted-foreground mt-1">
                  Name, E-Mail-Adresse, gegebenenfalls Telefonnummer, Ihre
                  Nachricht sowie – je nach Formular – Angaben zum Fahrzeug
                  (Marke, Modell, Erstzulassung, Kilometerstand, Zustand,
                  optional Fahrgestellnummer und Preisvorstellung).
                </dd>
              </div>

              <div>
                <dt className="font-semibold">Zweck</dt>
                <dd className="text-muted-foreground mt-1">
                  Bearbeitung und Beantwortung Ihrer Anfrage, Vereinbarung von
                  Terminen sowie Erstellung eines Ankaufangebots.
                </dd>
              </div>

              <div>
                <dt className="font-semibold">Rechtsgrundlage</dt>
                <dd className="text-muted-foreground mt-1">
                  Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie beim
                  Absenden erteilen, sowie die Durchführung vorvertraglicher
                  Maßnahmen auf Ihre Anfrage hin (Art. 6 Abs. 1 lit. b DSGVO).
                </dd>
              </div>

              <div>
                <dt className="font-semibold">Speicherung</dt>
                <dd className="text-muted-foreground mt-1">
                  Ihre Formulardaten werden <strong>nicht</strong> in einer
                  Datenbank dieser Website gespeichert. Sie werden ausschließlich
                  als E-Mail an unser Postfach übermittelt. Dort bewahren wir
                  sie so lange auf, wie es zur Bearbeitung Ihres Anliegens und
                  zur Erfüllung gesetzlicher Aufbewahrungspflichten erforderlich
                  ist.
                </dd>
              </div>

              <div>
                <dt className="font-semibold">Empfänger</dt>
                <dd className="text-muted-foreground mt-1">
                  Für den Versand nutzen wir den Dienstleister Resend
                  (Resend, Inc.) als Auftragsverarbeiter. Dabei kann eine
                  Übermittlung in die USA stattfinden, abgesichert über die
                  Standardvertragsklauseln der Europäischen Kommission.
                </dd>
              </div>
            </dl>
          </section>

          {/* 3 */}
          <section aria-labelledby="serverlogs">
            <h2
              id="serverlogs"
              className="font-display text-xl font-bold tracking-tight"
            >
              3. Server-Protokolle
            </h2>
            <p className="text-muted-foreground mt-4">
              Beim Aufruf dieser Website verarbeitet unser Hosting-Anbieter
              technisch notwendige Zugriffsdaten wie IP-Adresse, Zeitpunkt,
              aufgerufene Seite und Browsertyp. Das ist für den sicheren Betrieb
              der Website erforderlich (Art. 6 Abs. 1 lit. f DSGVO – berechtigtes
              Interesse am störungsfreien Betrieb und an der Abwehr von
              Missbrauch). Diese Daten werden nicht mit anderen Datenquellen
              zusammengeführt.
            </p>
            <p className="text-muted-foreground mt-3">
              Zum Schutz vor automatisiertem Missbrauch unserer Formulare
              speichern wir vorübergehend einen Zähler pro IP-Adresse. Dieser
              wird nach kurzer Zeit automatisch gelöscht.
            </p>
          </section>

          {/* 4 */}
          <section aria-labelledby="cookies">
            <h2
              id="cookies"
              className="font-display text-xl font-bold tracking-tight"
            >
              4. Cookies
            </h2>
            <p className="text-muted-foreground mt-4">
              Diese Website setzt <strong>keine</strong> Cookies zu Analyse-,
              Tracking- oder Marketingzwecken ein. Es kommen weder Google
              Analytics noch Social-Media-Pixel zum Einsatz. Ein Cookie wird
              ausschließlich im internen Verwaltungsbereich gesetzt, um
              angemeldete Mitarbeiterinnen und Mitarbeiter zu authentifizieren –
              für Besucherinnen und Besucher der öffentlichen Website ist das
              ohne Bedeutung.
            </p>
          </section>

          {/* 5 */}
          <section aria-labelledby="drittanbieter">
            <h2
              id="drittanbieter"
              className="font-display text-xl font-bold tracking-tight"
            >
              5. Schriften, Bilder und externe Links
            </h2>
            <p className="text-muted-foreground mt-4">
              Schriftarten werden von unserem eigenen Server ausgeliefert. Es
              entsteht dabei <strong>keine</strong> Verbindung zu Google Fonts
              oder einem anderen externen Anbieter.
            </p>
            <p className="text-muted-foreground mt-3">
              Fahrzeugbilder werden über unseren Server optimiert ausgeliefert.
              Ihr Browser baut dafür keine Verbindung zu Dritten auf.
            </p>
            <p className="text-muted-foreground mt-3">
              Unsere Website enthält Verweise auf externe Dienste – etwa
              WhatsApp, Google Maps und unsere Social-Media-Profile. Diese
              Verbindungen entstehen erst, wenn Sie einen solchen Link aktiv
              anklicken. Ab diesem Zeitpunkt gelten die Datenschutzbestimmungen
              des jeweiligen Anbieters.
            </p>
          </section>

          {/* 6 */}
          <section aria-labelledby="rechte">
            <h2
              id="rechte"
              className="font-display text-xl font-bold tracking-tight"
            >
              6. Ihre Rechte
            </h2>
            <p className="text-muted-foreground mt-4">
              Ihnen stehen gegenüber uns folgende Rechte zu:
            </p>
            <ul className="text-muted-foreground mt-3 space-y-1.5">
              <li>· Auskunft über die zu Ihnen gespeicherten Daten (Art. 15 DSGVO)</li>
              <li>· Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
              <li>· Löschung (Art. 17 DSGVO)</li>
              <li>· Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>· Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>· Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
              <li>
                · Widerruf einer erteilten Einwilligung mit Wirkung für die
                Zukunft (Art. 7 Abs. 3 DSGVO)
              </li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Wenden Sie sich dafür einfach an{" "}
              {contactEmail ? (
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-brand-strong hover:underline"
                >
                  {contactEmail}
                </a>
              ) : (
                <a
                  href={`tel:${company.phoneHref}`}
                  className="text-brand-strong tabular hover:underline"
                >
                  {company.phone}
                </a>
              )}
              .
            </p>
          </section>

          {/* 7 */}
          <section aria-labelledby="beschwerde">
            <h2
              id="beschwerde"
              className="font-display text-xl font-bold tracking-tight"
            >
              7. Beschwerderecht
            </h2>
            <p className="text-muted-foreground mt-4">
              Wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer Daten gegen
              die DSGVO verstößt, können Sie sich bei der Aufsichtsbehörde
              beschweren:
            </p>
            <address className="text-muted-foreground mt-3 not-italic">
              Österreichische Datenschutzbehörde
              <br />
              Barichgasse 40–42, 1030 Wien
              <br />
              <a
                href="https://www.dsb.gv.at"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-strong hover:underline"
              >
                www.dsb.gv.at
              </a>
            </address>
          </section>
        </div>

        <p className="text-muted-foreground mt-12 text-sm">
          Angaben zum Unternehmen finden Sie im{" "}
          <Link href="/impressum" className="text-brand-strong hover:underline">
            Impressum
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
