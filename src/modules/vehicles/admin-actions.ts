"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MANUAL_SOURCE, isEditableSource } from "@/modules/vehicles/constants";
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
    stockNumber: data.stockNumber,
    vin: data.vin,
    priceCents: data.priceEuro * 100,
    listPriceCents: data.listPriceEuro === null ? null : data.listPriceEuro * 100,
    vatDeductible: data.vatDeductible,
    mileageKm: data.mileageKm,
    firstRegistration: data.firstRegistration,
    // `null` heißt hier "keine Angabe" und wird auch so gespeichert.
    fuel: data.fuel as never,
    transmission: data.transmission as never,
    drivetrain: data.drivetrain as never,
    bodyType: data.bodyType as never,
    condition: data.condition as never,
    powerKw: data.powerKw,
    displacementCcm: data.displacementCcm,
    grossWeightKg: data.grossWeightKg,
    color: data.color,
    doors: data.doors,
    seats: data.seats,
    previousOwners: data.previousOwners,
    inspectionValidUntil: data.inspectionValidUntil,
    nationalCode: data.nationalCode,
    vehicleType: data.vehicleType,
    daysInStock: data.daysInStock,
    description: data.description,
    features: data.features,
    extras: data.extras,
    highlights: [],
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

    // Altbestand aus der früheren, abgeschalteten Datenquelle bleibt
    // schreibgeschützt: Diese Datensätze wurden nie im Admin gepflegt und ihre
    // Herkunft ist nicht mehr nachvollziehbar.
    //
    // Fahrzeuge aus dem CSV-Bestandsimport sind ausdrücklich NICHT gemeint.
    // Der Import ist kein Sync – er überschreibt nur die Felder seiner Datei
    // und lässt alles Gepflegte stehen. Sie hier zu sperren hieße, den halben
    // Bestand unbearbeitbar zu machen.
    if (!isEditableSource(existing.externalSource)) {
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

/**
 * Löscht alle Fahrzeuge, die der Bestandsimport als fehlend markiert hat und
 * die seither niemand angefasst hat.
 *
 * WOZU: Ein Import mit der falschen Datei – etwa dem vollständigen Bestand
 * statt nur der inserierten Fahrzeuge – legt auf einen Schlag Dutzende
 * Datensätze an, die nicht auf die Website gehören. Sie einzeln zu löschen
 * heißt Dutzende Male tippen und bestätigen. Der nächste Import mit der
 * richtigen Datei markiert sie als fehlend; diese Aktion räumt sie dann in
 * einem Schritt weg.
 *
 * SCHUTZ: Gelöscht wird nur, was ausschließlich aus dem Import stammt – ohne
 * Bilder, ohne Beschreibung, ohne Beiträge. Sobald jemand ein Fahrzeug
 * bearbeitet hat, bleibt es stehen und wird benannt: Ein verkauftes Fahrzeug
 * mit veröffentlichtem Instagram-Beitrag ist kein Versehen, sondern Historie.
 *
 * Weil die Löschmenge keine Bilder enthält, ist auch kein Aufräumen im
 * Dateispeicher nötig.
 */
export async function deleteMissingImportedVehicles(): Promise<
  ActionResult<{ message: string; deleted: number; kept: string[] }>
> {
  try {
    const admin = await requireAdminForAction();

    const candidates = await prisma.vehicle.findMany({
      where: {
        importedAt: { not: null },
        missingSinceImportAt: { not: null },
      },
      select: {
        id: true,
        make: true,
        model: true,
        variant: true,
        description: true,
        _count: { select: { images: true, socialDrafts: true } },
      },
      orderBy: [{ make: "asc" }, { model: "asc" }],
    });

    const untouched = candidates.filter(
      (vehicle) =>
        vehicle._count.images === 0 &&
        vehicle._count.socialDrafts === 0 &&
        vehicle.description.trim() === "",
    );
    const kept = candidates
      .filter((vehicle) => !untouched.includes(vehicle))
      .map((vehicle) =>
        [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(" "),
      );

    if (untouched.length > 0) {
      await prisma.vehicle.deleteMany({
        where: { id: { in: untouched.map((vehicle) => vehicle.id) } },
      });
    }

    logger.info("Fehlende Importfahrzeuge gelöscht", {
      userId: admin.id,
      deleted: untouched.length,
      kept: kept.length,
    });
    revalidateVehiclePages();

    const message =
      untouched.length === 0
        ? "Es gab nichts zu löschen."
        : untouched.length === 1
          ? "1 Fahrzeug wurde gelöscht."
          : `${untouched.length} Fahrzeuge wurden gelöscht.`;

    return ok({ message, deleted: untouched.length, kept });
  } catch (error) {
    logger.error("Fehlende Importfahrzeuge konnten nicht gelöscht werden", {
      error,
    });
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
