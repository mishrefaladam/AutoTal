"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

import { COMPANY_ID } from "./repository";
import { companySettingsSchema } from "./schemas";

/**
 * Speichern der Unternehmensdaten (US-15, US-16).
 *
 * Öffnungszeiten und Social-Links werden vollständig ersetzt statt einzeln
 * abgeglichen – das Formular liefert immer den kompletten Satz, und ein
 * Ersetzen in einer Transaktion ist deutlich weniger fehleranfällig als ein
 * Diff über drei Tabellen.
 */
export async function saveCompanySettings(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = companySettingsSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { openingHours, socialLinks, ...settings } = parsed.data;

    // Leere Zeitfenster fliegen raus; ein geschlossener Tag bleibt als
    // ausdrücklicher Eintrag erhalten, damit "geschlossen" angezeigt wird.
    const slots = openingHours.filter(
      (slot) => slot.closed || (slot.opensAt !== "" && slot.closesAt !== ""),
    );

    const links = socialLinks.filter((link) => link.url !== null);

    await prisma.$transaction(async (tx) => {
      await tx.companySettings.upsert({
        where: { id: COMPANY_ID },
        create: { id: COMPANY_ID, ...settings },
        update: settings,
      });

      await tx.openingHour.deleteMany({ where: { companyId: COMPANY_ID } });
      if (slots.length > 0) {
        await tx.openingHour.createMany({
          data: slots.map((slot) => ({
            companyId: COMPANY_ID,
            weekday: slot.weekday,
            position: slot.position,
            closed: slot.closed,
            opensAt: slot.closed || slot.opensAt === "" ? null : slot.opensAt,
            closesAt: slot.closed || slot.closesAt === "" ? null : slot.closesAt,
          })),
        });
      }

      await tx.socialLink.deleteMany({ where: { companyId: COMPANY_ID } });
      if (links.length > 0) {
        await tx.socialLink.createMany({
          data: links.map((link, index) => ({
            companyId: COMPANY_ID,
            platform: link.platform,
            url: link.url as string,
            position: index,
            active: true,
          })),
        });
      }
    });

    logger.info("Unternehmensdaten aktualisiert", { userId: admin.id });

    // Diese Daten stecken in Kopf- und Fußzeile jeder Seite – deshalb wird
    // der komplette Baum neu validiert, nicht nur eine Route.
    revalidatePath("/", "layout");

    return ok({ message: "Die Unternehmensdaten wurden gespeichert." });
  } catch (error) {
    logger.error("Unternehmensdaten konnten nicht gespeichert werden", { error });
    return toActionResult(error);
  }
}
