import type { CompanyDto } from "./types";

/**
 * Strukturierte Daten (schema.org) für die Suchmaschinen.
 *
 * Erzeugt ein `AutoDealer`-Objekt – das ist ein Untertyp von `LocalBusiness`,
 * sagt also gleichzeitig "lokales Unternehmen" und "Fahrzeughändler". Damit
 * versteht Google Standort, Öffnungszeiten und Kontaktwege.
 *
 * GRUNDREGEL: Es wird ausschließlich abgebildet, was in den CompanySettings
 * tatsächlich gepflegt ist. Fehlt ein Wert, entfällt das Feld ersatzlos –
 * kein Platzhalter, keine geratene Angabe. Falsche strukturierte Daten sind
 * schlechter als gar keine: Google straft sie ab, und bei Öffnungszeiten
 * stehen Kunden sonst vor verschlossener Tür.
 *
 * BEWUSST NICHT enthalten: aggregateRating, review, priceRange, brand.
 * Für all das gibt es keine belastbare Grundlage; erfundene Bewertungen
 * verstoßen zudem gegen die Richtlinien für strukturierte Daten.
 *
 * Frei von Server-Abhängigkeiten und ohne Seiteneffekte, damit die Ausgabe
 * direkt testbar ist.
 */

/** ISO-Wochentag (1 = Montag) auf den schema.org-Namen. */
const SCHEMA_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type OpeningHoursSpecification = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
};

export type AutoDealerSchema = {
  "@context": "https://schema.org";
  "@type": "AutoDealer";
  name: string;
  url: string;
  [key: string]: unknown;
};

/**
 * Öffnungszeiten im schema.org-Format.
 *
 * Geschlossene Tage werden weggelassen statt mit "00:00–00:00" behauptet –
 * schema.org kennt Abwesenheit als gültige Aussage. Unvollständige Slots
 * (nur Beginn oder nur Ende) fallen ebenfalls heraus.
 */
export function buildOpeningHoursSpecification(
  company: CompanyDto,
): OpeningHoursSpecification[] {
  return company.openingHours
    .filter((slot) => !slot.closed && slot.opensAt && slot.closesAt)
    .filter((slot) => slot.weekday >= 1 && slot.weekday <= 7)
    .sort((a, b) => a.weekday - b.weekday || a.position - b.position)
    .map((slot) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: `https://schema.org/${SCHEMA_WEEKDAYS[slot.weekday - 1]}`,
      opens: slot.opensAt as string,
      closes: slot.closesAt as string,
    }));
}

/**
 * Baut das AutoDealer-Objekt aus den gepflegten Unternehmensdaten.
 *
 * `siteUrl` ist die kanonische Basis-Adresse (ohne Schrägstrich am Ende);
 * sie dient zugleich als `@id`, damit Google das Unternehmen über mehrere
 * Seiten hinweg als dieselbe Entität erkennt.
 */
export function buildAutoDealerSchema(
  company: CompanyDto,
  siteUrl: string,
): AutoDealerSchema {
  const base = siteUrl.replace(/\/$/, "");

  const schema: AutoDealerSchema = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": `${base}#autodealer`,
    // legalName ist der Firmenbuchwortlaut, displayName die Marke. Für die
    // Anzeige zählt die Marke; der Rechtsname kommt zusätzlich als legalName.
    name: company.displayName || company.legalName,
    url: base,
  };

  if (company.legalName && company.legalName !== schema.name) {
    schema["legalName"] = company.legalName;
  }

  if (company.tagline) schema["description"] = company.tagline;
  if (company.phone) schema["telephone"] = company.phone;
  if (company.email) schema["email"] = company.email;

  // Adresse nur, wenn sie auch als Anschrift taugt – eine PostalAddress ohne
  // Straße oder Ort führt Kartendienste in die Irre.
  if (company.street && company.city) {
    const address: Record<string, string> = {
      "@type": "PostalAddress",
      streetAddress: company.street,
      addressLocality: company.city,
      addressCountry: "AT",
    };
    if (company.postalCode) address["postalCode"] = company.postalCode;
    schema["address"] = address;
  }

  if (company.latitude !== null && company.longitude !== null) {
    schema["geo"] = {
      "@type": "GeoCoordinates",
      latitude: company.latitude,
      longitude: company.longitude,
    };
  }

  const openingHours = buildOpeningHoursSpecification(company);
  if (openingHours.length > 0) {
    schema["openingHoursSpecification"] = openingHours;
  }

  // sameAs verknüpft die Website mit den offiziellen Profilen desselben
  // Unternehmens – das ist genau der Zweck der Social-Links.
  const sameAs = company.socialLinks.map((link) => link.url).filter(Boolean);
  if (sameAs.length > 0) schema["sameAs"] = sameAs;

  return schema;
}

/**
 * Serialisiert das Schema für die Ausgabe in einem `<script>`-Element.
 *
 * `<` wird als Unicode-Escape geschrieben. Ohne das könnte ein im Admin
 * gepflegter Text mit "</script>" das Skriptelement vorzeitig beenden und
 * beliebiges Markup einschleusen. Der JSON-Wert bleibt dabei identisch –
 * "<" ist im JSON-Standard dasselbe Zeichen.
 */
export function serializeJsonLd(schema: unknown): string {
  return JSON.stringify(schema)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    // U+2028/U+2029 sind in JSON erlaubt, brechen aber JavaScript-Literale.
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
