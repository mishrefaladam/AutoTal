import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildVehiclesHref } from "@/modules/vehicles/filters";
import type { VehicleFilters } from "@/modules/vehicles/types";
import { cn } from "@/lib/utils";

/**
 * Seitenblättern der Trefferliste.
 *
 * Bewusst als echte `<a>`-Links (Server-Komponente): So sind Seiten
 * crawlbar, in neuen Tabs öffenbar und funktionieren ohne JavaScript.
 */
export function VehiclePagination({
  filters,
  page,
  totalPages,
}: {
  filters: VehicleFilters;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <nav
      aria-label="Seitennavigation Fahrzeugliste"
      className="mt-12 flex items-center justify-center gap-1.5"
    >
      <PageLink
        filters={filters}
        page={page - 1}
        disabled={page <= 1}
        label="Vorherige Seite"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Zurück</span>
      </PageLink>

      <ul className="flex items-center gap-1.5">
        {pages.map((entry, index) =>
          entry === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="text-muted-foreground px-1"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={buildVehiclesHref({ ...filters, page: entry })}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Seite ${entry}`}
                className={cn(
                  "tabular flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  entry === page
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>

      <PageLink
        filters={filters}
        page={page + 1}
        disabled={page >= totalPages}
        label="Nächste Seite"
      >
        <span className="hidden sm:inline">Weiter</span>
        <ChevronRight className="size-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  label,
  children,
}: {
  filters: VehicleFilters;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    "border-border flex h-10 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(className, "text-muted-foreground/50 cursor-not-allowed")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={buildVehiclesHref({ ...filters, page })}
      aria-label={label}
      className={cn(
        className,
        "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Erste, letzte und die Nachbarn der aktuellen Seite; dazwischen Auslassungen.
 * Beispiel bei Seite 7 von 20: 1 … 6 7 8 … 20
 */
function buildPageList(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const result: (number | "gap")[] = [1];

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) result.push("gap");
  for (let current = start; current <= end; current += 1) result.push(current);
  if (end < totalPages - 1) result.push("gap");

  result.push(totalPages);
  return result;
}
