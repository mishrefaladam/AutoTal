import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { VehicleFilterPanel } from "@/components/vehicles/vehicle-filter-panel";
import { VehiclePagination } from "@/components/vehicles/vehicle-pagination";
import { VehicleToolbar } from "@/components/vehicles/vehicle-toolbar";
import { parseVehicleFilters } from "@/modules/vehicles/filters";
import { estimateMonthlyPaymentCents } from "@/modules/financing/calculator";
import { getFinanceConfig } from "@/modules/financing/repository";
import {
  getVehicleFacets,
  searchVehicles,
} from "@/modules/vehicles/repository";

/**
 * Fahrzeugübersicht mit Filtern (US-03, US-04).
 *
 * Vollständig serverseitig gerendert: Die Liste steht sofort im HTML, ist
 * indexierbar und funktioniert auch ohne JavaScript. Nur das Filterpanel und
 * die Sortierung sind interaktiv.
 */

export const metadata: Metadata = {
  title: "Fahrzeuge",
  description:
    "Unser aktueller Fahrzeugbestand. Filtern Sie nach Marke, Modell, Preis, " +
    "Kilometerstand, Erstzulassung, Kraftstoff und Getriebe.",
  alternates: { canonical: "/fahrzeuge" },
};

export default async function VehiclesPage({
  searchParams,
}: PageProps<"/fahrzeuge">) {
  const filters = parseVehicleFilters(await searchParams);

  const [result, facets, financeConfig] = await Promise.all([
    searchVehicles(filters),
    getVehicleFacets(),
    getFinanceConfig(),
  ]);

  return (
    <div className="container-page py-10 lg:py-14">
      <header className="mb-8 lg:mb-10">
        <p className="eyebrow mb-3">Fahrzeugbestand</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Unsere Fahrzeuge
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed">
          Alle Fahrzeuge sind sofort verfügbar und wurden vor der Aufnahme in
          den Bestand technisch geprüft. Besichtigung und Probefahrt jederzeit
          nach Vereinbarung.
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[17rem_1fr] lg:gap-10 xl:grid-cols-[19rem_1fr]">
        {/* Filterspalte – ab Desktop dauerhaft sichtbar */}
        <aside
          aria-label="Fahrzeuge filtern"
          className="hidden lg:block"
        >
          <div className="sticky top-24">
            <h2 className="mb-5 text-base font-semibold">Filter</h2>
            <VehicleFilterPanel facets={facets} filters={filters} />
          </div>
        </aside>

        <div className="min-w-0">
          <VehicleToolbar
            facets={facets}
            filters={filters}
            totalCount={result.totalCount}
          />

          {result.items.length > 0 ? (
            <>
              <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((vehicle, index) => (
                  <li key={vehicle.id} className="flex">
                    <VehicleCard
                      vehicle={vehicle}
                      className="w-full"
                      priority={index < 3}
                      monthlyRateCents={estimateMonthlyPaymentCents(
                        vehicle.priceCents,
                        financeConfig,
                      )}
                    />
                  </li>
                ))}
              </ul>

              <VehiclePagination
                filters={filters}
                page={result.page}
                totalPages={result.totalPages}
              />
            </>
          ) : (
            <div className="border-border rounded-xl border border-dashed px-6 py-20 text-center">
              <SearchX
                className="text-muted-foreground mx-auto size-9"
                aria-hidden="true"
              />
              <h2 className="font-display mt-5 text-xl font-bold">
                Keine passenden Fahrzeuge
              </h2>
              <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
                Mit diesen Filtern haben wir aktuell nichts im Bestand. Nehmen
                Sie einzelne Filter zurück – oder sagen Sie uns, wonach Sie
                suchen. Wir halten die Augen offen.
              </p>

              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild variant="outline" size="xl">
                  <Link href="/fahrzeuge">Alle Fahrzeuge anzeigen</Link>
                </Button>
                <Button asChild variant="brand" size="xl">
                  <Link href="/kontakt">Suchauftrag aufgeben</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
