import "server-only";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/result";

import { decodeCsv, parseVehicleCsv, type ParsedCsv } from "./csv-import";
import {
  IMPORT_SOURCE,
  planVehicleImport,
  type ExistingVehicle,
  type ImportPlan,
  type PlannedCreate,
} from "./import-plan";
import { buildVehicleSlug, buildVehicleTitle } from "./slug";

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
 */

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
export async function buildImportPreview(file: File): Promise<ImportPreview> {
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

  const plan = planVehicleImport({
    rows: parsed.rows,
    existing: await loadExistingVehicles(),
  });

  return { fileName, parsed, plan };
}

/** Bestand in der Form laden, die der Planer braucht. */
async function loadExistingVehicles(): Promise<ExistingVehicle[]> {
  const rows = await prisma.vehicle.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      variant: true,
      color: true,
      stockNumber: true,
      vin: true,
      priceCents: true,
      mileageKm: true,
      firstRegistration: true,
      importedAt: true,
      missingSinceImportAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: buildVehicleTitle(row),
    stockNumber: row.stockNumber,
    vin: row.vin,
    make: row.make,
    model: row.model,
    color: row.color,
    priceCents: row.priceCents,
    mileageKm: row.mileageKm,
    firstRegistration: row.firstRegistration,
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
  now = new Date(),
): Promise<{ outcome: ImportOutcome; failures: string[] }> {
  const { plan, fileName, parsed } = preview;
  const failures: string[] = [];

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let markedMissing = 0;
  let reappeared = 0;

  for (const create of plan.creates) {
    const externalId = externalIdFor(create);

    try {
      await prisma.vehicle.create({
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
          stockNumber: entry.stockNumber,
          vin: entry.vin,
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
    },
    failures,
  };
}
