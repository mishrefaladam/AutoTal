import "server-only";

import { randomBytes } from "node:crypto";

import { getFileStorage } from "@/integrations/storage";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

import { decodeCsv, parseVehicleCsv, type ParsedCsv } from "./csv-import";
import { mergeEquipment } from "./equipment";
import {
  planEnrichment,
  resolveEnrichmentDecisions,
  type EnrichmentDecision,
  type EnrichmentPlan,
  type EnrichmentTarget,
} from "./import-enrichment";
import {
  IMPORT_SOURCE,
  planVehicleImport,
  type ExistingVehicle,
  type ImportPlan,
  type PlannedCreate,
} from "./import-plan";
import {
  extractImages,
  isEncrypted,
  looksLikePdf,
  parsePdfObjects,
  type PdfObject,
} from "./price-sheet";
import { buildVehicleSlug, buildVehicleTitle } from "./slug";
import {
  isVehicleListPdf,
  parseVehicleListObjects,
  type VehicleListPdf,
} from "./vehicle-list-pdf";

/**
 * Ausführung des CSV-Bestandsimports.
 *
 * Hier – und nur hier – wird geschrieben. Einlesen (`csv-import.ts`) und
 * Planen (`import-plan.ts`) sind reine Funktionen.
 *
 * Der Import ist bewusst zurückhaltend: Er legt an, aktualisiert fachliche
 * Felder und setzt Zeitstempel. Er löscht nichts, ändert keinen Verkaufsstatus
 * und nimmt kein Fahrzeug offline. Fehlt ein Fahrzeug in der Datei, wird es
 * ausschließlich markiert – die Entscheidung trifft der Händler.
 *
 * Optional ergänzt eine Fahrzeuglisten-PDF (vehicle-list-pdf.ts) den
 * Bestand: Leistung, Hubraum, Antrieb, Farbe, Foto. Sie legt nichts an. Was
 * sie ändert, hat der Händler im Review gesehen und bestätigt
 * (import-enrichment.ts).
 */

/** Fahrzeuglisten-PDFs sind bildlastig; 25 MB decken drei Seiten mit Fotos. */
export const MAX_LIST_PDF_BYTES = 25 * 1024 * 1024;

/** 2 MB reichen für mehrere tausend Zeilen und begrenzen den Speicherbedarf. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Mehr Zeilen deuten auf eine falsche Datei hin, nicht auf einen Bestand. */
export const MAX_CSV_ROWS = 5000;

const ALLOWED_EXTENSIONS = [".csv", ".txt"];

/**
 * Erlaubte MIME-Typen.
 *
 * Browser und Betriebssysteme melden für CSV höchst unterschiedliche Typen –
 * Windows mit installiertem Excel etwa `application/vnd.ms-excel`. Deshalb
 * zählt zusätzlich die Dateiendung, und maßgeblich ist am Ende ohnehin, ob
 * sich der Inhalt als Tabelle mit den Pflichtspalten lesen lässt.
 */
const ALLOWED_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "",
];

export type ImportPreview = {
  fileName: string;
  parsed: ParsedCsv;
  plan: ImportPlan;
  /** Nur mit hochgeladener Fahrzeuglisten-PDF. */
  enrichment: {
    fileName: string;
    list: VehicleListPdf;
    plan: EnrichmentPlan;
    /** Die geparsten PDF-Objekte – beim Bestätigen werden daraus die Fotos gelesen. */
    objects: Map<number, PdfObject>;
    warnings: string[];
  } | null;
};

export type ImportOutcome = {
  fileName: string;
  created: number;
  updated: number;
  unchanged: number;
  /** Neu als fehlend markiert – ohne jede weitere Änderung. */
  markedMissing: number;
  /** Zuvor als fehlend markiert und in dieser Datei wieder enthalten. */
  reappeared: number;
  skipped: number;
  rowErrors: number;
  inactive: number;
  /** Aus der Fahrzeuglisten-PDF ergänzte Fahrzeuge und gespeicherte Fotos. */
  enriched: number;
  imagesStored: number;
};

/** Dateiname für die Herkunftsangabe entschärfen und kürzen. */
function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "import.csv";
  return base.replace(/[^\w.\- ]/g, "").slice(0, 120) || "import.csv";
}

/**
 * Datei prüfen und einlesen.
 *
 * Wirft `UserFacingError` – die Meldungen sind für den Admin formuliert und
 * enthalten keine internen Details.
 */
export async function readCsvFile(
  file: File,
): Promise<{ fileName: string; text: string }> {
  const fileName = safeFileName(file.name);
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new UserFacingError(
      "Bitte eine CSV-Datei auswählen. Excel-Dateien (.xlsx) müssen zuvor " +
        "als CSV exportiert werden.",
      "VALIDATION",
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UserFacingError(
      "Dieser Dateityp wird nicht angenommen. Bitte eine CSV-Datei auswählen.",
      "VALIDATION",
    );
  }

  if (file.size === 0) {
    throw new UserFacingError("Die Datei ist leer.", "VALIDATION");
  }

  if (file.size > MAX_CSV_BYTES) {
    throw new UserFacingError(
      `Die Datei ist zu groß (maximal ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB).`,
      "VALIDATION",
    );
  }

  const text = decodeCsv(new Uint8Array(await file.arrayBuffer()));

  return { fileName, text };
}

/** Einlesen und planen, ohne zu schreiben. */
export async function buildImportPreview(
  file: File,
  listPdf: File | null = null,
): Promise<ImportPreview> {
  const { fileName, text } = await readCsvFile(file);
  const parsed = parseVehicleCsv(text);

  if (parsed.totalDataRows > MAX_CSV_ROWS) {
    throw new UserFacingError(
      `Die Datei enthält ${parsed.totalDataRows} Zeilen. Es werden höchstens ` +
        `${MAX_CSV_ROWS} verarbeitet – bitte prüfen Sie, ob die richtige Datei ` +
        `ausgewählt ist.`,
      "VALIDATION",
    );
  }

  const existing = await loadExistingVehicles();
  const plan = planVehicleImport({ rows: parsed.rows, existing });

  const enrichment = listPdf
    ? await buildEnrichmentPreview(listPdf, plan, existing)
    : null;

  return { fileName, parsed, plan, enrichment };
}

// ---------------------------------------------------------------------------
// Fahrzeuglisten-PDF
// ---------------------------------------------------------------------------

/**
 * Ziele der Ergänzung: der Bestand, wie er nach dem CSV-Import aussieht –
 * bestehende Fahrzeuge mit den CSV-Werten und die neu anzulegenden Zeilen.
 */
function enrichmentTargets(plan: ImportPlan, existing: ExistingVehicle[]): EnrichmentTarget[] {
  const byId = new Map(existing.map((vehicle) => [vehicle.id, vehicle]));
  const targets: EnrichmentTarget[] = [];

  for (const entry of [...plan.updates, ...plan.unchanged]) {
    const vehicle = byId.get(entry.id);
    if (!vehicle) continue;
    targets.push({
      ref: { kind: "existing", id: entry.id },
      title: entry.title,
      make: entry.values.make,
      model: entry.values.model,
      variant: vehicle.variant ?? null,
      firstRegistration: entry.values.firstRegistration,
      mileageKm: entry.values.mileageKm,
      priceCents: entry.values.priceCents,
      powerKw: vehicle.powerKw ?? null,
      displacementCcm: vehicle.displacementCcm ?? null,
      color: entry.values.color,
      drivetrain: vehicle.drivetrain ?? null,
      vin: entry.vin,
      stockNumber: entry.stockNumber,
      imageCount: vehicle.imageCount ?? 0,
    });
  }

  // Fahrzeuge, die die CSV nicht enthält, können trotzdem ergänzt werden –
  // etwa wenn die PDF aktueller ist als die CSV.
  const inPlan = new Set(targets.map((t) => (t.ref as { id: string }).id));
  for (const vehicle of existing) {
    if (inPlan.has(vehicle.id)) continue;
    targets.push({
      ref: { kind: "existing", id: vehicle.id },
      title: vehicle.title,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant ?? null,
      firstRegistration: vehicle.firstRegistration,
      mileageKm: vehicle.mileageKm,
      priceCents: vehicle.priceCents,
      powerKw: vehicle.powerKw ?? null,
      displacementCcm: vehicle.displacementCcm ?? null,
      color: vehicle.color,
      drivetrain: vehicle.drivetrain ?? null,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      imageCount: vehicle.imageCount ?? 0,
    });
  }

  for (const create of plan.creates) {
    targets.push({
      ref: { kind: "create", line: create.line },
      title: buildVehicleTitle(create.values),
      make: create.values.make,
      model: create.values.model,
      variant: null,
      firstRegistration: create.values.firstRegistration,
      mileageKm: create.values.mileageKm,
      priceCents: create.values.priceCents,
      powerKw: null,
      displacementCcm: null,
      color: create.values.color,
      drivetrain: null,
      vin: create.vin,
      stockNumber: create.stockNumber,
      imageCount: 0,
    });
  }

  return targets;
}

async function buildEnrichmentPreview(
  file: File,
  plan: ImportPlan,
  existing: ExistingVehicle[],
): Promise<NonNullable<ImportPreview["enrichment"]>> {
  if (file.size > MAX_LIST_PDF_BYTES) {
    throw new UserFacingError(
      "Die Fahrzeuglisten-PDF ist größer als 25 MB. Bitte prüfen Sie, ob die " +
        "richtige Datei ausgewählt ist.",
      "VALIDATION",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw new UserFacingError("Die zweite Datei ist keine PDF-Datei.", "VALIDATION");
  }
  if (isEncrypted(bytes)) {
    throw new UserFacingError(
      "Die Fahrzeuglisten-PDF ist verschlüsselt und kann nicht gelesen werden.",
      "VALIDATION",
    );
  }

  const objects = parsePdfObjects(bytes);
  if (!isVehicleListPdf(objects)) {
    throw new UserFacingError(
      "Die PDF ist keine Fahrzeugliste („Unser Fahrzeugbestand vom …“). Ein " +
        "einzelnes Preisblatt laden Sie bitte direkt beim jeweiligen Fahrzeug hoch.",
      "VALIDATION",
    );
  }

  const list = parseVehicleListObjects(objects);
  const enrichmentPlan = planEnrichment(list.cards, enrichmentTargets(plan, existing));

  return {
    fileName: file.name,
    list,
    plan: enrichmentPlan,
    objects,
    warnings: list.warnings,
  };
}

/** Bestand in der Form laden, die der Planer braucht. */
async function loadExistingVehicles(): Promise<ExistingVehicle[]> {
  const rows = await prisma.vehicle.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      variant: true,
      features: true,
      highlights: true,
      color: true,
      stockNumber: true,
      vin: true,
      priceCents: true,
      listPriceCents: true,
      mileageKm: true,
      firstRegistration: true,
      daysInStock: true,
      importFingerprint: true,
      importedAt: true,
      missingSinceImportAt: true,
      // Für die Ergänzung aus der Fahrzeuglisten-PDF.
      powerKw: true,
      displacementCcm: true,
      drivetrain: true,
      _count: { select: { images: true } },
    },
  });

  return rows.map((row) => ({
    features: mergeEquipment(row.features, row.highlights),
    variant: row.variant,
    powerKw: row.powerKw,
    displacementCcm: row.displacementCcm,
    drivetrain: row.drivetrain,
    imageCount: row._count.images,
    id: row.id,
    title: buildVehicleTitle(row),
    stockNumber: row.stockNumber,
    vin: row.vin,
    make: row.make,
    model: row.model,
    color: row.color,
    priceCents: row.priceCents,
    listPriceCents: row.listPriceCents,
    mileageKm: row.mileageKm,
    firstRegistration: row.firstRegistration,
    daysInStock: row.daysInStock,
    importFingerprint: row.importFingerprint,
    importedAt: row.importedAt,
    missingSinceImportAt: row.missingSinceImportAt,
  }));
}

/**
 * Stabile externe Kennung eines importierten Fahrzeugs.
 *
 * FIN zuerst, sonst GW-Nr. Zusammen mit `externalSource` ergibt das den
 * bestehenden Eindeutigkeitsschlüssel der Tabelle und damit eine dritte
 * Absicherung gegen Dubletten – neben den Unique-Indizes auf FIN und GW-Nr.
 */
function externalIdFor(create: PlannedCreate): string {
  const key = create.vin ?? create.stockNumber;
  return key ? `csv-${key}` : `csv-${randomBytes(6).toString("hex")}`;
}

/**
 * Plan anwenden.
 *
 * Bewusst ohne umschließende Transaktion über den gesamten Bestand: Ein
 * einzelnes Fahrzeug, das etwa an einem Unique-Index scheitert, soll den
 * gesamten Import nicht zurückrollen. Stattdessen wird die betroffene Zeile
 * gemeldet und der Rest übernommen – das Ergebnis benennt beides.
 */
export async function applyImportPlan(
  preview: ImportPreview,
  decisions: EnrichmentDecision[] = [],
  now = new Date(),
): Promise<{ outcome: ImportOutcome; failures: string[] }> {
  const { plan, fileName, parsed } = preview;
  const failures: string[] = [];

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let markedMissing = 0;
  let reappeared = 0;
  /** Zeile -> angelegte ID, damit die PDF-Ergänzung neue Fahrzeuge findet. */
  const createdIds = new Map<number, string>();

  for (const create of plan.creates) {
    const externalId = externalIdFor(create);

    try {
      const vehicle = await prisma.vehicle.create({
        select: { id: true },
        data: {
          ...create.values,
          externalSource: IMPORT_SOURCE,
          externalId,
          slug: buildVehicleSlug({
            make: create.values.make,
            model: create.values.model,
            firstRegistration: create.values.firstRegistration,
            externalId,
          }),
          stockNumber: create.stockNumber,
          vin: create.vin,
          importFingerprint: create.fingerprint,
          // Neu aus dem Import: im Bestand, ohne Bild, ohne Beitrag.
          status: "IN_STOCK",
          active: true,
          // Kraftstoff und Getriebe bleiben leer – die CSV kennt sie nicht,
          // und Raten würde die Caption-Erzeugung mit Falschangaben füttern.
          importedAt: now,
          lastSeenInImportAt: now,
          importSource: fileName,
          importWarnings: create.warnings,
          lastSyncedAt: now,
        },
      });
      createdIds.set(create.line, vehicle.id);
      created += 1;
    } catch {
      failures.push(
        `Zeile ${create.line} (${create.values.make} ${create.values.model}) konnte nicht angelegt werden.`,
      );
    }
  }

  for (const entry of [...plan.updates, ...plan.unchanged]) {
    try {
      await prisma.vehicle.update({
        where: { id: entry.id },
        data: {
          // Nur fachliche Felder der CSV. Status, Sichtbarkeit, Bilder,
          // Beschreibung und interne Notizen bleiben unangetastet.
          ...entry.values,
          // `undefined` heißt für Prisma "Feld nicht anfassen". Eine leere
          // Preisspalte lässt den gepflegten Preis damit unverändert stehen,
          // statt ihn zu leeren.
          priceCents: entry.values.priceCents ?? undefined,
          listPriceCents: entry.values.listPriceCents ?? undefined,
          stockNumber: entry.stockNumber,
          vin: entry.vin,
          importFingerprint: entry.fingerprint,
          lastSeenInImportAt: now,
          // Wieder in der Datei: Die Nachfrage-Markierung ist erledigt.
          missingSinceImportAt: null,
          importSource: fileName,
          importWarnings: entry.warnings,
          // Ein bereits importiertes Fahrzeug behält seinen ersten
          // Importzeitpunkt; ein von Hand angelegtes bekommt ihn jetzt.
          ...(entry.previouslyImported ? {} : { importedAt: now }),
          lastSyncedAt: now,
        },
      });

      if (entry.changedFields.length > 0) updated += 1;
      else unchanged += 1;
      if (entry.wasMissing) reappeared += 1;
    } catch {
      failures.push(`Zeile ${entry.line} (${entry.title}) konnte nicht aktualisiert werden.`);
    }
  }

  // --- Fehlende Fahrzeuge nur markieren ----------------------------------
  const toFlag = plan.missing.filter((entry) => !entry.alreadyFlagged);

  if (toFlag.length > 0) {
    try {
      const result = await prisma.vehicle.updateMany({
        where: { id: { in: toFlag.map((entry) => entry.id) } },
        data: { missingSinceImportAt: now },
      });
      markedMissing = result.count;
    } catch {
      failures.push("Fehlende Fahrzeuge konnten nicht markiert werden.");
    }
  }

  // --- Ergänzung aus der Fahrzeuglisten-PDF --------------------------------
  let enriched = 0;
  let imagesStored = 0;

  if (preview.enrichment) {
    const result = await applyEnrichment(preview.enrichment, decisions, createdIds, now);
    enriched = result.enriched;
    imagesStored = result.imagesStored;
    failures.push(...result.failures);
  }

  return {
    outcome: {
      fileName,
      created,
      updated,
      unchanged,
      markedMissing,
      reappeared,
      skipped: plan.skipped.length,
      rowErrors: parsed.errors.length,
      inactive: parsed.inactiveRows,
      enriched,
      imagesStored,
    },
    failures,
  };
}

/**
 * Schreibt, was der Händler im Review bestätigt hat – Feld für Feld, nur mit
 * tatsächlichem Wert. Das Foto wird über denselben Speicher abgelegt wie ein
 * hochgeladenes Bild: Ohne bestehende Bilder als Titelbild (Position 0),
 * sonst hinten angefügt. Vorhandene Bilder werden nie gelöscht.
 */
async function applyEnrichment(
  enrichment: NonNullable<ImportPreview["enrichment"]>,
  decisions: EnrichmentDecision[],
  createdIds: Map<number, string>,
  now: Date,
): Promise<{ enriched: number; imagesStored: number; failures: string[] }> {
  const failures: string[] = [];
  let enriched = 0;
  let imagesStored = 0;

  const resolved = resolveEnrichmentDecisions(enrichment.plan, decisions);
  const photos = resolved.some((entry) => entry.useImage)
    ? new Map(extractImages(enrichment.objects).map((image) => [image.objectNumber, image]))
    : new Map();

  for (const entry of resolved) {
    const vehicleId =
      entry.target.ref.kind === "existing"
        ? entry.target.ref.id
        : createdIds.get(entry.target.ref.line);
    const label = `${entry.card.make} ${entry.card.model}`;

    if (!vehicleId) {
      failures.push(`${label}: Das zugeordnete Fahrzeug wurde nicht angelegt.`);
      continue;
    }

    const data: Record<string, unknown> = {};
    for (const change of entry.accepted) {
      data[change.field] = change.proposed;
    }

    try {
      if (Object.keys(data).length > 0) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { ...data, lastSyncedAt: now },
        });
      }

      if (entry.useImage && entry.card.image) {
        const photo = photos.get(entry.card.image.objectNumber);
        if (!photo) {
          failures.push(`${label}: Das Foto wurde in der PDF nicht mehr gefunden.`);
        } else {
          const storage = getFileStorage();
          const stored = await storage.upload({
            prefix: `fahrzeuge/${vehicleId}`,
            filename: `fahrzeugliste.${photo.contentType === "image/jpeg" ? "jpg" : "png"}`,
            contentType: photo.contentType,
            data: photo.data,
          });

          const existingCount = await prisma.vehicleImage.count({ where: { vehicleId } });
          if (existingCount === 0) {
            await prisma.vehicleImage.create({
              data: { vehicleId, url: stored.url, position: 0, alt: null },
            });
          } else {
            // Bestehende Bilder bleiben, wie sie sind; das neue kommt hinten dazu.
            await prisma.vehicleImage.create({
              data: { vehicleId, url: stored.url, position: existingCount, alt: null },
            });
          }
          imagesStored += 1;
        }
      }

      enriched += 1;
    } catch (error) {
      logger.error("Ergänzung aus der Fahrzeugliste fehlgeschlagen", { vehicleId, error });
      failures.push(`${label}: Die Ergänzung konnte nicht gespeichert werden.`);
    }
  }

  return { enriched, imagesStored, failures };
}
