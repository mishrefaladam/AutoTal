import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CompanyForm } from "@/components/admin/company-form";
import { getCompanyForAdmin } from "@/modules/company/repository";
import type { CompanySettingsFormValues } from "@/modules/company/schemas";

export const metadata: Metadata = { title: "Unternehmen" };

const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
] as const;

const SLOTS_PER_DAY = 2;

/**
 * Unternehmensdaten verwalten (US-15, US-16).
 *
 * Das Formular erwartet ein festes Raster aus 14 Öffnungszeit-Slots
 * (7 Tage × 2) und 5 Social-Plattformen. Die gespeicherten Daten sind
 * lückenhaft – hier wird das Raster daher vollständig aufgefüllt.
 */
export default async function AdminCompanyPage() {
  const company = await getCompanyForAdmin();

  const openingHours: CompanySettingsFormValues["openingHours"] = Array.from(
    { length: 7 * SLOTS_PER_DAY },
    (_, index) => {
      const weekday = Math.floor(index / SLOTS_PER_DAY) + 1;
      const position = index % SLOTS_PER_DAY;

      const stored = company?.openingHours.find(
        (slot) => slot.weekday === weekday && slot.position === position,
      );

      // Der Geschlossen-Status hängt am Tag, nicht am einzelnen Zeitfenster.
      const dayIsClosed = company?.openingHours.some(
        (slot) => slot.weekday === weekday && slot.closed,
      );

      return {
        weekday,
        position,
        closed: Boolean(dayIsClosed),
        opensAt: stored?.opensAt ?? "",
        closesAt: stored?.closesAt ?? "",
      };
    },
  );

  const socialLinks: CompanySettingsFormValues["socialLinks"] =
    SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      url: company?.socialLinks.find((link) => link.platform === platform)?.url ?? "",
    }));

  const defaultValues: CompanySettingsFormValues = {
    legalName: company?.legalName ?? "",
    displayName: company?.displayName ?? "",
    tagline: company?.tagline ?? "",
    aboutText: company?.aboutText ?? "",

    street: company?.street ?? "",
    postalCode: company?.postalCode ?? "",
    city: company?.city ?? "",
    country: company?.country ?? "Österreich",

    phone: company?.phone ?? "",
    whatsappNumber: company?.whatsappNumber ?? "",
    email: company?.email ?? "",

    vatId: company?.vatId ?? "",
    commercialRegisterNumber: company?.commercialRegisterNumber ?? "",
    commercialRegisterCourt: company?.commercialRegisterCourt ?? "",

    businessPurpose: company?.businessPurpose ?? "",
    supervisoryAuthority: company?.supervisoryAuthority ?? "",
    gisaNumber: company?.gisaNumber ?? "",

    contactPersonName: company?.contactPersonName ?? "",
    contactPersonRole: company?.contactPersonRole ?? "",
    contactPersonEmail: company?.contactPersonEmail ?? "",
    contactPersonPhone: company?.contactPersonPhone ?? "",

    latitude: company?.latitude != null ? String(company.latitude) : "",
    longitude: company?.longitude != null ? String(company.longitude) : "",

    openingHours,
    socialLinks,
  };

  return (
    <>
      <AdminPageHeader
        title="Unternehmen"
        description="Kontaktdaten, Öffnungszeiten und Social-Media-Links. Diese Angaben erscheinen in der Kopf- und Fußzeile, auf der Kontaktseite und im Impressum."
      />

      <CompanyForm defaultValues={defaultValues} />
    </>
  );
}
