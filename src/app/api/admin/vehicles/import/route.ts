import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import {
  cleanupStaleTempImports,
  deleteTempImport,
  isTempImportPathname,
  readTempImport,
} from "@/integrations/storage/temp-imports";
import { logger } from "@/lib/logger";
import { formatEuro, formatKilometers, formatNumber } from "@/lib/money";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";
import { FIELD_LABELS } from "@/modules/vehicles/csv-import";
import type {
  EnrichmentChangeDto,
  EnrichmentEntryDto,
  EnrichmentOptionDto,
  ImportCommitResponse,
  ImportEnrichmentDto,
  ImportPreviewResponse,
  ImportPreviewRow,
} from "@/modules/vehicles/import-dto";
import {
  ENRICHMENT_FIELDS,
  diffCardAgainstTarget,
  targetRefKey,
  type EnrichmentChange,
  type EnrichmentDecision,
  type EnrichmentField,
  type EnrichmentTarget,
} from "@/modules/vehicles/import-enrichment";
import type { ImportValues } from "@/modules/vehicles/import-plan";
import {
  applyImportPlan,
  buildImportPreview,
  type ImportPreview,
  type ListPdfSource,
} from "@/modules/vehicles/import-service";
import { DRIVETRAIN_LABELS, formatMonthYear } from "@/modules/vehicles/labels";
import type { VehicleListCard } from "@/modules/vehicles/vehicle-list-pdf";

/**
 * CSV-Bestandsimport (Vorschau und Ausführung).
 *
 * Ein Route Handler und keine Server Action – wie beim Bildupload: Server
 * Actions haben ein knappes Body-Limit, und eine Datei gehört ohnehin über
 * einen Upload-Endpunkt.
 *
 * Nur für angemeldete Admins. Der Endpunkt liegt unter /api/admin/*, das der
 * Proxy bereits gegen Unangemeldete abriegelt; die Prüfung hier steht
 * trotzdem – ein Endpunkt, der Fahrzeuge anlegt, verlässt sich nicht auf eine
 * vorgelagerte Schicht.
 *
 * Optional kommt eine Fahrzeuglisten-PDF mit – in Produktion als Pfad einer
 * bereits direkt nach Vercel Blob hochgeladenen Datei (`pdfRef`), lokal ohne
 * Blob-Token als Datei im Request (`pdf`). Beim Bestätigen wird dieselbe
 * Blob-Datei erneut gelesen – kein zweiter Upload – und die Entscheidungen
 * des Reviews (`decisions`, JSON) werden auf den neu berechneten Plan
 * angewandt, so dass die Vorschau nicht von dem abweichen kann, was
 * geschrieben wird. Nach erfolgreichem Bestätigen wird die temporäre PDF
 * gelöscht; scheitert das Schreiben, bleibt sie für einen erneuten Versuch.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mehr Zeilen sind in einer Vorschau nicht lesbar – gezählt wird vollständig. */
const PREVIEW_ROW_LIMIT = 25;

const CHANGED_FIELD_LABELS: Record<keyof ImportValues, string> = {
  features: "Ausstattung",
  make: "Marke",
  model: "Modell",
  color: "Farbe",
  priceCents: "Preis",
  listPriceCents: "Listenpreis",
  mileageKm: "KM-Stand",
  firstRegistration: "Baujahr",
  daysInStock: "Standzeit",
};

const ENRICHMENT_FIELD_LABELS: Record<EnrichmentField, string> = {
  variant: "Bezeichnung",
  firstRegistration: "Erstzulassung",
  mileageKm: "Kilometer",
  priceCents: "Preis",
  powerKw: "Leistung",
  displacementCcm: "Hubraum",
  color: "Farbe",
  drivetrain: "Antrieb",
};

function formatEnrichmentValue(
  field: EnrichmentField,
  value: EnrichmentChange["current"],
): string | null {
  if (value === null) return null;
  switch (field) {
    case "firstRegistration":
      return value instanceof Date ? formatMonthYear(value) : String(value);
    case "mileageKm":
      return formatKilometers(Number(value));
    case "priceCents":
      return formatEuro(Number(value));
    case "powerKw":
      return `${formatNumber(Number(value))} kW`;
    case "displacementCcm":
      return `${formatNumber(Number(value))} cm³`;
    case "drivetrain":
      return DRIVETRAIN_LABELS[value as keyof typeof DRIVETRAIN_LABELS] ?? String(value);
    default:
      return String(value);
  }
}

function toChangeDto(change: EnrichmentChange): EnrichmentChangeDto {
  return {
    field: change.field,
    label: ENRICHMENT_FIELD_LABELS[change.field],
    kind: change.kind,
    current: formatEnrichmentValue(change.field, change.current),
    proposed: formatEnrichmentValue(change.field, change.proposed) ?? "",
    preselected: change.preselected,
  };
}

function targetDetail(target: EnrichmentTarget): string {
  return [
    target.firstRegistration ? formatMonthYear(target.firstRegistration) : null,
    target.mileageKm !== null ? formatKilometers(target.mileageKm) : null,
    target.priceCents !== null ? formatEuro(target.priceCents) : null,
    target.stockNumber ? `GW-Nr. ${target.stockNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function cardDetail(card: VehicleListCard): string {
  return [
    card.firstRegistration ? formatMonthYear(card.firstRegistration) : null,
    card.mileageKm !== null ? formatKilometers(card.mileageKm) : null,
    card.priceCents !== null ? formatEuro(card.priceCents) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function toOptionDto(card: VehicleListCard, target: EnrichmentTarget): EnrichmentOptionDto {
  return {
    ref: target.ref,
    key: targetRefKey(target.ref),
    title: target.title,
    detail: targetDetail(target),
    changes: diffCardAgainstTarget(card, target).map(toChangeDto),
    imagePreselected: card.image !== null && target.imageCount === 0,
  };
}

function toEnrichmentDto(
  enrichment: NonNullable<ImportPreview["enrichment"]>,
): ImportEnrichmentDto {
  const entries: EnrichmentEntryDto[] = enrichment.plan.entries.map((entry) => {
    const targets =
      entry.match.kind === "safe" ? [entry.match.target] : entry.match.candidates;

    return {
      cardKey: entry.card.key,
      title: `${entry.card.make} ${entry.card.model}`.trim(),
      variant: entry.card.variant,
      detail: cardDetail(entry.card),
      matchKind: entry.match.kind,
      defaultKey: entry.match.kind === "safe" ? targetRefKey(entry.match.target.ref) : null,
      options: targets.map((target) => toOptionDto(entry.card, target)),
      hasImage: entry.card.image !== null,
      warnings: entry.card.warnings,
    };
  });

  return {
    fileName: enrichment.fileName,
    listedAt: enrichment.list.listedAt,
    pages: enrichment.list.pages,
    counts: { cards: enrichment.list.cards.length, ...enrichment.plan.counts },
    entries,
    warnings: enrichment.warnings,
  };
}

/** Entscheidungen des Reviews – streng geprüft, sie kommen vom Client. */
const decisionsSchema = z
  .array(
    z.object({
      cardKey: z.string().min(1).max(20),
      target: z
        .union([
          z.object({ kind: z.literal("existing"), id: z.string().min(1).max(64) }),
          z.object({ kind: z.literal("create"), line: z.number().int().positive() }),
        ])
        .nullable(),
      acceptedFields: z.array(z.enum(ENRICHMENT_FIELDS)).max(ENRICHMENT_FIELDS.length),
      useImage: z.boolean(),
    }),
  )
  .max(500);

function parseDecisions(raw: FormDataEntryValue | null): EnrichmentDecision[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new UserFacingError("Die Review-Entscheidungen sind unlesbar.", "VALIDATION");
  }
  const parsed = decisionsSchema.safeParse(json);
  if (!parsed.success) {
    throw new UserFacingError("Die Review-Entscheidungen sind ungültig.", "VALIDATION");
  }
  return parsed.data;
}

function toPreviewResponse(preview: ImportPreview): ImportPreviewResponse {
  const { parsed, plan } = preview;

  const rows: ImportPreviewRow[] = [
    ...plan.creates.map((entry) => ({
      line: entry.line,
      action: "create" as const,
      title: `${entry.values.make} ${entry.values.model}`,
      stockNumber: entry.stockNumber,
      vin: entry.vin,
      priceCents: entry.values.priceCents,
      previousPriceCents: null,
      mileageKm: entry.values.mileageKm,
      year: entry.values.firstRegistration?.getUTCFullYear() ?? null,
      matchedBy: null,
      changed: [],
      warnings: entry.warnings,
    })),
    ...[...plan.updates, ...plan.unchanged].map((entry) => ({
      line: entry.line,
      action: (entry.changedFields.length > 0 ? "update" : "unchanged") as
        | "update"
        | "unchanged",
      title: entry.title,
      stockNumber: entry.stockNumber,
      vin: entry.vin,
      priceCents: entry.values.priceCents,
      // Nur zeigen, was sich tatsächlich ändert.
      previousPriceCents: entry.changedFields.includes("priceCents")
        ? entry.previousPriceCents
        : null,
      mileageKm: entry.values.mileageKm,
      year: entry.values.firstRegistration?.getUTCFullYear() ?? null,
      matchedBy: entry.matchedBy,
      changed: entry.changedFields.map((field) => CHANGED_FIELD_LABELS[field]),
      warnings: entry.warnings,
    })),
  ].sort((a, b) => a.line - b.line);

  return {
    mode: "preview",
    fileName: preview.fileName,
    columns: parsed.mapping.matched.map((entry) => ({
      header: entry.header,
      label: FIELD_LABELS[entry.field],
    })),
    ignoredColumns: parsed.mapping.ignored,
    counts: {
      dataRows: parsed.totalDataRows,
      create: plan.creates.length,
      update: plan.updates.length,
      unchanged: plan.unchanged.length,
      missing: plan.missing.length,
      skipped: plan.skipped.length,
      inactive: parsed.inactiveRows,
    },
    rows: rows.slice(0, PREVIEW_ROW_LIMIT),
    skipped: plan.skipped,
    missing: plan.missing.map((entry) => ({
      title: entry.title,
      alreadyFlagged: entry.alreadyFlagged,
    })),
    fileWarnings: parsed.fileWarnings,
    rowErrors: parsed.errors,
    enrichment: preview.enrichment ? toEnrichmentDto(preview.enrichment) : null,
  };
}

export async function POST(request: NextRequest) {
  const requestStarted = performance.now();
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Die Datei konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const pdfEntry = formData.get("pdf");
  const pdfRef = formData.get("pdfRef");
  const mode = formData.get("mode") === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  // Ein Pfad muss exakt dem Muster der Anwendung entsprechen – alles andere
  // wird abgewiesen, ohne dass irgendetwas aufgerufen wird.
  if (pdfRef !== null && !isTempImportPathname(pdfRef)) {
    return NextResponse.json({ error: "Ungültige Referenz der Fahrzeugliste." }, { status: 400 });
  }

  try {
    let pdf: ListPdfSource | null = null;
    if (isTempImportPathname(pdfRef)) {
      const temp = await readTempImport(pdfRef);
      pdf = { kind: "blob", pathname: temp.pathname, name: "Fahrzeugliste.pdf", bytes: temp.bytes };
    } else if (pdfEntry instanceof File && pdfEntry.size > 0) {
      pdf = { kind: "file", file: pdfEntry };
    }

    // Liegengebliebene Uploads nebenbei wegräumen – ohne darauf zu warten.
    if (mode === "preview" && pdf?.kind === "blob") {
      void cleanupStaleTempImports();
    }

    const preview = await buildImportPreview(file, pdf);

    // Nur Dauern und Größen – keine Dateiinhalte, keine Fahrzeugdaten. Damit
    // lässt sich im Vercel-Log ablesen, wo die Zeit einer Vorschau hingeht.
    logger.info("Bestandsvorschau erstellt", {
      mode,
      csvBytes: file.size,
      pdfBytes: pdf?.kind === "blob" ? pdf.bytes.length : (pdf?.file.size ?? 0),
      pdfSource: pdf?.kind ?? null,
      cards: preview.enrichment?.list.cards.length ?? 0,
      ...preview.timings,
      requestMs: Math.round(performance.now() - requestStarted),
    });

    if (mode === "preview") {
      return NextResponse.json(toPreviewResponse(preview));
    }

    const decisions = parseDecisions(formData.get("decisions"));
    const { outcome, failures } = await applyImportPlan(preview, decisions);

    logger.info("Bestandsimport ausgeführt", {
      userId: session.id,
      created: outcome.created,
      updated: outcome.updated,
      unchanged: outcome.unchanged,
      markedMissing: outcome.markedMissing,
      enriched: outcome.enriched,
      imagesStored: outcome.imagesStored,
      failures: failures.length,
    });

    revalidatePath("/admin/fahrzeuge");
    revalidatePath("/admin/social-media");

    // Erst nach erfolgreichem Schreiben: Die temporäre PDF hat ihren Zweck
    // erfüllt. Bei Fehlern bleibt sie liegen, damit ein erneuter Versuch
    // ohne neuen Upload möglich ist.
    if (pdf?.kind === "blob" && failures.length === 0) {
      await deleteTempImport(pdf.pathname);
    }

    const response: ImportCommitResponse = {
      mode: "commit",
      fileName: outcome.fileName,
      created: outcome.created,
      updated: outcome.updated,
      unchanged: outcome.unchanged,
      markedMissing: outcome.markedMissing,
      reappeared: outcome.reappeared,
      skipped: outcome.skipped,
      rowErrors: outcome.rowErrors,
      inactive: outcome.inactive,
      enriched: outcome.enriched,
      imagesStored: outcome.imagesStored,
      failures,
    };

    return NextResponse.json(response);
  } catch (error) {
    // Nur ausdrücklich für Nutzer formulierte Meldungen gehen nach außen.
    // Alles andere bleibt im Serverlog – kein Stacktrace in der Oberfläche.
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logger.error("Bestandsimport fehlgeschlagen", { error });

    return NextResponse.json(
      {
        error:
          "Der Import konnte nicht ausgeführt werden. Bitte prüfen Sie die " +
          "Datei und versuchen Sie es erneut.",
      },
      { status: 500 },
    );
  }
}
