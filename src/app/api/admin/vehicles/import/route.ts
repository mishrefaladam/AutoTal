import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";
import { FIELD_LABELS } from "@/modules/vehicles/csv-import";
import type {
  ImportCommitResponse,
  ImportPreviewResponse,
  ImportPreviewRow,
} from "@/modules/vehicles/import-dto";
import type { ImportValues } from "@/modules/vehicles/import-plan";
import {
  applyImportPlan,
  buildImportPreview,
  type ImportPreview,
} from "@/modules/vehicles/import-service";

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
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mehr Zeilen sind in einer Vorschau nicht lesbar – gezählt wird vollständig. */
const PREVIEW_ROW_LIMIT = 25;

const CHANGED_FIELD_LABELS: Record<keyof ImportValues, string> = {
  make: "Marke",
  model: "Modell",
  color: "Farbe",
  priceCents: "Preis",
  listPriceCents: "Listenpreis",
  mileageKm: "KM-Stand",
  firstRegistration: "Baujahr",
  daysInStock: "Standzeit",
};

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
    },
    rows: rows.slice(0, PREVIEW_ROW_LIMIT),
    skipped: plan.skipped,
    missing: plan.missing.map((entry) => ({
      title: entry.title,
      alreadyFlagged: entry.alreadyFlagged,
    })),
    fileWarnings: parsed.fileWarnings,
    rowErrors: parsed.errors,
  };
}

export async function POST(request: NextRequest) {
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
  const mode = formData.get("mode") === "commit" ? "commit" : "preview";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  try {
    const preview = await buildImportPreview(file);

    if (mode === "preview") {
      return NextResponse.json(toPreviewResponse(preview));
    }

    const { outcome, failures } = await applyImportPlan(preview);

    logger.info("Bestandsimport ausgeführt", {
      userId: session.id,
      created: outcome.created,
      updated: outcome.updated,
      unchanged: outcome.unchanged,
      markedMissing: outcome.markedMissing,
      failures: failures.length,
    });

    revalidatePath("/admin/fahrzeuge");
    revalidatePath("/admin/social-media");

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
