import "server-only";
import { mergeEquipment } from "./equipment";

import {
  MAX_UPLOAD_REQUEST_BYTES,
  getFileStorage,
} from "@/integrations/storage";
import { formatEuro, formatKilometers, formatNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

import { FUEL_LABELS, TRANSMISSION_LABELS, formatRegistration } from "./labels";
import {
  checkPlausibility,
  kwToPs,
  mapPriceSheet,
  type PriceSheetValues,
} from "./price-sheet-mapping";
import {
  extractPositionalFields,
  isSalesOfferTemplate,
} from "./price-sheet-layout";
import {
  extractFormFields,
  extractImages,
  isEncrypted,
  looksLikePdf,
  parsePdfObjects,
  rankVehicleImages,
  type ImageCandidate,
  type PdfObject,
  type PriceSheetFields,
} from "./price-sheet";

/**
 * Preisblatt einlesen, zur Prüfung vorlegen und nach Bestätigung übernehmen.
 *
 * Der Ablauf ist zweistufig und speichert dazwischen nichts: Die Analyse legt
 * einen Vorschlag vor, erst ein zweiter, ausdrücklicher Aufruf schreibt. Für
 * den zweiten Schritt wird dieselbe Datei erneut gelesen – so kann die Vorschau
 * nicht von dem abweichen, was tatsächlich gespeichert wird, und es liegt
 * kein Zwischenstand irgendwo herum.
 *
 * Der Bildupload nutzt denselben Speicherdienst wie der manuelle Upload. Es
 * gibt bewusst keinen zweiten Ablageweg.
 */

/**
 * Dieselbe Obergrenze wie beim Bildupload.
 *
 * Vercel Functions nehmen höchstens rund 4,5 MB Request-Body an; ein
 * großzügigeres Limit würde die Datei nicht retten, sondern die Ablehnung nur
 * an eine Stelle verschieben, an der keine verständliche Meldung mehr möglich
 * ist.
 */
export const MAX_PRICE_SHEET_BYTES = MAX_UPLOAD_REQUEST_BYTES;

/** Felder, die aus einem Preisblatt stammen können. */
export type PriceSheetField =
  | "variant"
  | "firstRegistration"
  | "mileageKm"
  | "powerKw"
  | "fuel"
  | "transmission"
  | "displacementCcm"
  | "color"
  | "stockNumber"
  | "priceCents"
  | "features"
  | "description";

export const PRICE_SHEET_FIELD_LABELS: Record<PriceSheetField, string> = {
  variant: "Modellbezeichnung",
  firstRegistration: "Erstzulassung",
  mileageKm: "Kilometerstand",
  powerKw: "Leistung",
  fuel: "Treibstoff",
  transmission: "Getriebe",
  displacementCcm: "Hubraum",
  color: "Farbe",
  stockNumber: "GW-Nr",
  priceCents: "Preis",
  features: "Ausstattung",
  description: "Beschreibung",
};

export type ReviewEntry = {
  field: PriceSheetField;
  label: string;
  /** Aktueller Stand am Fahrzeug, für die Anzeige aufbereitet. */
  current: string | null;
  /** Was im Preisblatt steht, für die Anzeige aufbereitet. */
  proposed: string;
  /**
   * Voreingestellt zur Übernahme. Nur bei leeren Feldern – ein gepflegter
   * Wert wird nie automatisch überschrieben.
   */
  preselected: boolean;
  /** Bestehender, abweichender Wert. Braucht eine bewusste Entscheidung. */
  conflict: boolean;
};

export type ImageProposal = {
  objectNumber: number;
  widthPx: number;
  heightPx: number;
  /** Anteil der Seitenbreite, auf dem das Bild gezeichnet wird. */
  pageWidthPercent: number | null;
  contentType: string;
  sizeBytes: number;
  /** Kleines Vorschaubild als data:-URL. Verlässt den Server nur zur Anzeige. */
  previewDataUrl: string;
};

export type PriceSheetAnalysis = {
  fileName: string;
  entries: ReviewEntry[];
  /** Gefundene Bildkandidaten, bestes zuerst. */
  images: ImageProposal[];
  /** Warum Bilder ausgeschieden wurden – damit die Meldung nachvollziehbar ist. */
  imageRejections: string[];
  /** Hinweise auf ein möglicherweise fremdes Fahrzeug. */
  plausibilityWarnings: string[];
  /** Wie viele Absätze als Händlertext ausgeschieden wurden. */
  droppedDealerParagraphs: number;
};

/** Dateiname entschärfen und kürzen. */
function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "preisblatt.pdf";
  return base.replace(/[^\w.\- ]/g, "").slice(0, 120) || "preisblatt.pdf";
}

/** Datei prüfen und Bytes lesen. Meldungen sind für den Admin formuliert. */
export async function readPriceSheet(
  file: File,
): Promise<{ fileName: string; bytes: Buffer }> {
  const fileName = safeFileName(file.name);

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    throw new UserFacingError(
      "Bitte ein Preisblatt im PDF-Format auswählen.",
      "VALIDATION",
    );
  }

  if (file.type !== "application/pdf" && file.type !== "") {
    throw new UserFacingError(
      "Dieser Dateityp wird nicht angenommen. Bitte eine PDF-Datei auswählen.",
      "VALIDATION",
    );
  }

  if (file.size === 0) {
    throw new UserFacingError("Die Datei ist leer.", "VALIDATION");
  }

  if (file.size > MAX_PRICE_SHEET_BYTES) {
    throw new UserFacingError(
      `Die Datei ist zu groß (maximal ${Math.round(MAX_PRICE_SHEET_BYTES / 1024 / 1024)} MB).`,
      "VALIDATION",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Die Endung allein sagt nichts – maßgeblich ist der Inhalt.
  if (!looksLikePdf(bytes)) {
    throw new UserFacingError(
      "Die Datei konnte nicht als Preisblatt verarbeitet werden.",
      "VALIDATION",
    );
  }

  if (isEncrypted(bytes)) {
    throw new UserFacingError(
      "Das PDF ist verschlüsselt und kann nicht gelesen werden. Bitte " +
        "exportieren Sie das Preisblatt ohne Kennwortschutz.",
      "VALIDATION",
    );
  }

  return { fileName, bytes };
}

/** Fahrzeugstand, gegen den verglichen wird. */
type VehicleSnapshot = {
  make: string;
  model: string;
  variant: string | null;
  firstRegistration: Date | null;
  mileageKm: number;
  powerKw: number | null;
  fuel: string | null;
  transmission: string | null;
  displacementCcm: number | null;
  color: string | null;
  stockNumber: string | null;
  priceCents: number;
  features: string[];
  highlights: string[];
  description: string;
};

function formatPower(kw: number): string {
  return `${kw} kW (${kwToPs(kw)} PS)`;
}

/**
 * Eine Zeile der Prüfansicht bauen.
 *
 * Drei Fälle, drei Verhaltensweisen:
 *   leeres Feld       -> Vorschlag, vorausgewählt
 *   gleicher Wert     -> gar keine Zeile, es gibt nichts zu entscheiden
 *   abweichender Wert -> Vorschlag, NICHT vorausgewählt, als Konflikt markiert
 */
function buildEntry(
  field: PriceSheetField,
  current: string | null,
  proposed: string | null,
  options: { neverPreselect?: boolean } = {},
): ReviewEntry | null {
  // Ein leeres Preisblattfeld überschreibt nie etwas.
  if (proposed === null || proposed.trim() === "") return null;

  const isEmpty = current === null || current.trim() === "";
  if (!isEmpty && current.trim() === proposed.trim()) return null;

  return {
    field,
    label: PRICE_SHEET_FIELD_LABELS[field],
    current: isEmpty ? null : current,
    proposed,
    preselected: isEmpty && !options.neverPreselect,
    conflict: !isEmpty,
  };
}

function buildEntries(
  values: PriceSheetValues,
  vehicle: VehicleSnapshot,
): ReviewEntry[] {
  const entries: (ReviewEntry | null)[] = [
    buildEntry("variant", vehicle.variant, values.variant),
    buildEntry(
      "firstRegistration",
      vehicle.firstRegistration ? formatRegistration(vehicle.firstRegistration) : null,
      values.firstRegistration ? formatRegistration(values.firstRegistration) : null,
    ),
    buildEntry(
      "mileageKm",
      // 0 km bedeutet beim Bestandsimport "nicht angegeben" und gilt als leer.
      vehicle.mileageKm > 0 ? formatKilometers(vehicle.mileageKm) : null,
      values.mileageKm === null ? null : formatKilometers(values.mileageKm),
    ),
    buildEntry(
      "powerKw",
      vehicle.powerKw === null ? null : formatPower(vehicle.powerKw),
      values.powerKw === null ? null : formatPower(values.powerKw),
    ),
    buildEntry(
      "fuel",
      vehicle.fuel ? FUEL_LABELS[vehicle.fuel as keyof typeof FUEL_LABELS] : null,
      values.fuel ? FUEL_LABELS[values.fuel] : null,
    ),
    buildEntry(
      "transmission",
      vehicle.transmission
        ? TRANSMISSION_LABELS[vehicle.transmission as keyof typeof TRANSMISSION_LABELS]
        : null,
      values.transmission ? TRANSMISSION_LABELS[values.transmission] : null,
    ),
    buildEntry(
      "displacementCcm",
      vehicle.displacementCcm === null ? null : `${formatNumber(vehicle.displacementCcm)} cm³`,
      values.displacementCcm === null ? null : `${formatNumber(values.displacementCcm)} cm³`,
    ),
    buildEntry("color", vehicle.color, values.color),
    buildEntry("stockNumber", vehicle.stockNumber, values.stockNumber),
    buildEntry(
      "priceCents",
      vehicle.priceCents > 0 ? formatEuro(vehicle.priceCents) : null,
      values.priceCents === null ? null : formatEuro(values.priceCents),
    ),
    buildEntry(
      "features",
      mergeEquipment(vehicle.features, vehicle.highlights).join(", ") || null,
      values.features.length > 0 ? values.features.join(", ") : null,
    ),
    buildEntry("description", vehicle.description || null, values.description, {
      // Auch bei leerem Feld nie vorausgewählt: Der Text stammt aus einem
      // Werbeblatt, und was übrig bleibt, gehört vor dem Speichern gelesen.
      neverPreselect: true,
    }),
  ];

  return entries.filter((entry): entry is ReviewEntry => entry !== null);
}

/** Kleines Vorschaubild, damit die Prüfansicht ohne zweiten Abruf auskommt. */
function toPreview(candidate: ImageCandidate): ImageProposal {
  return {
    objectNumber: candidate.objectNumber,
    widthPx: candidate.widthPx,
    heightPx: candidate.heightPx,
    pageWidthPercent:
      candidate.pageWidthRatio === null
        ? null
        : Math.round(candidate.pageWidthRatio * 100),
    contentType: candidate.contentType,
    sizeBytes: candidate.data.length,
    previewDataUrl: `data:${candidate.contentType};base64,${candidate.data.toString("base64")}`,
  };
}

export async function analysePriceSheet(
  vehicleId: string,
  file: File,
): Promise<PriceSheetAnalysis> {
  const { fileName, bytes } = await readPriceSheet(file);

  const vehicle = await loadVehicle(vehicleId);
  const objects = parsePdfObjects(bytes);
  const { fields, warnings: layoutWarnings } = readFields(objects);

  if (Object.keys(fields).length === 0) {
    throw new UserFacingError(
      "Im Preisblatt konnten keine Fahrzeugdaten erkannt werden. Erwartet " +
        "wird ein Preisblatt mit ausgefüllten Formularfeldern.",
      "VALIDATION",
    );
  }

  const values = mapPriceSheet(fields);
  const entries = buildEntries(values, vehicle);

  const { candidates, rejected } = rankVehicleImages(extractImages(objects));

  return {
    fileName,
    entries,
    // Mehr als drei Vorschläge helfen niemandem beim Auswählen.
    images: candidates.slice(0, 3).map(toPreview),
    imageRejections: rejected.map((entry) => entry.reason),
    plausibilityWarnings: [...checkPlausibility(values, vehicle), ...layoutWarnings],
    droppedDealerParagraphs: values.descriptionDropped,
  };
}

/**
 * Feldwerte einer Datei einsammeln.
 *
 * Der Feldwert `/V` hat immer Vorrang. Nur wo er fehlt und die Datei als
 * Verkaufsangebot erkannt wurde, tritt die positionsbasierte Zuordnung
 * hinzu – so bleibt das Verhalten für die Preisblatt-Vorlage unverändert.
 */
function readFields(objects: Map<number, PdfObject>): {
  fields: PriceSheetFields;
  warnings: string[];
} {
  const fields = extractFormFields(objects);

  const names = new Set<string>();
  for (const object of objects.values()) {
    const name = /\/T\s*\(((?:[^()\\]|\\.)*)\)/.exec(object.dict.toString("latin1"))?.[1];
    if (name) names.add(name);
  }

  if (!isSalesOfferTemplate(names)) return { fields, warnings: [] };

  const positional = extractPositionalFields(objects);

  const warnings = positional.ambiguous.map(
    (label) =>
      `Für „${label}“ standen mehrere Textstellen zur Auswahl. Der Wert wurde ` +
      `deshalb nicht übernommen – bitte von Hand eintragen.`,
  );

  // Reihenfolge ist die Aussage: Was aus /V kommt, bleibt stehen.
  return { fields: { ...positional.fields, ...fields }, warnings };
}

async function loadVehicle(vehicleId: string): Promise<VehicleSnapshot> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      make: true,
      model: true,
      variant: true,
      firstRegistration: true,
      mileageKm: true,
      powerKw: true,
      fuel: true,
      transmission: true,
      displacementCcm: true,
      color: true,
      stockNumber: true,
      priceCents: true,
      features: true,
      highlights: true,
      description: true,
    },
  });

  if (!vehicle) {
    throw new UserFacingError("Dieses Fahrzeug wurde nicht gefunden.", "NOT_FOUND");
  }

  return vehicle;
}

// ---------------------------------------------------------------------------
// Übernahme
// ---------------------------------------------------------------------------

export type ApplyResult = {
  appliedFields: string[];
  imageStored: boolean;
  /** Meldung, falls das Bild nicht abgelegt werden konnte. */
  imageError: string | null;
};

/**
 * Bestätigte Felder übernehmen.
 *
 * Geschrieben wird ausschließlich, was `acceptedFields` nennt. Alles andere –
 * auch alles, was gar nicht im Preisblatt steht – bleibt unangetastet:
 * Bilder, Ausstattung, Extras, interne Notizen, Status, Sichtbarkeit und
 * bestehende Social-Media-Entwürfe.
 */
export async function applyPriceSheet(input: {
  vehicleId: string;
  file: File;
  acceptedFields: PriceSheetField[];
  /** Objektnummer des zu übernehmenden Bildes, falls eines gewählt wurde. */
  imageObjectNumber: number | null;
}): Promise<ApplyResult> {
  const { fileName, bytes } = await readPriceSheet(input.file);

  const objects = parsePdfObjects(bytes);
  // Dieselbe Leseroutine wie in der Analyse. Zwei Wege wären zwei Wahrheiten:
  // Die Vorschau zeigte Werte, die beim Speichern niemand mehr fände.
  const values = mapPriceSheet(readFields(objects).fields);
  const accepted = new Set(input.acceptedFields);

  const data: Record<string, unknown> = {};

  // Jedes Feld einzeln und nur mit tatsächlichem Wert: `null` aus dem
  // Preisblatt bedeutet "stand nicht drin" und darf nichts leeren.
  if (accepted.has("variant") && values.variant) data.variant = values.variant;
  if (accepted.has("firstRegistration") && values.firstRegistration) {
    data.firstRegistration = values.firstRegistration;
  }
  if (accepted.has("mileageKm") && values.mileageKm !== null) {
    data.mileageKm = values.mileageKm;
  }
  if (accepted.has("powerKw") && values.powerKw !== null) data.powerKw = values.powerKw;
  if (accepted.has("fuel") && values.fuel) data.fuel = values.fuel;
  if (accepted.has("transmission") && values.transmission) {
    data.transmission = values.transmission;
  }
  if (accepted.has("displacementCcm") && values.displacementCcm !== null) {
    data.displacementCcm = values.displacementCcm;
  }
  if (accepted.has("color") && values.color) data.color = values.color;
  if (accepted.has("stockNumber") && values.stockNumber) {
    data.stockNumber = values.stockNumber;
  }
  if (accepted.has("priceCents") && values.priceCents !== null) {
    data.priceCents = values.priceCents;
  }
  if (accepted.has("features") && values.features.length > 0) {
    // Ergänzen, nicht ersetzen: Was das Blatt nennt, kommt zur gepflegten
    // Ausstattung dazu. Frühere Highlights wandern dabei mit in die
    // Ausstattung und die veraltete Spalte wird geleert – wie beim Speichern
    // im Admin.
    const current = await loadVehicle(input.vehicleId);
    data.features = mergeEquipment(current.features, current.highlights, values.features);
    data.highlights = [];
  }
  if (accepted.has("description") && values.description) {
    data.description = values.description;
  }

  const appliedFields = Object.keys(data).map(
    (key) => PRICE_SHEET_FIELD_LABELS[key as PriceSheetField] ?? key,
  );

  let imageStored = false;
  let imageError: string | null = null;

  if (input.imageObjectNumber !== null) {
    const { candidates } = rankVehicleImages(extractImages(objects));
    const chosen = candidates.find(
      (candidate) => candidate.objectNumber === input.imageObjectNumber,
    );

    if (!chosen) {
      imageError = "Das gewählte Bild wurde im Preisblatt nicht mehr gefunden.";
    } else {
      try {
        const storage = getFileStorage();
        const extension = chosen.contentType === "image/jpeg" ? "jpg" : "png";

        const stored = await storage.upload({
          prefix: `fahrzeuge/${input.vehicleId}`,
          filename: `preisblatt.${extension}`,
          contentType: chosen.contentType,
          data: chosen.data,
        });

        // Position 0: Das erste Bild ist das Titelbild und wird für
        // Social-Media-Entwürfe verwendet. Bestehende Bilder rücken nach
        // hinten, statt ersetzt zu werden.
        await prisma.$transaction([
          prisma.vehicleImage.updateMany({
            where: { vehicleId: input.vehicleId },
            data: { position: { increment: 1 } },
          }),
          prisma.vehicleImage.create({
            data: {
              vehicleId: input.vehicleId,
              url: stored.url,
              position: 0,
              alt: null,
            },
          }),
        ]);

        imageStored = true;
      } catch {
        // Der Grund steht im Serverlog des Aufrufers; hier zählt nur, dass
        // die Feldübernahme daran nicht scheitert.
        imageError = "Das erkannte Bild konnte nicht gespeichert werden.";
      }
    }
  }

  if (Object.keys(data).length > 0 || imageStored) {
    await prisma.vehicle.update({
      where: { id: input.vehicleId },
      data: {
        ...data,
        priceSheetImportedAt: new Date(),
        priceSheetSource: fileName,
      },
    });
  }

  return { appliedFields, imageStored, imageError };
}
