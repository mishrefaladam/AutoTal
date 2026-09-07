"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

import { createCrmLead, deleteCrmLead, setCrmLeadArchived } from "./repository";
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
  // Ankaufsanfragen zeigen denselben Datensatz – die Ansicht muss mit.
  revalidatePath("/admin/ankauf");
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

// ---------------------------------------------------------------------------
// Archivieren und Löschen
// ---------------------------------------------------------------------------

/**
 * Erledigten Vorgang ins Archiv legen oder zurückholen.
 *
 * Bewusst der Standardweg statt des Löschens: Ein Fehlgriff kostet hier nur
 * einen zweiten Klick. Endgültig gelöscht wird nur ausdrücklich aus dem
 * Archiv heraus.
 */
export async function archiveCrmLead(
  id: string,
  archived: boolean,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const existing = await prisma.crmLead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return fail("Dieser Eintrag wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    await setCrmLeadArchived(id, archived);

    logger.info(archived ? "CRM-Lead archiviert" : "CRM-Lead zurückgeholt", {
      userId: admin.id,
      leadId: id,
    });
    revalidateCrm(id);

    return ok({
      message: archived
        ? "Der Eintrag liegt jetzt im Archiv. Sie können ihn dort jederzeit zurückholen."
        : "Der Eintrag ist wieder in der Arbeitsliste.",
    });
  } catch (error) {
    logger.error("Archivieren fehlgeschlagen", { error });
    return toActionResult(error);
  }
}

/**
 * Endgültiges Löschen.
 *
 * Nur aus dem Archiv heraus: Was gelöscht wird, ist unwiderruflich weg, und
 * dieser Schritt soll nicht versehentlich neben „Speichern“ passieren können.
 * Die Prüfung sitzt hier und nicht in der Oberfläche – auch ein direkter
 * Aufruf dieser Aktion darf sie nicht umgehen.
 *
 * Gehört eine Ankaufsanfrage dazu, verschwindet sie mit: Es ist ein Vorgang.
 */
export async function deleteCrmLeadAction(
  id: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const existing = await prisma.crmLead.findUnique({
      where: { id },
      select: { id: true, archivedAt: true },
    });

    if (!existing) {
      return fail("Dieser Eintrag wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (existing.archivedAt === null) {
      return fail(
        "Bitte legen Sie den Eintrag zuerst ins Archiv. Endgültig gelöscht " +
          "wird nur von dort aus – so kann nichts versehentlich verschwinden.",
        { code: "CONFLICT" },
      );
    }

    const { deletedInquiry } = await deleteCrmLead(id);

    // Im Protokoll steht nur die ID, nie Kundendaten – auch nicht beim
    // Löschen, wo man es am ehesten „noch schnell mitnehmen“ würde.
    logger.info("CRM-Lead endgültig gelöscht", {
      userId: admin.id,
      leadId: id,
      withPurchaseInquiry: deletedInquiry,
    });
    revalidateCrm();

    return ok({
      message: deletedInquiry
        ? "Der Eintrag wurde endgültig gelöscht – samt zugehöriger Ankaufsanfrage."
        : "Der Eintrag wurde endgültig gelöscht.",
    });
  } catch (error) {
    logger.error("Löschen fehlgeschlagen", { error });
    return toActionResult(error);
  }
}
