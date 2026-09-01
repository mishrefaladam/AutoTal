"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishImagePost } from "@/integrations/instagram";
import {
  generateInstagramCaption,
  verifyCaptionFacts,
} from "@/integrations/openai";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  type ActionResult,
  UserFacingError,
  fail,
  ok,
  toActionResult,
} from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { getCompany } from "@/modules/company/repository";
import { toFieldErrors } from "@/modules/forms/schemas";
import { getVehicleByIdIncludingInactive } from "@/modules/vehicles/repository";

/**
 * Workflow für KI-gestützte Social-Media-Beiträge (EPIC 7, EPIC 8).
 *
 *   Fahrzeug wählen -> Caption erzeugen -> bearbeiten -> freigeben -> veröffentlichen
 *
 * Zwei Regeln sind hier fest verdrahtet und nicht umgehbar:
 *
 *   1. Die KI veröffentlicht NIEMALS selbst. `generateCaption` schreibt
 *      ausschließlich einen Entwurf mit Status DRAFT. Es gibt keinen Pfad, der
 *      Generierung und Veröffentlichung in einem Schritt ausführt.
 *
 *   2. Veröffentlicht werden darf ausschließlich ein Entwurf mit Status
 *      APPROVED. Die Prüfung sitzt in `publishDraft` unmittelbar vor dem
 *      API-Aufruf – nicht in der UI, wo sie sich umgehen ließe.
 */

function revalidateSocial() {
  revalidatePath("/admin/social-media");
}

// ---------------------------------------------------------------------------
// US-19: Caption generieren
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  vehicleId: z.string().trim().min(1, "Bitte wählen Sie ein Fahrzeug aus."),
});

export async function generateCaption(
  raw: unknown,
): Promise<ActionResult<{ draftId: string; message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = generateSchema.safeParse(raw);
    if (!parsed.success) {
      return fail("Bitte wählen Sie ein Fahrzeug aus.", { code: "VALIDATION" });
    }

    const vehicle = await getVehicleByIdIncludingInactive(parsed.data.vehicleId);

    if (!vehicle) {
      return fail("Dieses Fahrzeug wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    const company = await getCompany();

    const generated = await generateInstagramCaption(vehicle, {
      displayName: company.displayName,
      city: company.city,
    });

    // Faktenprüfung: Stimmen Preis und Kilometerstand im Text nicht mit den
    // Fahrzeugdaten überein, wird der Entwurf gar nicht erst gespeichert.
    const issues = verifyCaptionFacts(generated.caption, vehicle);

    if (issues.length > 0) {
      logger.warn("Erzeugter Text enthielt abweichende Fahrzeugdaten", {
        vehicleId: vehicle.id,
        issues: issues.map((issue) => issue.field),
      });

      const details = issues
        .map(
          (issue) =>
            `${issue.field}: im Text „${issue.found}“, tatsächlich „${issue.expected}“`,
        )
        .join("; ");

      return fail(
        `Der erzeugte Text enthielt Angaben, die nicht zum Fahrzeug passen ` +
          `(${details}). Der Entwurf wurde verworfen. Bitte erneut generieren.`,
        { code: "CONFLICT" },
      );
    }

    const draft = await prisma.socialDraft.create({
      data: {
        vehicleId: vehicle.id,
        platform: "INSTAGRAM",
        // Ausdrücklich DRAFT: Freigabe und Veröffentlichung sind eigene,
        // manuelle Schritte.
        status: "DRAFT",
        caption: generated.caption,
        hashtags: generated.hashtags,
        imageUrls: vehicle.images.slice(0, 1).map((image) => image.url),
        generatedByModel: generated.model,
        generatedAt: new Date(),
      },
    });

    logger.info("Social-Entwurf erzeugt", {
      draftId: draft.id,
      userId: admin.id,
    });
    revalidateSocial();

    return ok({
      draftId: draft.id,
      message:
        "Der Entwurf wurde erstellt. Bitte prüfen und bei Bedarf bearbeiten – " +
        "veröffentlicht wird erst nach Ihrer Freigabe.",
    });
  } catch (error) {
    logger.error("Caption konnte nicht erzeugt werden", { error });
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// US-20: Caption bearbeiten
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  draftId: z.string().trim().min(1),
  caption: z
    .string()
    .trim()
    .min(10, "Der Text ist zu kurz.")
    // Instagram erlaubt 2.200 Zeichen inklusive Hashtags.
    .max(2000, "Der Text darf höchstens 2.000 Zeichen lang sein."),
  hashtags: z
    .string()
    .trim()
    .max(500, "Die Hashtags sind zu lang.")
    .transform((value) =>
      value
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#+/, "").trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
});

export async function updateDraft(
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

    const draft = await prisma.socialDraft.findUnique({
      where: { id: parsed.data.draftId },
      select: { status: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (draft.status === "PUBLISHED") {
      return fail(
        "Dieser Beitrag ist bereits veröffentlicht und kann hier nicht mehr " +
          "geändert werden. Bearbeiten Sie ihn direkt in Instagram.",
        { code: "CONFLICT" },
      );
    }

    // Nach einer Bearbeitung fällt eine bestehende Freigabe zurück auf
    // Entwurf – sonst könnte man den geprüften Text nachträglich austauschen
    // und mit alter Freigabe veröffentlichen.
    await prisma.socialDraft.update({
      where: { id: parsed.data.draftId },
      data: {
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags,
        status: "DRAFT",
        approvedAt: null,
        approvedByUser: null,
        errorMessage: null,
      },
    });

    logger.info("Social-Entwurf bearbeitet", {
      draftId: parsed.data.draftId,
      userId: admin.id,
    });
    revalidateSocial();

    return ok({
      message:
        "Die Änderungen wurden gespeichert. Der Beitrag steht wieder als " +
        "Entwurf und muss erneut freigegeben werden.",
    });
  } catch (error) {
    logger.error("Entwurf konnte nicht gespeichert werden", { error });
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// US-21: Freigeben
// ---------------------------------------------------------------------------

export async function approveDraft(
  draftId: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: { status: true, caption: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (draft.status === "PUBLISHED") {
      return fail("Dieser Beitrag ist bereits veröffentlicht.", {
        code: "CONFLICT",
      });
    }

    await prisma.socialDraft.update({
      where: { id: draftId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUser: admin.email,
        errorMessage: null,
      },
    });

    logger.info("Social-Entwurf freigegeben", { draftId, userId: admin.id });
    revalidateSocial();

    return ok({
      message: "Der Beitrag ist freigegeben und kann veröffentlicht werden.",
    });
  } catch (error) {
    logger.error("Entwurf konnte nicht freigegeben werden", { error });
    return toActionResult(error);
  }
}

/** Freigabe zurücknehmen, solange noch nicht veröffentlicht wurde. */
export async function revokeApproval(
  draftId: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: { status: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (draft.status === "PUBLISHED") {
      return fail(
        "Der Beitrag ist bereits veröffentlicht. Eine Rücknahme der Freigabe " +
          "ändert daran nichts – löschen Sie ihn bei Bedarf in Instagram.",
        { code: "CONFLICT" },
      );
    }

    await prisma.socialDraft.update({
      where: { id: draftId },
      data: { status: "DRAFT", approvedAt: null, approvedByUser: null },
    });

    logger.info("Freigabe zurückgenommen", { draftId, userId: admin.id });
    revalidateSocial();

    return ok({ message: "Die Freigabe wurde zurückgenommen." });
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// US-23 / US-24: Veröffentlichen
// ---------------------------------------------------------------------------

export async function publishDraft(
  draftId: string,
): Promise<ActionResult<{ message: string; permalink: string | null }>> {
  try {
    const admin = await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: {
        id: true,
        status: true,
        caption: true,
        hashtags: true,
        imageUrls: true,
      },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (draft.status === "PUBLISHED") {
      return fail("Dieser Beitrag wurde bereits veröffentlicht.", {
        code: "CONFLICT",
      });
    }

    // ---- Das Freigabe-Gate (US-23) -------------------------------------
    // Nur APPROVED darf raus. Bewusst hier und nicht in der UI: Auch ein
    // direkter Aufruf dieser Action kann es nicht umgehen.
    if (draft.status !== "APPROVED") {
      logger.warn("Veröffentlichung ohne Freigabe abgelehnt", {
        draftId,
        status: draft.status,
        userId: admin.id,
      });

      return fail(
        "Dieser Beitrag ist nicht freigegeben. Bitte prüfen Sie den Text und " +
          "geben Sie ihn ausdrücklich frei, bevor er veröffentlicht wird.",
        { code: "CONFLICT" },
      );
    }

    const imageUrl = draft.imageUrls[0];

    if (!imageUrl) {
      return fail(
        "Für diesen Beitrag ist kein Bild hinterlegt. Instagram benötigt " +
          "mindestens ein Bild.",
        { code: "VALIDATION" },
      );
    }

    const fullCaption = [
      draft.caption,
      draft.hashtags.length > 0
        ? `\n\n${draft.hashtags.map((tag) => `#${tag}`).join(" ")}`
        : "",
    ]
      .join("")
      .trim();

    await prisma.socialDraft.update({
      where: { id: draftId },
      data: { lastAttemptAt: new Date() },
    });

    try {
      const result = await publishImagePost({ imageUrl, caption: fullCaption });

      await prisma.socialDraft.update({
        where: { id: draftId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          externalPostId: result.postId,
          externalPermalink: result.permalink,
          errorMessage: null,
        },
      });

      logger.info("Beitrag veröffentlicht", { draftId, userId: admin.id });
      revalidateSocial();

      return ok({
        message: "Der Beitrag wurde auf Instagram veröffentlicht.",
        permalink: result.permalink,
      });
    } catch (error) {
      // US-24: Fehlschlag sichtbar machen und erneuten Versuch ermöglichen.
      const message =
        error instanceof UserFacingError
          ? error.message
          : "Die Veröffentlichung ist fehlgeschlagen. Bitte versuchen Sie es erneut.";

      await prisma.socialDraft.update({
        where: { id: draftId },
        data: {
          status: "FAILED",
          errorMessage: message,
          retryCount: { increment: 1 },
        },
      });

      logger.error("Veröffentlichung fehlgeschlagen", { draftId, error });
      revalidateSocial();

      return fail(message, {
        code: error instanceof UserFacingError ? error.code : "SERVICE_UNAVAILABLE",
      });
    }
  } catch (error) {
    logger.error("Veröffentlichung konnte nicht gestartet werden", { error });
    return toActionResult(error);
  }
}

/**
 * Erneuter Versuch nach einem Fehlschlag (US-24).
 *
 * Setzt den Entwurf zurück auf APPROVED – die Freigabe bleibt bestehen, denn
 * am Text hat sich nichts geändert – und veröffentlicht erneut.
 */
export async function retryPublish(
  draftId: string,
): Promise<ActionResult<{ message: string; permalink: string | null }>> {
  try {
    await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: { status: true, approvedAt: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    if (draft.status !== "FAILED") {
      return fail(
        "Ein erneuter Versuch ist nur nach einem fehlgeschlagenen Versuch möglich.",
        { code: "CONFLICT" },
      );
    }

    if (!draft.approvedAt) {
      return fail(
        "Dieser Beitrag wurde nie freigegeben. Bitte geben Sie ihn zuerst frei.",
        { code: "CONFLICT" },
      );
    }

    await prisma.socialDraft.update({
      where: { id: draftId },
      data: { status: "APPROVED", errorMessage: null },
    });

    return publishDraft(draftId);
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteDraft(
  draftId: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: { status: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    await prisma.socialDraft.delete({ where: { id: draftId } });

    logger.info("Social-Entwurf gelöscht", { draftId, userId: admin.id });
    revalidateSocial();

    return ok({
      message:
        draft.status === "PUBLISHED"
          ? "Der Eintrag wurde aus der Übersicht entfernt. Der Beitrag bleibt auf Instagram bestehen."
          : "Der Entwurf wurde gelöscht.",
    });
  } catch (error) {
    return toActionResult(error);
  }
}
