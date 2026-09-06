import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadType,
} from "@/generated/prisma/enums";

import { CRM_LEAD_ACTIVE_STATUSES } from "./labels";

/**
 * Datenzugriff des CRM.
 *
 * Der Lead hält bewusst nur Kontakt- und Vertriebsdaten. Fachliche Details
 * eines angebotenen Fahrzeugs stehen weiterhin in VehiclePurchaseInquiry und
 * werden über die Relation gelesen – nicht kopiert.
 */

export type CrmLeadListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: CrmLeadType;
  source: CrmLeadSource;
  status: CrmLeadStatus;
  lastContactAt: Date | null;
  createdAt: Date;
  hasPurchaseInquiry: boolean;
};

export type CrmLeadInput = {
  name: string;
  phone: string | null;
  email: string | null;
  type: CrmLeadType;
  source: CrmLeadSource;
  message: string;
  purchaseInquiryId?: string;
};

/**
 * Zeitfenster, in dem ein identischer Lead als Wiederholung gilt.
 *
 * Deckt Doppelklick, Wiederholung nach Netzwerkfehler und einen erneuten
 * Server-Action-Aufruf ab. Bewusst kurz: Wer zwei Stunden später erneut
 * schreibt, meint es ernst und bekommt einen eigenen Lead. Es werden NIE
 * verschiedene Personen zusammengeführt – verglichen wird die konkrete
 * Anfrage, nicht nur die Adresse.
 */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/** Vergleichsform einer Erreichbarkeit: Schreibweise soll nicht entscheiden. */
export function normalizeContact(value: string | null): string | null {
  if (value === null) return null;

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;

  // Bei Telefonnummern zählt nur die Ziffernfolge: "+43 664 123" und
  // "0043664123" sind dieselbe Nummer, nicht zwei Kontakte.
  return /[a-z@]/.test(trimmed) ? trimmed : trimmed.replace(/[^\d+]/g, "");
}

/**
 * Legt einen Lead an – oder gibt den eben angelegten zurück, wenn dieselbe
 * Anfrage gerade schon eingegangen ist.
 */
export async function createCrmLead(
  input: CrmLeadInput,
  now: Date = new Date(),
): Promise<{ id: string; deduplicated: boolean }> {
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS);

  // Kandidaten desselben Anliegens aus dem Zeitfenster holen und erst in JS
  // vergleichen: Die Normalisierung der Telefonnummer lässt sich in SQL nicht
  // sinnvoll abbilden, und die Menge ist durch das Fenster winzig.
  const recent = await prisma.crmLead.findMany({
    where: { type: input.type, createdAt: { gte: since } },
    select: { id: true, phone: true, email: true, message: true },
  });

  const phone = normalizeContact(input.phone);
  const email = normalizeContact(input.email);

  const duplicate = recent.find(
    (candidate) =>
      candidate.message === input.message &&
      normalizeContact(candidate.phone) === phone &&
      normalizeContact(candidate.email) === email,
  );

  if (duplicate) return { id: duplicate.id, deduplicated: true };

  const created = await prisma.crmLead.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      type: input.type,
      source: input.source,
      message: input.message,
      purchaseInquiryId: input.purchaseInquiryId ?? null,
    },
    select: { id: true },
  });

  return { id: created.id, deduplicated: false };
}

export type CrmLeadFilters = {
  status?: CrmLeadStatus;
  type?: CrmLeadType;
  source?: CrmLeadSource;
  /** Nur Leads aus den letzten N Tagen. Undefiniert = ohne Einschränkung. */
  periodDays?: number;
  /** Freitext über Name, Telefon und E-Mail. */
  search?: string;
};

export async function listCrmLeads(
  filters: CrmLeadFilters = {},
  now: Date = new Date(),
): Promise<CrmLeadListItem[]> {
  const search = filters.search?.trim();

  // Die Zeitgrenze wird hier berechnet, nicht in der Seite: Ein `Date.now()`
  // im Render einer Komponente ist unrein und wird vom React-Compiler zu
  // Recht beanstandet.
  const since =
    filters.periodDays !== undefined && filters.periodDays > 0
      ? new Date(now.getTime() - filters.periodDays * 24 * 60 * 60 * 1000)
      : undefined;

  const rows = await prisma.crmLead.findMany({
    where: {
      status: filters.status,
      type: filters.type,
      source: filters.source,
      createdAt: since ? { gte: since } : undefined,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      type: true,
      source: true,
      status: true,
      lastContactAt: true,
      createdAt: true,
      purchaseInquiryId: true,
    },
  });

  return rows.map(({ purchaseInquiryId, ...row }) => ({
    ...row,
    hasPurchaseInquiry: purchaseInquiryId !== null,
  }));
}

/** Lead samt verknüpfter Ankaufanfrage für die Detailansicht. */
export async function getCrmLead(id: string) {
  return prisma.crmLead.findUnique({
    where: { id },
    include: { purchaseInquiry: true },
  });
}

export type CrmStatistics = {
  total: number;
  byStatus: Record<CrmLeadStatus, number>;
  byType: Record<CrmLeadType, number>;
  bySource: Record<CrmLeadSource, number>;
  active: number;
  /** Anteil gewonnener an abgeschlossenen Leads, oder null wenn keine. */
  conversionRate: number | null;
};

/**
 * Zahlen für die Übersicht.
 *
 * Drei groupBy-Abfragen statt aller Zeilen zu laden. Die Conversion Rate
 * bezieht sich ausdrücklich nur auf abgeschlossene Leads (WON / (WON + LOST));
 * ohne abgeschlossene Leads gibt es keine Quote, dann `null` statt einer
 * irreführenden Null.
 */
export async function getCrmStatistics(): Promise<CrmStatistics> {
  const [byStatusRows, byTypeRows, bySourceRows] = await Promise.all([
    prisma.crmLead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.crmLead.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);

  const byStatus = {
    NEW: 0,
    CONTACTED: 0,
    APPOINTMENT: 0,
    IN_PROGRESS: 0,
    WON: 0,
    LOST: 0,
  } satisfies Record<CrmLeadStatus, number>;

  const byType = {
    BUY: 0,
    SELL: 0,
    FINANCING: 0,
    TEST_DRIVE: 0,
    GENERAL: 0,
  } satisfies Record<CrmLeadType, number>;

  const bySource = {
    WEBSITE: 0,
    WHATSAPP: 0,
    INSTAGRAM: 0,
    WILLHABEN: 0,
    AUTOSCOUT: 0,
    GEBRAUCHTWAGEN: 0,
    MANUAL: 0,
  } satisfies Record<CrmLeadSource, number>;

  let total = 0;
  for (const row of byStatusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }
  for (const row of byTypeRows) byType[row.type] = row._count._all;
  for (const row of bySourceRows) bySource[row.source] = row._count._all;

  const closed = byStatus.WON + byStatus.LOST;

  return {
    total,
    byStatus,
    byType,
    bySource,
    active: CRM_LEAD_ACTIVE_STATUSES.reduce(
      (sum, status) => sum + byStatus[status],
      0,
    ),
    conversionRate: closed === 0 ? null : byStatus.WON / closed,
  };
}

/** Offene Leads – für den Zähler in der Navigation. */
export async function countNewCrmLeads(): Promise<number> {
  return prisma.crmLead.count({ where: { status: "NEW" } });
}
