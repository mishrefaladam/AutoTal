"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

/**
 * Bearbeitung von Ankaufanfragen im Admin.
 *
 * Status und Notiz werden am zugehörigen CrmLead gespeichert, nicht an der
 * Anfrage. Damit zeigen „Ankaufsanfragen“ und „CRM“ zwingend denselben Stand:
 * Es gibt nur noch ein Feld, das man ändern kann.
 *
 * Vorher schrieb diese Aktion in VehiclePurchaseInquiry.status – ein zweites
 * Feld für denselben Vorgang. Wer hier auf „Angekauft“ stellte, sah im CRM
 * weiterhin „Neu“.
 *
 * Die Kundenangaben selbst sind nicht editierbar. Sie sind das, was der Kunde
 * geschrieben hat; ein Admin soll sie nicht nachträglich umschreiben können.
 */

const updateSchema = z.object({
  id: z.string().min(1),
  // Die Stufen des gemeinsamen Felds. „Angebot gemacht“ heißt hier
  // IN_PROGRESS und wird für Ankauf-Leads auch so beschriftet.
  status: z.enum([
    "NEW",
    "CONTACTED",
    "APPOINTMENT",
    "IN_PROGRESS",
    "WON",
    "LOST",
  ]),
  internalNotes: z
    .string()
    .trim()
    .max(2000, "Die Notiz ist zu lang (höchstens 2000 Zeichen).")
    .default(""),
});

export async function updatePurchaseInquiry(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = updateSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { id, status, internalNotes } = parsed.data;

    const existing = await prisma.vehiclePurchaseInquiry.findUnique({
      where: { id },
      select: { id: true, crmLead: { select: { id: true } } },
    });

    if (!existing) {
      return fail("Diese Anfrage existiert nicht mehr.", { code: "NOT_FOUND" });
    }

    // Ohne Lead gäbe es nichts zu schreiben – der Stand wird ausschließlich
    // dort geführt. Das kann nur ein Altbestand sein, den die
    // Zusammenführung nicht erfasst hat.
    if (!existing.crmLead) {
      logger.error("Ankaufanfrage ohne zugehörigen Lead", { inquiryId: id });
      return fail(
        "Zu dieser Anfrage fehlt der CRM-Eintrag. Bitte melden Sie das – " +
          "die Anfrage selbst ist nicht verloren.",
        { code: "CONFLICT" },
      );
    }

    await prisma.crmLead.update({
      where: { id: existing.crmLead.id },
      data: { status, internalNotes },
    });

    // Kundendaten gehören nicht ins Log – nur, dass etwas passiert ist.
    logger.info("Ankaufanfrage aktualisiert", {
      userId: admin.id,
      inquiryId: id,
      leadId: existing.crmLead.id,
      status,
    });

    // Beide Ansichten zeigen dieselbe Zeile – also müssen auch beide neu
    // gelesen werden.
    revalidatePath("/admin/ankauf");
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${existing.crmLead.id}`);

    return ok({ message: "Die Anfrage wurde aktualisiert." });
  } catch (error) {
    logger.error("Ankaufanfrage konnte nicht aktualisiert werden", { error });
    return toActionResult(error);
  }
}
