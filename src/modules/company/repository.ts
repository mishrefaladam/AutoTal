import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

import type { CompanyDto } from "./types";

/**
 * Zugriff auf die Unternehmensdaten.
 *
 * `getCompany()` ist mit React `cache()` umhüllt: Header, Footer und Seiten-
 * inhalt fragen dieselben Daten an, sollen aber pro Request nur eine einzige
 * Datenbankabfrage auslösen.
 */

export const COMPANY_ID = "default";

/**
 * Fallback, solange der Seed noch nicht gelaufen ist. Verhindert, dass die
 * Website mit einem Serverfehler antwortet, nur weil die Datenbank leer ist.
 */
const FALLBACK: CompanyDto = {
  legalName: "AutoTal",
  displayName: "AutoTal",
  tagline: null,
  aboutText: "",
  street: "",
  postalCode: "",
  city: "",
  country: "Österreich",
  addressLine: "",
  phone: "",
  phoneHref: "",
  whatsappNumber: null,
  email: "",
  vatId: null,
  commercialRegisterNumber: null,
  commercialRegisterCourt: null,
  contactPersonName: null,
  contactPersonRole: null,
  contactPersonEmail: null,
  contactPersonPhone: null,
  latitude: null,
  longitude: null,
  openingHours: [],
  socialLinks: [],
};

/** "+43 7242 12345" -> "+43724212345" für tel:-Links */
export function toPhoneHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function buildAddressLine(parts: {
  street: string;
  postalCode: string;
  city: string;
}): string {
  const locality = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  return [parts.street, locality].filter(Boolean).join(", ");
}

export const getCompany = cache(async (): Promise<CompanyDto> => {
  const record = await prisma.companySettings.findUnique({
    where: { id: COMPANY_ID },
    include: {
      openingHours: { orderBy: [{ weekday: "asc" }, { position: "asc" }] },
      socialLinks: {
        where: { active: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!record) return FALLBACK;

  return {
    legalName: record.legalName,
    displayName: record.displayName,
    tagline: record.tagline,
    aboutText: record.aboutText,

    street: record.street,
    postalCode: record.postalCode,
    city: record.city,
    country: record.country,
    addressLine: buildAddressLine(record),

    phone: record.phone,
    phoneHref: toPhoneHref(record.phone),
    whatsappNumber: record.whatsappNumber,
    email: record.email,

    vatId: record.vatId,
    commercialRegisterNumber: record.commercialRegisterNumber,
    commercialRegisterCourt: record.commercialRegisterCourt,

    contactPersonName: record.contactPersonName,
    contactPersonRole: record.contactPersonRole,
    contactPersonEmail: record.contactPersonEmail,
    contactPersonPhone: record.contactPersonPhone,

    latitude: record.latitude,
    longitude: record.longitude,

    openingHours: record.openingHours.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      opensAt: slot.opensAt,
      closesAt: slot.closesAt,
      closed: slot.closed,
      note: slot.note,
      position: slot.position,
    })),

    socialLinks: record.socialLinks.map((link) => ({
      id: link.id,
      platform: link.platform,
      url: link.url,
      label: link.label,
      position: link.position,
    })),
  };
});

/** Für den Admin – inklusive inaktiver Social-Links. */
export async function getCompanyForAdmin() {
  return prisma.companySettings.findUnique({
    where: { id: COMPANY_ID },
    include: {
      openingHours: { orderBy: [{ weekday: "asc" }, { position: "asc" }] },
      socialLinks: { orderBy: { position: "asc" } },
    },
  });
}
