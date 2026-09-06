import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { CrmFilters } from "@/components/admin/crm-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_TYPE_LABELS,
} from "@/modules/crm/labels";
import { getCrmStatistics, listCrmLeads } from "@/modules/crm/repository";
import { formatDateTime } from "@/modules/vehicles/labels";
import type {
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadType,
} from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "CRM" };

/**
 * Arbeitsliste des Vertriebs.
 *
 * Alle Anfragen der Website laufen hier zusammen. Fahrzeugdaten eines
 * angebotenen Autos stehen weiterhin in der Ankaufanfrage – der Lead
 * verweist nur darauf.
 */

/** Nimmt einen Wert nur an, wenn er zum Enum gehört. Schützt vor URL-Müll. */
function asEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

const STATUSES: CrmLeadStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT",
  "IN_PROGRESS",
  "WON",
  "LOST",
];
const TYPES: CrmLeadType[] = [
  "BUY",
  "SELL",
  "FINANCING",
  "TEST_DRIVE",
  "GENERAL",
];
const SOURCES: CrmLeadSource[] = [
  "WEBSITE",
  "WHATSAPP",
  "INSTAGRAM",
  "WILLHABEN",
  "AUTOSCOUT",
  "GEBRAUCHTWAGEN",
  "MANUAL",
];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminCrmPage({
  searchParams,
}: PageProps<"/admin/crm">) {
  const params = await searchParams;

  const statusParam = first(params.status);
  const typeParam = first(params.type);
  const sourceParam = first(params.source);
  const periodParam = first(params.period);
  const search = first(params.q).trim();

  const days = Number(periodParam);

  const [leads, stats] = await Promise.all([
    listCrmLeads({
      status: asEnum(statusParam, STATUSES),
      type: asEnum(typeParam, TYPES),
      source: asEnum(sourceParam, SOURCES),
      periodDays: Number.isFinite(days) && days > 0 ? days : undefined,
      search: search || undefined,
    }),
    getCrmStatistics(),
  ]);

  const hasFilters = Boolean(
    statusParam || typeParam || sourceParam || periodParam || search,
  );

  return (
    <>
      <AdminPageHeader
        title="CRM"
        description="Alle Anfragen aus der Website und manuell erfasste Kontakte."
        action={
          <Button asChild variant="brand" size="xl">
            <Link href="/admin/crm/neu">
              <Plus data-icon="inline-start" aria-hidden="true" />
              Lead anlegen
            </Link>
          </Button>
        }
      />

      {/* Kennzahlen beziehen sich immer auf den Gesamtbestand, nicht auf den
          aktiven Filter – sonst wäre "Neu: 0" bei gesetztem Filter irreführend. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Neu" value={stats.byStatus.NEW} />
        <StatCard label="In Bearbeitung" value={stats.byStatus.IN_PROGRESS} />
        <StatCard label="Termine" value={stats.byStatus.APPOINTMENT} />
        <StatCard label="Gewonnen" value={stats.byStatus.WON} />
        <StatCard label="Verloren" value={stats.byStatus.LOST} />
      </div>

      <CrmFilters
        status={statusParam}
        type={typeParam}
        source={sourceParam}
        period={periodParam}
        search={search}
        hasFilters={hasFilters}
      />

      {leads.length === 0 ? (
        <AdminCard>
          <div className="py-12 text-center">
            <Users className="text-muted-foreground mx-auto size-9" aria-hidden="true" />
            <h2 className="font-display mt-4 text-lg font-bold">
              {stats.total === 0 ? "Noch keine Leads" : "Keine Treffer"}
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
              {stats.total === 0
                ? "Sobald jemand ein Formular auf der Website absendet, erscheint der Kontakt hier."
                : "Für diese Filter gibt es keine Leads. Setzen Sie die Filter zurück oder ändern Sie die Suche."}
            </p>
          </div>
        </AdminCard>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            {leads.length} {leads.length === 1 ? "Lead" : "Leads"}
            {hasFilters && ` von ${stats.total}`}
          </p>

          <ul className="space-y-2">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/admin/crm/${lead.id}`}
                  className={cn(
                    "border-border bg-background block rounded-xl border p-4 transition-colors",
                    "hover:border-brand/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{lead.name}</span>
                    <Badge variant="secondary">
                      {CRM_LEAD_TYPE_LABELS[lead.type]}
                    </Badge>
                    <StatusBadge status={lead.status} />
                    {lead.hasPurchaseInquiry && (
                      <Badge variant="secondary">mit Ankaufanfrage</Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground mt-1 text-sm">
                    {[lead.phone, lead.email].filter(Boolean).join(" · ") ||
                      "keine Kontaktdaten"}
                  </p>

                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {CRM_LEAD_SOURCE_LABELS[lead.source]} · eingegangen{" "}
                    {formatDateTime(lead.createdAt)}
                    {lead.lastContactAt
                      ? ` · zuletzt kontaktiert ${formatDateTime(lead.lastContactAt)}`
                      : " · noch kein Kontakt dokumentiert"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8">
        <AdminCard title="Statistik">
        <div className="grid gap-6 sm:grid-cols-3">
          <Breakdown
            title="Nach Anliegen"
            entries={TYPES.map((type) => ({
              label: CRM_LEAD_TYPE_LABELS[type],
              value: stats.byType[type],
            }))}
          />
          <Breakdown
            title="Nach Quelle"
            entries={SOURCES.map((source) => ({
              label: CRM_LEAD_SOURCE_LABELS[source],
              value: stats.bySource[source],
            }))}
          />
          <Breakdown
            title="Nach Status"
            entries={STATUSES.map((status) => ({
              label: CRM_LEAD_STATUS_LABELS[status],
              value: stats.byStatus[status],
            }))}
          />
        </div>

        <dl className="border-border mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-sm">Leads gesamt</dt>
            <dd className="font-display tabular mt-0.5 text-xl font-bold">
              {stats.total}
            </dd>
          </div>
          <div>
            {/* Bewusst nicht "In Bearbeitung": So heißt oben eine einzelne
                Statuskarte. Hier ist die Summe aller noch offenen Leads. */}
            <dt className="text-muted-foreground text-sm">
              Noch offen
              <span className="block text-xs">alle außer gewonnen/verloren</span>
            </dt>
            <dd className="font-display tabular mt-0.5 text-xl font-bold">
              {stats.active}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">
              Abschlussquote
              <span className="block text-xs">gewonnen von abgeschlossen</span>
            </dt>
            <dd className="font-display tabular mt-0.5 text-xl font-bold">
              {/* Ohne abgeschlossene Leads gibt es keine Quote – eine 0 %
                  wäre eine Aussage, die die Daten nicht hergeben. */}
              {stats.conversionRate === null
                ? "–"
                : `${Math.round(stats.conversionRate * 100)} %`}
            </dd>
          </div>
        </dl>
        </AdminCard>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="font-display tabular text-2xl font-bold">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-sm">{label}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: CrmLeadStatus }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        status === "WON" && "bg-success/15 text-success",
        status === "LOST" && "bg-muted text-muted-foreground",
        status === "NEW" && "bg-brand text-brand-foreground",
        (status === "CONTACTED" ||
          status === "APPOINTMENT" ||
          status === "IN_PROGRESS") &&
          "bg-warning/15 text-warning-foreground",
      )}
    >
      {CRM_LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}

function Breakdown({
  title,
  entries,
}: {
  title: string;
  entries: { label: string; value: number }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="mt-2 space-y-1.5">
        {entries.map((entry) => (
          <div key={entry.label} className="flex justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{entry.label}</dt>
            <dd className="tabular font-medium">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
