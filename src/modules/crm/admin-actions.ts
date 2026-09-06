"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

import { createCrmLead } from "./repository";
import { crmLeadCreateSchema, crmLeadUpdateSchema } from "./schemas";

/**
 * Bearbeitung der CRM-Leads.
 *
 * Jede Aktion prüft zuerst die Anmeldung – das CRM enthält Kundendaten und
 * ist ausschließlich intern. Kundendaten werden bewusst NICHT geloggt; im
 * Protokoll steht nur die Lead-ID.
 */

/** Nur die CRM-Seiten neu validieren – der öffentliche Bereich ist unberührt. */
function revalidateCrm(id?: string) {
  revalidatePath("/admin/crm");
  if (id) revalidatePath(`/admin/crm/${id}`);
}

export async function createManualCrmLead(
  raw: unknown,
): Promise<ActionResult<{ id: string; message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = crmLeadCreateSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { id } = await createCrmLead({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      type: parsed.data.type,
      source: parsed.data.source,
      message: parsed.data.message,
    });

    logger.info("CRM-Lead manuell angelegt", { userId: admin.id, leadId: id });
    revalidateCrm(id);

    return ok({ id, message: "Der Lead wurde angelegt." });
  } catch (error) {
    logger.error("CRM-Lead konnte nicht angelegt werden", { error });
    return toActionResult(error);
  }
}

export async function updateCrmLead(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = crmLeadUpdateSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const existing = await prisma.crmLead.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });

    if (!existing) {
      return fail("Dieser Lead wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    await prisma.crmLead.update({
      where: { id: parsed.data.id },
      data: {
        status: parsed.data.status,
        internalNotes: parsed.data.internalNotes,
        // Nur setzen, wenn der Kontakt ausdrücklich dokumentiert wird –
        // sonst würde jedes Speichern das Datum verfälschen.
        ...(parsed.data.markContacted ? { lastContactAt: new Date() } : {}),
      },
    });

    logger.info("CRM-Lead aktualisiert", {
      userId: admin.id,
      leadId: parsed.data.id,
    });
    revalidateCrm(parsed.data.id);

    return ok({ message: "Der Lead wurde gespeichert." });
  } catch (error) {
    logger.error("CRM-Lead konnte nicht gespeichert werden", { error });
    return toActionResult(error);
  }
}
