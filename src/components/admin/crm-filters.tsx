import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_SOURCE_ORDER,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_STATUS_ORDER,
  CRM_LEAD_TYPE_LABELS,
  CRM_LEAD_TYPE_ORDER,
} from "@/modules/crm/labels";

/**
 * Filter- und Suchleiste des CRM.
 *
 * Als GET-Formular umgesetzt, nicht als Client-State: Der Filter steht damit
 * in der URL, ist teilbar, überlebt einen Reload und funktioniert ohne
 * JavaScript. Das passt zum übrigen Admin, wo der Fahrzeugfilter genauso
 * arbeitet.
 */

/** Auswählbare Zeiträume. Wert = Tage, leer = ohne Einschränkung. */
export const CRM_PERIODS = [
  { value: "", label: "Gesamter Zeitraum" },
  { value: "7", label: "Letzte 7 Tage" },
  { value: "30", label: "Letzte 30 Tage" },
  { value: "90", label: "Letzte 90 Tage" },
] as const;

const SELECT_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

export function CrmFilters({
  status,
  type,
  source,
  period,
  search,
  hasFilters,
}: {
  status: string;
  type: string;
  source: string;
  period: string;
  search: string;
  hasFilters: boolean;
}) {
  return (
    <form
      method="get"
      className="border-border bg-background mb-6 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="crm-search" className="text-muted-foreground text-xs">
            Suche
          </Label>
          <Input
            id="crm-search"
            name="q"
            defaultValue={search}
            placeholder="Name, Telefon, E-Mail"
            className="h-9"
          />
        </div>

        <FilterSelect
          id="crm-status"
          name="status"
          label="Status"
          value={status}
          options={CRM_LEAD_STATUS_ORDER.map((value) => ({
            value,
            label: CRM_LEAD_STATUS_LABELS[value],
          }))}
        />

        <FilterSelect
          id="crm-type"
          name="type"
          label="Anliegen"
          value={type}
          options={CRM_LEAD_TYPE_ORDER.map((value) => ({
            value,
            label: CRM_LEAD_TYPE_LABELS[value],
          }))}
        />

        <FilterSelect
          id="crm-source"
          name="source"
          label="Quelle"
          value={source}
          options={CRM_LEAD_SOURCE_ORDER.map((value) => ({
            value,
            label: CRM_LEAD_SOURCE_LABELS[value],
          }))}
        />

        <div className="space-y-1.5">
          <Label htmlFor="crm-period" className="text-muted-foreground text-xs">
            Zeitraum
          </Label>
          <select
            id="crm-period"
            name="period"
            defaultValue={period}
            className={cn(SELECT_CLASS)}
          >
            {CRM_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="xl">
          Filtern
        </Button>

        {hasFilters && (
          <Button asChild variant="ghost" size="xl">
            <Link href="/admin/crm">Zurücksetzen</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

function FilterSelect({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <select id={id} name={name} defaultValue={value} className={SELECT_CLASS}>
        <option value="">Alle</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
