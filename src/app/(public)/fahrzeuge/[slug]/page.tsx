import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, Phone } from "lucide-react";

import { FinanceCalculator } from "@/components/financing/finance-calculator";
import { Section, SectionHeader } from "@/components/site/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleActions } from "@/components/vehicles/vehicle-actions";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { VehicleGallery } from "@/components/vehicles/vehicle-gallery";
import { siteUrl } from "@/lib/env";
import { formatEuro, formatKilometers, formatNumber, formatPower } from "@/lib/money";
import { buildWhatsAppUrl, vehicleWhatsAppMessage } from "@/lib/whatsapp";
import { getCompany } from "@/modules/company/repository";
import { getFinanceConfig } from "@/modules/financing/repository";
import {
  BODY_TYPE_LABELS,
  CONDITION_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  formatDate,
  formatRegistration,
} from "@/modules/vehicles/labels";
import {
  getVehicleBySlug,
  listActiveVehicleSlugs,
  listSimilarVehicles,
} from "@/modules/vehicles/repository";
import type { VehicleDetail } from "@/modules/vehicles/types";

/**
 * Fahrzeugdetailseite (US-05).
 *
 * Enthält alle geforderten Bestandteile: Bildergalerie, Preis, Fahrzeugdaten,
 * Ausstattung, Beschreibung, Finanzierungsrechner sowie die Kontaktwege
 * Anfrage, Probefahrt und WhatsApp.
 *
 * Die Seiten werden zur Bauzeit vorgeneriert und alle 10 Minuten erneuert –
 * der Besucher bekommt statisches HTML aus dem Cache (US-30).
 */

export const revalidate = 600;
/** Fahrzeuge, die nach dem Build dazukommen, werden bei Bedarf nachgerendert. */
export const dynamicParams = true;

export async function generateStaticParams() {
  const vehicles = await listActiveVehicleSlugs();
  return vehicles.map((vehicle) => ({ slug: vehicle.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/fahrzeuge/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await getVehicleBySlug(slug);

  if (!vehicle) {
    return { title: "Fahrzeug nicht gefunden", robots: { index: false } };
  }

  const description =
    `${vehicle.title} · ${formatEuro(vehicle.priceCents)} · ` +
    `${formatKilometers(vehicle.mileageKm)} · ` +
    `EZ ${formatRegistration(vehicle.firstRegistration)} · ` +
    `${FUEL_LABELS[vehicle.fuel]} · ${TRANSMISSION_LABELS[vehicle.transmission]}`;

  return {
    title: vehicle.title,
    description,
    alternates: { canonical: `/fahrzeuge/${vehicle.slug}` },
    openGraph: {
      type: "website",
      title: vehicle.title,
      description,
      url: `/fahrzeuge/${vehicle.slug}`,
      images: vehicle.primaryImage
        ? [{ url: vehicle.primaryImage.url, alt: vehicle.primaryImage.alt }]
        : undefined,
    },
  };
}

export default async function VehicleDetailPage({
  params,
}: PageProps<"/fahrzeuge/[slug]">) {
  const { slug } = await params;
  const vehicle = await getVehicleBySlug(slug);

  if (!vehicle) notFound();

  const [company, financeConfig, similar] = await Promise.all([
    getCompany(),
    getFinanceConfig(),
    listSimilarVehicles(vehicle, 3),
  ]);

  const whatsappHref = buildWhatsAppUrl(
    company.whatsappNumber,
    vehicleWhatsAppMessage(vehicle, siteUrl()),
  );

  return (
    <>
      <div className="container-page py-6 lg:py-10">
        {/* Brotkrumen */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                Start
              </Link>
            </li>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <li>
              <Link
                href="/fahrzeuge"
                className="hover:text-foreground transition-colors"
              >
                Fahrzeuge
              </Link>
            </li>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <li className="text-foreground font-medium" aria-current="page">
              {vehicle.title}
            </li>
          </ol>
        </nav>

        <div className="lg:grid lg:grid-cols-[1fr_23rem] lg:items-start lg:gap-10 xl:grid-cols-[1fr_25rem]">
          {/* --- Hauptspalte --------------------------------------------- */}
          <div className="min-w-0">
            <header className="mb-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {CONDITION_LABELS[vehicle.condition]}
                </Badge>
                <Badge variant="secondary">
                  {BODY_TYPE_LABELS[vehicle.bodyType]}
                </Badge>
                {vehicle.vatDeductible && (
                  <Badge variant="secondary">Vorsteuerabzugsberechtigt</Badge>
                )}
              </div>

              <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                <span className="text-muted-foreground block text-lg font-semibold">
                  {vehicle.make}
                </span>
                {vehicle.model}
                {vehicle.variant && (
                  <span className="text-muted-foreground font-medium">
                    {" "}
                    {vehicle.variant}
                  </span>
                )}
              </h1>
            </header>

            <VehicleGallery images={vehicle.images} title={vehicle.title} />

            {/* Preisblock – auf Mobil unter der Galerie, am Desktop rechts */}
            <div className="border-border bg-card mt-6 rounded-xl border p-5 lg:hidden">
              <PriceBlock vehicle={vehicle} />
              <div className="mt-5 space-y-3">
                <VehicleActions
                  vehicleSlug={vehicle.slug}
                  vehicleTitle={vehicle.title}
                />
                <ContactButtons
                  phone={company.phone}
                  phoneHref={company.phoneHref}
                  whatsappHref={whatsappHref}
                />
              </div>
            </div>

            {/* Beschreibung */}
            {vehicle.description && (
              <section aria-labelledby="beschreibung" className="mt-12">
                <h2
                  id="beschreibung"
                  className="font-display text-2xl font-bold tracking-tight"
                >
                  Beschreibung
                </h2>
                <div className="mt-4 space-y-4 leading-relaxed text-pretty">
                  {vehicle.description
                    .split(/\n{2,}/)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              </section>
            )}

            {/* Fahrzeugdaten */}
            <section aria-labelledby="fahrzeugdaten" className="mt-12">
              <h2
                id="fahrzeugdaten"
                className="font-display text-2xl font-bold tracking-tight"
              >
                Fahrzeugdaten
              </h2>

              <dl className="border-border mt-5 grid gap-x-8 border-t sm:grid-cols-2">
                {buildSpecRows(vehicle).map((row) => (
                  <div
                    key={row.label}
                    className="border-border flex justify-between gap-4 border-b py-3.5"
                  >
                    <dt className="text-muted-foreground text-sm">{row.label}</dt>
                    <dd className="tabular text-right text-sm font-medium">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Ausstattung */}
            {vehicle.features.length > 0 && (
              <section aria-labelledby="ausstattung" className="mt-12">
                <h2
                  id="ausstattung"
                  className="font-display text-2xl font-bold tracking-tight"
                >
                  Ausstattung
                </h2>

                <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                  {vehicle.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className="text-brand mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Finanzierungsrechner */}
            <section aria-labelledby="finanzierung" className="mt-12">
              <h2
                id="finanzierung"
                className="font-display text-2xl font-bold tracking-tight"
              >
                Finanzierung
              </h2>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                Rechnen Sie sich die Rate für dieses Fahrzeug selbst aus. Alle
                Werte sind frei einstellbar – das Ergebnis ist unverbindlich.
              </p>

              <div className="border-border mt-6 rounded-xl border p-5 sm:p-7">
                <FinanceCalculator
                  config={financeConfig}
                  initialPriceCents={vehicle.priceCents}
                  priceEditable={false}
                />
              </div>

              <Button asChild variant="outline" size="xl" className="mt-5">
                <Link href="/finanzierung">Finanzierungspartner ansehen</Link>
              </Button>
            </section>
          </div>

          {/* --- Seitenspalte (Desktop) ---------------------------------- */}
          <aside className="hidden lg:block">
            <div className="border-border bg-card sticky top-24 rounded-xl border p-6 shadow-[var(--shadow-card)]">
              <PriceBlock vehicle={vehicle} />

              <div className="mt-6 space-y-3">
                <VehicleActions
                  vehicleSlug={vehicle.slug}
                  vehicleTitle={vehicle.title}
                />
                <ContactButtons
                  phone={company.phone}
                  phoneHref={company.phoneHref}
                  whatsappHref={whatsappHref}
                />
              </div>

              <dl className="border-border mt-6 space-y-2.5 border-t pt-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Kilometerstand</dt>
                  <dd className="tabular font-medium">
                    {formatKilometers(vehicle.mileageKm)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Erstzulassung</dt>
                  <dd className="tabular font-medium">
                    {formatRegistration(vehicle.firstRegistration)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Kraftstoff</dt>
                  <dd className="font-medium">{FUEL_LABELS[vehicle.fuel]}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Getriebe</dt>
                  <dd className="font-medium">
                    {TRANSMISSION_LABELS[vehicle.transmission]}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Fahrzeug-Nr.</dt>
                  <dd className="tabular font-medium">{vehicle.externalId}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {/* Ähnliche Fahrzeuge */}
      {similar.length > 0 && (
        <Section tone="muted" aria-labelledby="aehnliche-fahrzeuge">
          <SectionHeader
            headingId="aehnliche-fahrzeuge"
            title="Das könnte Sie auch interessieren"
            action={
              <Button asChild variant="outline" size="xl">
                <Link href="/fahrzeuge">Alle Fahrzeuge</Link>
              </Button>
            }
          />

          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((item) => (
              <li key={item.id} className="flex">
                <VehicleCard vehicle={item} className="w-full" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <VehicleStructuredData vehicle={vehicle} companyName={company.legalName} />
    </>
  );
}

// --- Bausteine -------------------------------------------------------------

function PriceBlock({ vehicle }: { vehicle: VehicleDetail }) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">Preis</p>
      <p className="font-display tabular mt-0.5 text-3xl font-extrabold tracking-tight">
        {formatEuro(vehicle.priceCents)}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {vehicle.vatDeductible
          ? "Nettopreis, zzgl. 20 % USt. – vorsteuerabzugsberechtigt"
          : "Endpreis inkl. USt. · keine Nebenkosten"}
      </p>
    </div>
  );
}

function ContactButtons({
  phone,
  phoneHref,
  whatsappHref,
}: {
  phone: string;
  phoneHref: string;
  whatsappHref: string | null;
}) {
  return (
    <>
      {whatsappHref && (
        <Button
          asChild
          size="2xl"
          className="w-full bg-[#25D366] text-white hover:bg-[#1eb757] focus-visible:ring-[#25D366]/40"
        >
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              data-icon="inline-start"
              className="size-5"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.548 4.142 1.588 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.9 11.9 0 0 0-3.497-8.4" />
            </svg>
            Über WhatsApp fragen
          </a>
        </Button>
      )}

      {phoneHref && (
        <Button asChild variant="ghost" size="xl" className="w-full">
          <a href={`tel:${phoneHref}`}>
            <Phone data-icon="inline-start" aria-hidden="true" />
            <span className="tabular">{phone}</span>
          </a>
        </Button>
      )}
    </>
  );
}

/** Alle Fahrzeugdaten in Anzeigereihenfolge; leere Felder entfallen. */
function buildSpecRows(vehicle: VehicleDetail): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: "Marke", value: vehicle.make },
    { label: "Modell", value: vehicle.model },
    { label: "Variante", value: vehicle.variant },
    { label: "Fahrzeugart", value: CONDITION_LABELS[vehicle.condition] },
    { label: "Aufbau", value: BODY_TYPE_LABELS[vehicle.bodyType] },
    { label: "Preis", value: formatEuro(vehicle.priceCents) },
    { label: "Kilometerstand", value: formatKilometers(vehicle.mileageKm) },
    {
      label: "Erstzulassung",
      value: formatRegistration(vehicle.firstRegistration),
    },
    { label: "Kraftstoff", value: FUEL_LABELS[vehicle.fuel] },
    { label: "Getriebe", value: TRANSMISSION_LABELS[vehicle.transmission] },
    {
      label: "Leistung",
      value: vehicle.powerKw !== null ? formatPower(vehicle.powerKw) : null,
    },
    {
      label: "Hubraum",
      value:
        vehicle.displacementCcm !== null
          ? `${formatNumber(vehicle.displacementCcm)} cm³`
          : null,
    },
    { label: "Farbe", value: vehicle.color },
    { label: "Türen", value: vehicle.doors !== null ? String(vehicle.doors) : null },
    { label: "Sitze", value: vehicle.seats !== null ? String(vehicle.seats) : null },
    {
      label: "Vorbesitzer",
      value:
        vehicle.previousOwners !== null ? String(vehicle.previousOwners) : null,
    },
    {
      label: "§57a-Begutachtung bis",
      value: vehicle.inspectionValidUntil
        ? formatDate(vehicle.inspectionValidUntil)
        : null,
    },
    { label: "Fahrzeug-Nr.", value: vehicle.externalId },
  ];

  return rows.filter(
    (row): row is { label: string; value: string } =>
      row.value !== null && row.value !== "",
  );
}

/**
 * Strukturierte Daten für Suchmaschinen.
 * schema.org/Car mit Angebot – ermöglicht Preis- und Datenanzeige in den
 * Suchergebnissen.
 */
function VehicleStructuredData({
  vehicle,
  companyName,
}: {
  vehicle: VehicleDetail;
  companyName: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: vehicle.title,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleConfiguration: vehicle.variant ?? undefined,
    description: vehicle.description || undefined,
    image: vehicle.images.map((image) => image.url),
    url: `${siteUrl()}/fahrzeuge/${vehicle.slug}`,
    itemCondition:
      vehicle.condition === "NEW"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: vehicle.mileageKm,
      unitCode: "KMT",
    },
    vehicleTransmission: TRANSMISSION_LABELS[vehicle.transmission],
    fuelType: FUEL_LABELS[vehicle.fuel],
    numberOfDoors: vehicle.doors ?? undefined,
    vehicleSeatingCapacity: vehicle.seats ?? undefined,
    color: vehicle.color ?? undefined,
    vehicleModelDate: vehicle.firstRegistration?.getFullYear(),
    ...(vehicle.powerKw !== null
      ? {
          vehicleEngine: {
            "@type": "EngineSpecification",
            enginePower: {
              "@type": "QuantitativeValue",
              value: vehicle.powerKw,
              unitCode: "KWT",
            },
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      price: (vehicle.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      itemCondition:
        vehicle.condition === "NEW"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
      seller: { "@type": "AutoDealer", name: companyName },
    },
  };

  return (
    <script
      type="application/ld+json"
      // Der Inhalt stammt vollständig aus der eigenen Datenbank und wird von
      // JSON.stringify escaped – kein Nutzer-Input, kein XSS-Vektor.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
