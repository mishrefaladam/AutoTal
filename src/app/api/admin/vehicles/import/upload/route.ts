import { NextResponse, type NextRequest } from "next/server";
import type { HandleUploadBody } from "@vercel/blob/client";

import {
  TEMP_IMPORT_MAX_BYTES,
  deleteTempImport,
  handleTempImportUpload,
  isDirectUploadAvailable,
  isTempImportPathname,
} from "@/integrations/storage/temp-imports";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";

/**
 * Direkter Upload der Fahrzeuglisten-PDF nach Vercel Blob.
 *
 *   GET     Ist der direkte Upload in dieser Umgebung möglich? (lokal ohne
 *           Blob-Token: nein – dann geht die PDF den alten Weg im Request.)
 *   POST    Token-Route für das Blob-SDK: stellt ein kurzlebiges Upload-
 *           Token aus, nur für PDF, nur unter temp/vehicle-imports/.
 *   DELETE  Entfernt eine temporäre PDF wieder ("PDF entfernen").
 *
 * Alles nur für angemeldete Admins. Der Pfad liegt unter /api/admin/*, das
 * der Proxy bereits abriegelt; die Prüfung hier steht trotzdem.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireSession() {
  const session = await getAdminSession();
  if (!session) {
    return null;
  }
  return session;
}

export async function GET() {
  if (!(await requireSession())) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  return NextResponse.json({
    directUpload: isDirectUploadAvailable(),
    maxBytes: TEMP_IMPORT_MAX_BYTES,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  if (!isDirectUploadAvailable()) {
    return NextResponse.json(
      { error: "Der direkte Upload ist in dieser Umgebung nicht eingerichtet.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    const result = await handleTempImportUpload(body, request);
    logger.info("Upload-Token für Fahrzeugliste ausgestellt", {
      userId: session.id,
      type: body.type,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Die SDK-Meldung kann Details des Stores enthalten – sie bleibt im Log.
    logger.error("Upload-Token für Fahrzeugliste fehlgeschlagen", { error });
    return NextResponse.json(
      { error: "Der Upload konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const pathname = request.nextUrl.searchParams.get("ref");
  if (!isTempImportPathname(pathname)) {
    return NextResponse.json({ error: "Ungültige Referenz." }, { status: 400 });
  }

  const deleted = await deleteTempImport(pathname);
  logger.info("Temporäre Fahrzeugliste entfernt", { userId: session.id, deleted });
  return NextResponse.json({ deleted });
}
