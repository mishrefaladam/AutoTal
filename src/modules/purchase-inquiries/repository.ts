import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  CrmLeadStatus,
  FuelType,
  TransmissionType,
} from "@/generated/prisma/enums";
import { PURCHASE_TO_CRM_STATUS } from "@/modules/crm/purchase-inquiry-status";

/**
 * Zugriff auf Kunden-Ankaufanfragen (US-11).
 *
 * Eine Ankaufanfrage ist ein Kundenkontakt, kein Bestandsfahrzeug – deshalb
 * ein eigenes Modell und ein eigenes Repository. Die Angaben zum Fahrzeug
 * stammen vom Kunden und sind ungeprüft.
 *
 * DATENSCHUTZ: Hier liegen personenbezogene Daten. Sie werden ausschließlich
 * im geschützten Adminbereich gelesen; öffentliche Seiten greifen nie darauf
 * zu.
 *
 * EIN VORGANG, EINE WAHRHEIT: Bearbeitungsstand und interne Notiz stehen NICHT
 * mehr an der Anfrage, sondern am zugehörigen CrmLead. Beide Admin-Ansichten
 * – „Ankaufsanfragen“ und „CRM“ – lesen und schreiben damit dieselbe Zeile.
 * Vorher liefen die beiden Statusfelder auseinander.
 *
 * Die Anfrage hält weiterhin, was nur sie hat: die Fahrzeugangaben des Kunden.
 */

export type PurchaseInquiryInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | undefined;
  make: string;
  model: string;
  firstRegistrationYear: number;
  mileageKm: number;
  fuel: FuelType;
  transmission: TransmissionType;
  vin?: string | undefined;
  priceExpectationCents?: number | undefined;
  message: string;
};

export type AdminPurchaseInquiry = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  make: string;
  model: string;
  firstRegistrationYear: number;
  mileageKm: number;
  fuel: FuelType;
  transmission: TransmissionType;
  vin: string | null;
  priceExpectationCents: number | null;
  message: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;

  // -- Gemeinsame Felder, geführt am Lead ------------------------------------
  /** ID des Leads. `null` nur bei Altbeständen ohne Lead. */
  leadId: string | null;
  status: CrmLeadStatus;
  internalNotes: string;
  archivedAt: Date | null;
};

/**
 * Legt eine Anfrage an.
 *
 * Bewusst ohne Deduplizierung: Zwei ähnliche Anfragen können echt sein (etwa
 * ein zweites Fahrzeug derselben Person). Eine automatische Zusammenführung
 * würde eher Anfragen verschlucken, als Doppelungen zu verhindern.
 */
export async function createPurchaseInquiry(
  input: PurchaseInquiryInput,
): Promise<{ id: string }> {
  const created = await prisma.vehiclePurchaseInquiry.create({
    data: {
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail ?? null,
      make: input.make,
      model: input.model,
      firstRegistrationYear: input.firstRegistrationYear,
      mileageKm: input.mileageKm,
      fuel: input.fuel,
      transmission: input.transmission,
      vin: input.vin ?? null,
      priceExpectationCents: input.priceExpectationCents ?? null,
      message: input.message,
    },
    select: { id: true },
  });

  return created;
}

/**
 * Alle nicht archivierten Anfragen für die Admin-Übersicht, neueste zuerst.
 *
 * Status und Notiz kommen aus dem Lead. Fehlt ausnahmsweise einer – denkbar
 * nur bei einem Altbestand, den die Migration nicht erfasst hat –, wird die
 * überholte Spalte der Anfrage als letzter Rückfall übersetzt, damit die
 * Anfrage nicht ohne Bearbeitungsstand dasteht.
 */
export async function listPurchaseInquiriesForAdmin(): Promise<
  AdminPurchaseInquiry[]
> {
  const rows = await prisma.vehiclePurchaseInquiry.findMany({
    where: { crmLead: { is: { archivedAt: null } } },
    orderBy: { createdAt: "desc" },
    include: {
      crmLead: {
        select: {
          id: true,
          status: true,
          internalNotes: true,
          archivedAt: true,
        },
      },
    },
  });

  return rows.map(({ crmLead, status, internalNotes, ...inquiry }) => ({
    ...inquiry,
    leadId: crmLead?.id ?? null,
    status: crmLead?.status ?? PURCHASE_TO_CRM_STATUS[status],
    internalNotes: crmLead?.internalNotes ?? internalNotes,
    archivedAt: crmLead?.archivedAt ?? null,
  }));
}

/**
 * Zählt offene Anfragen – für den Hinweis in der Navigation.
 *
 * „Offen“ heißt: weder abgeschlossen noch archiviert. Gezählt wird über den
 * Lead, weil dort der maßgebliche Stand liegt.
 */
export async function countOpenPurchaseInquiries(): Promise<number> {
  return prisma.vehiclePurchaseInquiry.count({
    where: {
      crmLead: { is: { archivedAt: null, status: { notIn: ["WON", "LOST"] } } },
    },
  });
}
