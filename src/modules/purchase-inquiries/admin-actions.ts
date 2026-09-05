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
 * Absichtlich klein gehalten: Status setzen und eine interne Notiz führen.
 * Ein vollwertiges CRM ist als eigene Aufgabe vorgesehen – hier soll nur
 * nachvollziehbar bleiben, wie weit eine Anfrage gediehen ist.
 *
 * Die Kundenangaben selbst sind nicht editierbar. Sie sind das, was der Kunde
 * geschrieben hat; ein Admin soll sie nicht nachträglich umschreiben können.
 */

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "NEW",
    "CONTACTED",
    "APPOINTMENT",
    "OFFER_MADE",
    "PURCHASED",
    "REJECTED",
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
      select: { id: true },
    });

    if (!existing) {
      return fail("Diese Anfrage existiert nicht mehr.", { code: "NOT_FOUND" });
    }

    await prisma.vehiclePurchaseInquiry.update({
      where: { id },
      data: { status, internalNotes },
    });

    // Kundendaten gehören nicht ins Log – nur, dass etwas passiert ist.
    logger.info("Ankaufanfrage aktualisiert", {
      userId: admin.id,
      inquiryId: id,
      status,
    });

    revalidatePath("/admin/ankauf");

    return ok({ message: "Die Anfrage wurde aktualisiert." });
  } catch (error) {
    logger.error("Ankaufanfrage konnte nicht aktualisiert werden", { error });
    return toActionResult(error);
  }
}
