import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";
import { getAdminSession } from "@/modules/admin/auth";
import { prisma } from "@/lib/prisma";
import {
  analysePriceSheet,
  applyPriceSheet,
  MAX_PRICE_SHEET_BYTES,
  PRICE_SHEET_FIELD_LABELS,
  type PriceSheetField,
} from "@/modules/vehicles/price-sheet-service";

/**
 * Preisblatt-PDF eines Fahrzeugs analysieren und übernehmen.
 *
 * Ein Route Handler wie beim Bildupload: Server Actions haben ein knappes
 * Body-Limit, und eine Datei gehört über einen Upload-Endpunkt.
 *
 * `mode=analyse` liest nur und schreibt nichts. `mode=apply` übernimmt genau
 * die Felder, die der Admin bestätigt hat.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_FIELDS = new Set(Object.keys(PRICE_SHEET_FIELD_LABELS));

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/admin/vehicles/[id]/price-sheet">,
) {
  // Erste und wichtigste Prüfung: Ohne Anmeldung passiert hier nichts. Der
  // Proxy schirmt /admin bereits ab; ein Endpunkt, der Fahrzeugdaten ändert
  // und Dateien ablegt, verlässt sich darauf aber nicht.
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id: vehicleId } = await context.params;

  // Das Fahrzeug muss existieren, bevor irgendetwas gelesen wird.
  const exists = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });

  if (!exists) {
    return NextResponse.json(
      { error: "Dieses Fahrzeug wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const declaredBytes = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PRICE_SHEET_BYTES) {
    return NextResponse.json(
      {
        error: `Die Datei ist zu groß (maximal ${Math.round(
          MAX_PRICE_SHEET_BYTES / 1024 / 1024,
        )} MB).`,
      },
      { status: 413 },
    );
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
  const mode = formData.get("mode") === "apply" ? "apply" : "analyse";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  try {
    if (mode === "analyse") {
      return NextResponse.json(await analysePriceSheet(vehicleId, file));
    }

    // Nur bekannte Feldnamen durchlassen – die Liste kommt aus dem Browser.
    const acceptedFields = String(formData.get("fields") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => VALID_FIELDS.has(entry)) as PriceSheetField[];

    const rawImage = formData.get("imageObjectNumber");
    const parsedImage = rawImage === null ? NaN : Number(rawImage);
    const imageObjectNumber = Number.isInteger(parsedImage) ? parsedImage : null;

    const result = await applyPriceSheet({
      vehicleId,
      file,
      acceptedFields,
      imageObjectNumber,
    });

    logger.info("Preisblatt übernommen", {
      vehicleId,
      userId: session.id,
      fields: result.appliedFields.length,
      imageStored: result.imageStored,
    });

    revalidatePath(`/admin/fahrzeuge/${vehicleId}`);
    revalidatePath("/admin/fahrzeuge");
    revalidatePath("/admin/social-media");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Technische Ursachen bleiben im Serverlog – keine Stacktraces und keine
    // Konfigurationsdetails in der Oberfläche.
    logger.error("Preisblatt konnte nicht verarbeitet werden", { vehicleId, error });

    return NextResponse.json(
      { error: "Die Datei konnte nicht als Preisblatt verarbeitet werden." },
      { status: 500 },
    );
  }
}
