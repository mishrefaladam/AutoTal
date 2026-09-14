"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE,
  checkInstagramMediaExists,
  publishImagePost,
} from "@/integrations/instagram";
import { verifyCaptionFacts } from "@/integrations/openai";
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
import { toFieldErrors } from "@/modules/forms/schemas";
import { getVehicleByIdIncludingInactive } from "@/modules/vehicles/repository";

import {
  CAPTION_TEMPLATE_ID,
  buildInstagramCaption,
  buildInstagramHashtags,
} from "./caption";
import { imageUnreachable } from "./image-reachability";
import type { PublishHooks } from "./publish-hooks";
import {
  EXTERNALLY_DELETED_NOTICE,
  reconcilePublishedDraft,
} from "./reconcile";
import {
  INSTAGRAM_MAX_IMAGES,
  defaultInstagramImages,
  orderSelectedImages,
  planInstagramImages,
} from "./publish-images";

/**
 * Workflow für Social-Media-Beiträge (EPIC 7, EPIC 8).
 *
 *   Fahrzeug wählen -> Caption erzeugen -> bearbeiten -> freigeben -> veröffentlichen
 *
 * Der Text entsteht aus der AutoTal-Vorlage (./caption.ts), nicht aus der KI:
 * Nach Rücksprache mit dem Kunden ist er bis auf vier Fahrzeugwerte fest.
 * Die OpenAI-Anbindung bleibt für andere Funktionen erhalten.
 *
 * Zwei Regeln sind hier fest verdrahtet und nicht umgehbar:
 *
 *   1. Es wird NIEMALS automatisch veröffentlicht. `generateCaption` schreibt
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

const INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER =
  "__instagram_publish_in_progress__";
const INSTAGRAM_PUBLISH_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Ein auf Instagram gelöschter Beitrag trägt noch seine alte Media-ID – den
 * Idempotenz-Schlüssel. Bearbeiten, Freigeben oder direktes Veröffentlichen
 * würden ihn über den externalPostId-Kurzschluss als "veröffentlicht"
 * wiederbeleben. Der einzige Weg zurück ist `republishDeletedDraft`, das
 * die Löschung erneut bestätigt und die alte ID kontrolliert ablegt.
 */
const DELETED_EXTERNALLY_MESSAGE =
  "Dieser Beitrag wurde auf Instagram gelöscht. Veröffentlichen Sie ihn über " +
  "\u201eErneut veröffentlichen\u201c neu oder entfernen Sie ihn aus AutoTal.";

function deletedExternally(status: string) {
  return status === "DELETED_EXTERNALLY"
    ? fail(DELETED_EXTERNALLY_MESSAGE, { code: "CONFLICT" })
    : null;
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

    // Vorlage statt KI: Name, Kilometer, Baujahr, PS – mehr braucht der
    // Beitrag nicht, und mehr wird auch nicht gelesen. Fehlende Werte lassen
    // ihre Zeile weg.
    const generated = {
      caption: buildInstagramCaption(vehicle),
      hashtags: buildInstagramHashtags(vehicle),
      model: CAPTION_TEMPLATE_ID,
    };

    // Faktenprüfung bleibt als Sicherheitsnetz: Sie prüft den Text gegen die
    // Fahrzeugdaten, gleich woher er stammt.
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
        // Vehicle DTO images are already sorted by VehicleImage.position.
        imageUrls: defaultInstagramImages(
          vehicle.images.map((image, position) => ({ url: image.url, position })),
        ),
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
  /**
   * Ausgewählte Fahrzeugbilder – als URLs, in beliebiger Reihenfolge; die
   * Reihenfolge des Beitrags bestimmt später die Galerie des Fahrzeugs.
   * Fehlt das Feld (ältere Oberfläche), bleibt die Auswahl unverändert.
   */
  imageUrls: z
    .array(z.string().url().max(2048))
    .max(INSTAGRAM_MAX_IMAGES, `Instagram erlaubt höchstens ${INSTAGRAM_MAX_IMAGES} Bilder je Beitrag.`)
    .optional(),
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
      select: {
        status: true,
        vehicle: { select: { images: { select: { url: true } } } },
      },
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
    const deleted = deletedExternally(draft.status);
    if (deleted) return deleted;

    // Nur Bilder dieses Fahrzeugs – eine fremde URL hat hier nichts verloren.
    if (parsed.data.imageUrls) {
      const own = new Set(draft.vehicle.images.map((image) => image.url));
      const foreign = parsed.data.imageUrls.find((url) => !own.has(url));
      if (foreign) {
        return fail("Eines der gewählten Bilder gehört nicht zu diesem Fahrzeug.", {
          code: "VALIDATION",
        });
      }
    }

    // Nach einer Bearbeitung fällt eine bestehende Freigabe zurück auf
    // Entwurf – sonst könnte man den geprüften Text nachträglich austauschen
    // und mit alter Freigabe veröffentlichen.
    await prisma.socialDraft.update({
      where: { id: parsed.data.draftId },
      data: {
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags,
        ...(parsed.data.imageUrls ? { imageUrls: parsed.data.imageUrls } : {}),
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
    const deleted = deletedExternally(draft.status);
    if (deleted) return deleted;

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
    const deleted = deletedExternally(draft.status);
    if (deleted) return deleted;

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
  hooks: PublishHooks = {},
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
        externalPostId: true,
        externalPermalink: true,
        errorMessage: true,
        lastAttemptAt: true,
        // Der Entwurf hält den Bildstand vom Zeitpunkt der Generierung fest.
        // Da ein Text auch ohne Bild erzeugt werden darf, muss ein danach
        // hochgeladenes Bild den Entwurf noch erreichen – sonst bliebe er
        // dauerhaft unveröffentlichbar.
        vehicle: {
          select: {
            images: {
              orderBy: { position: "asc" },
              select: { url: true },
            },
          },
        },
      },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    // Vor dem Kurzschluss: Ein extern gelöschter Beitrag hat noch seine alte
    // Media-ID, darf aber nicht als "bereits veröffentlicht" gelten.
    const deleted = deletedExternally(draft.status);
    if (deleted) return deleted;

    // Eine bereits gespeicherte Instagram Media ID ist der dauerhafte
    // Idempotenz-Schluessel. Auch nach einem lokalen Folgefehler wird niemals
    // ein zweiter Publish-Aufruf gesendet.
    if (draft.externalPostId) {
      await prisma.socialDraft.update({
        where: { id: draftId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
      revalidateSocial();

      return ok({
        message: "Der Beitrag wurde bereits auf Instagram veröffentlicht.",
        permalink: draft.externalPermalink,
      });
    }

    if (draft.errorMessage === INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER) {
      const attemptAge = draft.lastAttemptAt
        ? Date.now() - draft.lastAttemptAt.getTime()
        : Number.POSITIVE_INFINITY;

      if (attemptAge <= INSTAGRAM_PUBLISH_LOCK_TIMEOUT_MS) {
        return fail(
          "Die Instagram-Veröffentlichung läuft bereits. Bitte warten Sie " +
            "einen Moment.",
          { code: "CONFLICT" },
        );
      }

      // Nach einem abgebrochenen Serverprozess ist unklar, ob Meta den
      // Publish-Aufruf verarbeitet hat. Kein automatischer Neuversuch.
      await prisma.socialDraft.updateMany({
        where: {
          id: draftId,
          status: "APPROVED",
          errorMessage: INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER,
        },
        data: {
          status: "FAILED",
          errorMessage: INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE,
        },
      });
      revalidateSocial();
      return fail(INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE, {
        code: "CONFLICT",
      });
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

    // ---- Das Bild-Gate ---------------------------------------------------
    // Instagram verlangt mindestens ein Bild. Die Prüfung sitzt bewusst hier
    // und nicht nur in der UI: Auch ein direkter Aufruf dieser Action kommt
    // ohne Bild nicht durch.
    //
    // Ausgewählt ist, was der Entwurf gespeichert hat; fehlt eine Auswahl,
    // gilt das Titelbild. Die Reihenfolge kommt aus der Galerie: Sortiert der
    // Händler dort um, folgt der Beitrag. Inzwischen gelöschte Bilder fallen
    // weg. Ein Bild -> Einzelbild, zwei bis zehn -> Carousel.
    const galleryUrls = draft.vehicle.images.map((image) => image.url);
    const savedSelection = orderSelectedImages(draft.imageUrls, galleryUrls);
    const selectedUrls =
      savedSelection.length > 0 ? savedSelection : galleryUrls.slice(0, 1);
    const imagePlan = planInstagramImages(selectedUrls, galleryUrls);

    if (!imagePlan.ok) {
      return fail(
        galleryUrls.length === 0
          ? "Für dieses Fahrzeug ist kein Bild hinterlegt. Der Text bleibt " +
              "erhalten; die Veröffentlichung auf Instagram ist erst nach dem " +
              "Bild-Upload beim Fahrzeug möglich."
          : imagePlan.message,
        { code: "VALIDATION" },
      );
    }
    const imageUrls = imagePlan.imageUrls;

    // Erreichbar? Instagram holt die Bilder selbst ab – ein gelöschtes Blob
    // oder ein privater Store scheitert dort erst nach dem Container-Aufruf,
    // mit einer unklaren Meldung. Hier heißt es "Bild 2 von 4". Die HEADs
    // laufen gleichzeitig – zehn nacheinander wären eine halbe Sekunde
    // Wartezeit, die niemandem nützt; gemeldet wird das erste Bild in
    // Beitragsreihenfolge.
    const reachability = await Promise.all(imageUrls.map((url) => imageUnreachable(url)));
    const unreachableIndex = reachability.findIndex((problem) => problem !== null);
    if (unreachableIndex >= 0) {
      return fail(
        `Bild ${unreachableIndex + 1} von ${imageUrls.length} ist für Instagram nicht ` +
          `erreichbar (${reachability[unreachableIndex]}). Bitte prüfen Sie die Fahrzeugbilder.`,
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

    const attemptStartedAt = new Date();
    const claimed = await prisma.socialDraft.updateMany({
      where: {
        id: draftId,
        status: "APPROVED",
        externalPostId: null,
        errorMessage: draft.errorMessage,
        lastAttemptAt: draft.lastAttemptAt,
      },
      data: {
        errorMessage: INSTAGRAM_PUBLISH_IN_PROGRESS_MARKER,
        lastAttemptAt: attemptStartedAt,
      },
    });

    if (claimed.count !== 1) {
      return fail(
        "Die Instagram-Veröffentlichung wurde bereits gestartet. Bitte " +
          "warten Sie einen Moment.",
        { code: "CONFLICT" },
      );
    }

    try {
      const result = await publishImagePost(
        { imageUrls, caption: fullCaption },
        {
          publishedMediaId: draft.externalPostId,
          publishedPermalink: draft.externalPermalink,
          onPhase: hooks.onPhase,
          onPublished: async (postId) => {
            // Direkt nach Metas erfolgreicher Antwort persistieren, noch vor
            // der optionalen Permalink-Abfrage und der finalen Statuspflege.
            await prisma.socialDraft.update({
              where: { id: draftId },
              data: { externalPostId: postId },
            });
          },
        },
      );

      await prisma.socialDraft.update({
        where: { id: draftId },
        data: {
          status: "PUBLISHED",
          // Festhalten, was tatsächlich veröffentlicht wurde – in der
          // Reihenfolge, die an Instagram ging.
          imageUrls,
          publishedAt: new Date(),
          externalPostId: result.postId ?? undefined,
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
        code:
          error instanceof UserFacingError
            ? error.code
            : "SERVICE_UNAVAILABLE",
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
  hooks: PublishHooks = {},
): Promise<ActionResult<{ message: string; permalink: string | null }>> {
  try {
    await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: {
        status: true,
        approvedAt: true,
        errorMessage: true,
        externalPostId: true,
      },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    const deleted = deletedExternally(draft.status);
    if (deleted) return deleted;

    if (draft.externalPostId) return publishDraft(draftId, hooks);

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

    if (draft.errorMessage === INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE) {
      return fail(INSTAGRAM_PUBLISH_OUTCOME_UNKNOWN_MESSAGE, {
        code: "CONFLICT",
      });
    }

    const reset = await prisma.socialDraft.updateMany({
      where: {
        id: draftId,
        status: "FAILED",
        externalPostId: null,
        errorMessage: draft.errorMessage,
      },
      data: { status: "APPROVED", errorMessage: null },
    });

    if (reset.count !== 1) {
      return fail(
        "Ein anderer Veröffentlichungsversuch wurde bereits gestartet.",
        { code: "CONFLICT" },
      );
    }

    return publishDraft(draftId, hooks);
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Abgleich mit Instagram: gelöschte Beiträge erkennen, erneut veröffentlichen
// ---------------------------------------------------------------------------

/**
 * "Instagram-Status prüfen": sofortiger Abgleich eines einzelnen Beitrags,
 * ohne die Drosselung des Seitenaufrufs. Nur ein eindeutiges "nicht
 * vorhanden" ändert den Status; alles andere wird als Meldung zurückgegeben.
 */
export async function checkInstagramStatus(
  draftId: string,
): Promise<ActionResult<{ message: string; state: "published" | "deleted" }>> {
  try {
    await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: { status: true, externalPostId: true, externalPermalink: true },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }
    if (draft.status === "DELETED_EXTERNALLY") {
      return ok({ message: EXTERNALLY_DELETED_NOTICE, state: "deleted" });
    }
    if (draft.status !== "PUBLISHED" || !draft.externalPostId) {
      return fail("Nur veröffentlichte Beiträge lassen sich mit Instagram abgleichen.", {
        code: "CONFLICT",
      });
    }

    const outcome = await reconcilePublishedDraft({
      id: draftId,
      externalPostId: draft.externalPostId,
      externalPermalink: draft.externalPermalink,
    });
    revalidateSocial();

    if (outcome.state === "published") {
      return ok({ message: "Der Beitrag ist weiterhin auf Instagram online.", state: "published" });
    }
    if (outcome.state === "deleted") {
      return ok({ message: EXTERNALLY_DELETED_NOTICE, state: "deleted" });
    }
    return fail(outcome.message, {
      code:
        outcome.reason === "unauthorized"
          ? "UNAUTHORIZED"
          : outcome.reason === "rate-limited"
            ? "RATE_LIMITED"
            : "SERVICE_UNAVAILABLE",
    });
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Erneut veröffentlichen nach bestätigter Löschung auf Instagram.
 *
 * DOPPELPOST-SCHUTZ: Die alte Media-ID blockiert jede Veröffentlichung, bis
 * zweierlei feststeht – der Beitrag steht lokal auf DELETED_EXTERNALLY, und
 * Instagram bestätigt in diesem Moment noch einmal, dass das Medium fehlt.
 * Erst dann wandert die alte ID nach `previousExternalPostIds` (nichts geht
 * verloren), der Entwurf fällt auf APPROVED zurück – die Freigabe des
 * unveränderten Textes gilt weiter – und `publishDraft` läuft den normalen
 * Weg mit Sperre und sofortiger Persistierung der neuen ID.
 *
 * Meldet Instagram, der Beitrag existiere doch, wird er wieder PUBLISHED.
 */
export async function republishDeletedDraft(
  draftId: string,
  hooks: PublishHooks = {},
): Promise<ActionResult<{ message: string; permalink: string | null }>> {
  try {
    const admin = await requireAdminForAction();

    const draft = await prisma.socialDraft.findUnique({
      where: { id: draftId },
      select: {
        status: true,
        approvedAt: true,
        externalPostId: true,
        externalPermalink: true,
        previousExternalPostIds: true,
      },
    });

    if (!draft) {
      return fail("Dieser Entwurf wurde nicht gefunden.", { code: "NOT_FOUND" });
    }
    if (draft.status !== "DELETED_EXTERNALLY" || !draft.externalPostId) {
      return fail(
        "Erneut veröffentlichen ist nur für Beiträge möglich, die auf Instagram " +
          "gelöscht wurden.",
        { code: "CONFLICT" },
      );
    }
    if (!draft.approvedAt) {
      return fail(
        "Dieser Beitrag wurde nie freigegeben. Bitte geben Sie ihn zuerst frei.",
        { code: "CONFLICT" },
      );
    }

    // Zweite Bestätigung – direkt vor dem Ablegen der alten ID.
    const existence = await checkInstagramMediaExists(draft.externalPostId);
    if (existence.state === "exists") {
      await prisma.socialDraft.updateMany({
        where: { id: draftId, status: "DELETED_EXTERNALLY", externalPostId: draft.externalPostId },
        data: {
          status: "PUBLISHED",
          externalCheckedAt: new Date(),
          ...(existence.permalink ? { externalPermalink: existence.permalink } : {}),
        },
      });
      revalidateSocial();
      return fail(
        "Der Beitrag ist auf Instagram doch noch vorhanden und wurde wieder als " +
          "veröffentlicht markiert.",
        { code: "CONFLICT" },
      );
    }
    if (existence.state === "unknown") {
      return fail(existence.message, {
        code:
          existence.reason === "unauthorized"
            ? "UNAUTHORIZED"
            : existence.reason === "rate-limited"
              ? "RATE_LIMITED"
              : "SERVICE_UNAVAILABLE",
      });
    }

    const released = await prisma.socialDraft.updateMany({
      where: { id: draftId, status: "DELETED_EXTERNALLY", externalPostId: draft.externalPostId },
      data: {
        status: "APPROVED",
        externalPostId: null,
        externalPermalink: null,
        externalCheckedAt: null,
        previousExternalPostIds: [...draft.previousExternalPostIds, draft.externalPostId],
        errorMessage: null,
      },
    });

    if (released.count !== 1) {
      return fail("Der Beitrag wurde inzwischen verändert. Bitte laden Sie die Seite neu.", {
        code: "CONFLICT",
      });
    }

    logger.info("Instagram-Beitrag zur erneuten Veröffentlichung freigegeben", {
      draftId,
      userId: admin.id,
      previousPostId: draft.externalPostId,
    });

    return publishDraft(draftId, hooks);
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
          : draft.status === "DELETED_EXTERNALLY"
            ? "Der Eintrag wurde aus AutoTal entfernt."
            : "Der Entwurf wurde gelöscht.",
    });
  } catch (error) {
    return toActionResult(error);
  }
}
