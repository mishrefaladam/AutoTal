"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { getFileStorage } from "@/integrations/storage";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

import { vehicleFormSchema } from "./admin-schemas";
import { buildVehicleSlug } from "./slug";

/**
 * Fahrzeugpflege im Adminbereich.
 *
 * Angelegte Fahrzeuge tragen `externalSource = "manual"`. Der Provider-Sync
 * arbeitet ausschließlich innerhalb seiner eigenen Quelle – manuelle
 * Fahrzeuge bleiben davon unberührt und können später neben einem echten
 * Anbieter bestehen.
 */

/**
 * Einzige Seite, auf der diese Fahrzeuge erscheinen.
 *
 * Seit der Umstellung auf die eingebettete willhaben-Börse tauchen die hier
 * gepflegten Fahrzeuge NICHT mehr im öffentlichen Bereich auf – sie sind nur
 * noch Datenbasis für Social Media. Den gesamten öffentlichen Baum zu
 * invalidieren wäre deshalb reine Verschwendung.
 */
function revalidateVehiclePages() {
  revalidatePath("/admin/fahrzeuge");
}

/** Stabile Kennung für ein von Hand angelegtes Fahrzeug. */
function generateManualExternalId(): string {
  return `man-${randomBytes(6).toString("hex")}`;
}

function toVehicleData(
  data: z.output<typeof vehicleFormSchema>,
  previousSoldAt: Date | null = null,
) {
  return {
    make: data.make,
    model: data.model,
    variant: data.variant,
    priceCents: data.priceEuro * 100,
    vatDeductible: data.vatDeductible,
    mileageKm: data.mileageKm,
    firstRegistration: data.firstRegistration,
    fuel: data.fuel as never,
    transmission: data.transmission as never,
    bodyType: data.bodyType as never,
    condition: data.condition as never,
    powerKw: data.powerKw,
    displacementCcm: data.displacementCcm,
    color: data.color,
    doors: data.doors,
    seats: data.seats,
    previousOwners: data.previousOwners,
    inspectionValidUntil: data.inspectionValidUntil,
    description: data.description,
    features: data.features,
    status: data.status as never,
    internalNotes: data.internalNotes,
    // Das Verkaufsdatum führt sich selbst: Es wird beim Wechsel auf SOLD
    // gesetzt und beim Zurücknehmen wieder geleert. So kann es nicht
    // widersprüchlich zum Status stehen.
    soldAt: data.status === "SOLD" ? (previousSoldAt ?? new Date()) : null,
    active: data.active,
    lastSyncedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

export async function createVehicle(
  raw: unknown,
): Promise<ActionResult<{ id: string; message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = vehicleFormSchema.safeParse(raw);
    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const externalId = generateManualExternalId();

    const vehicle = await prisma.vehicle.create({
      data: {
        ...toVehicleData(parsed.data),
        externalSource: MANUAL_SOURCE,
        externalId,
        slug: buildVehicleSlug({
          make: parsed.data.make,
          model: parsed.data.model,
          variant: parsed.data.variant,
          firstRegistration: parsed.data.firstRegistration,
          externalId,
        }),
      },
      select: { id: true },
    });

    logger.info("Fahrzeug angelegt", { vehicleId: vehicle.id, userId: admin.id });
    revalidateVehiclePages();

    return ok({
      id: vehicle.id,
      message:
        "Das Fahrzeug wurde angelegt. Laden Sie jetzt die Bilder hoch – ohne " +
        "Bild wirkt das Inserat unvollständig.",
    });
  } catch (error) {
    logger.error("Fahrzeug konnte nicht angelegt werden", { error });
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Bearbeiten
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: z.string().trim().min(1),
  values: z.unknown(),
});

export async function updateVehicle(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const outer = updateSchema.safeParse(raw);
    if (!outer.success) {
      return fail("Ungültige Anfrage.", { code: "VALIDATION" });
    }

    const parsed = vehicleFormSchema.safeParse(outer.data.values);
    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const existing = await prisma.vehicle.findUnique({
      where: { id: outer.data.id },
      select: { id: true, externalSource: true, soldAt: true },
    });

    if (!existing) {
      return fail("Dieses Fahrzeug wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    // Altbestand aus einer früheren Datenquelle bleibt schreibgeschützt:
    // Diese Datensätze wurden nie im Admin gepflegt, ihre Herkunft ist nicht
    // mehr nachvollziehbar. Statt sie halb zu bearbeiten, legt man besser ein
    // eigenes Fahrzeug an.
    if (existing.externalSource !== MANUAL_SOURCE) {
      return fail(
        `Dieses Fahrzeug stammt als Altbestand aus der Quelle ` +
          `„${existing.externalSource}“ und ist schreibgeschützt. Bitte legen ` +
          `Sie stattdessen ein neues Fahrzeug an.`,
        { code: "CONFLICT" },
      );
    }

    // Der Slug bleibt unverändert: Er ist die öffentliche URL.
    await prisma.vehicle.update({
      where: { id: outer.data.id },
      // Bereits gesetztes Verkaufsdatum durchreichen, damit es beim
      // erneuten Speichern nicht auf heute springt.
      data: toVehicleData(parsed.data, existing.soldAt),
    });

    logger.info("Fahrzeug bearbeitet", {
      vehicleId: outer.data.id,
      userId: admin.id,
    });
    revalidateVehiclePages();

    return ok({ message: "Die Änderungen wurden gespeichert." });
  } catch (error) {
    logger.error("Fahrzeug konnte nicht gespeichert werden", { error });
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Sichtbarkeit und Löschen
// ---------------------------------------------------------------------------

export async function setVehicleActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ message: string }>> {
  try {
    await requireAdminForAction();

    await prisma.vehicle.update({ where: { id }, data: { active } });
    revalidateVehiclePages();

    return ok({
      message: active
        ? "Das Fahrzeug ist wieder online."
        : "Das Fahrzeug wurde offline genommen. Der Datensatz bleibt erhalten.",
    });
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteVehicle(
  id: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, images: { select: { url: true } } },
    });

    if (!vehicle) {
      return fail("Dieses Fahrzeug wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    // Erst die Datenbank, dann die Dateien: Bleibt ein Bild im Speicher
    // zurück, ist das ein Schönheitsfehler – eine verwaiste Datenbankzeile
    // mit toten Bildlinks wäre schlimmer.
    await prisma.vehicle.delete({ where: { id } });

    const storage = getFileStorage();
    for (const image of vehicle.images) {
      await storage.remove(image.url);
    }

    logger.info("Fahrzeug gelöscht", { vehicleId: id, userId: admin.id });
    revalidateVehiclePages();

    return ok({ message: "Das Fahrzeug wurde gelöscht." });
  } catch (error) {
    logger.error("Fahrzeug konnte nicht gelöscht werden", { error });
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

export async function deleteVehicleImage(
  imageId: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    await requireAdminForAction();

    const image = await prisma.vehicleImage.findUnique({
      where: { id: imageId },
      select: { id: true, url: true, vehicleId: true },
    });

    if (!image) {
      return fail("Dieses Bild wurde nicht gefunden.", { code: "NOT_FOUND" });
    }

    await prisma.vehicleImage.delete({ where: { id: imageId } });
    await getFileStorage().remove(image.url);

    revalidateVehiclePages();
    revalidatePath(`/admin/fahrzeuge/${image.vehicleId}`);

    return ok({ message: "Das Bild wurde entfernt." });
  } catch (error) {
    return toActionResult(error);
  }
}

const reorderSchema = z.object({
  vehicleId: z.string().trim().min(1),
  imageIds: z.array(z.string().trim().min(1)).max(50),
});

/** Neue Reihenfolge der Galerie. Das erste Bild ist das Titelbild. */
export async function reorderVehicleImages(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    await requireAdminForAction();

    const parsed = reorderSchema.safeParse(raw);
    if (!parsed.success) {
      return fail("Ungültige Anfrage.", { code: "VALIDATION" });
    }

    const owned = await prisma.vehicleImage.findMany({
      where: { vehicleId: parsed.data.vehicleId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((image) => image.id));

    // Nur Bilder dieses Fahrzeugs annehmen – sonst ließen sich über eine
    // manipulierte Anfrage fremde Bilder umsortieren.
    if (!parsed.data.imageIds.every((id) => ownedIds.has(id))) {
      return fail("Die Bildreihenfolge passt nicht zum Fahrzeug.", {
        code: "VALIDATION",
      });
    }

    await prisma.$transaction(
      parsed.data.imageIds.map((id, index) =>
        prisma.vehicleImage.update({ where: { id }, data: { position: index } }),
      ),
    );

    revalidateVehiclePages();
    revalidatePath(`/admin/fahrzeuge/${parsed.data.vehicleId}`);

    return ok({ message: "Die Reihenfolge wurde gespeichert." });
  } catch (error) {
    return toActionResult(error);
  }
}
