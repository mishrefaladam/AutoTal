import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  FuelType,
  PurchaseInquiryStatus,
  TransmissionType,
} from "@/generated/prisma/enums";

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
  status: PurchaseInquiryStatus;
  source: string;
  internalNotes: string;
  createdAt: Date;
  updatedAt: Date;
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

/** Alle Anfragen für die Admin-Übersicht, neueste zuerst. */
export async function listPurchaseInquiriesForAdmin(): Promise<
  AdminPurchaseInquiry[]
> {
  return prisma.vehiclePurchaseInquiry.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/** Zählt offene Anfragen – für den Hinweis in der Navigation. */
export async function countOpenPurchaseInquiries(): Promise<number> {
  return prisma.vehiclePurchaseInquiry.count({
    where: { status: { notIn: ["PURCHASED", "REJECTED"] } },
  });
}
