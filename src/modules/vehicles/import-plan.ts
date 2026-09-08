import type { ParsedVehicleRow } from "./csv-import";

/**
 * Was ein Import mit dem Bestand machen würde – als reine Berechnung.
 *
 * Bewusst ohne Datenbank: Der Plan entsteht aus den eingelesenen Zeilen und
 * einer Liste bereits vorhandener Fahrzeuge. Dadurch ist genau das prüfbar,
 * worauf es ankommt – Zuordnung, Duplikate und der Umgang mit Fahrzeugen, die
 * in der Datei fehlen. Geschrieben wird ausschließlich in `import-service.ts`.
 *
 * Der Plan ändert von sich aus nie einen Verkaufsstatus und löscht nie etwas.
 */

/** Quelle, die importierte Fahrzeuge von handgepflegten unterscheidbar macht. */
export const IMPORT_SOURCE = "csv-import";

export type ExistingVehicle = {
  id: string;
  title: string;
  stockNumber: string | null;
  vin: string | null;
  make: string;
  model: string;
  color: string | null;
  priceCents: number;
  mileageKm: number;
  firstRegistration: Date | null;
  /** null = nie über den Import angelegt, also von Hand gepflegt. */
  importedAt: Date | null;
  missingSinceImportAt: Date | null;
};

/** Fachliche Werte, die eine Importzeile setzt. Alles andere bleibt unberührt. */
export type ImportValues = {
  make: string;
  model: string;
  color: string | null;
  priceCents: number;
  mileageKm: number;
  firstRegistration: Date | null;
};

export type PlannedCreate = {
  kind: "create";
  line: number;
  stockNumber: string | null;
  vin: string | null;
  values: ImportValues;
  warnings: string[];
};

export type PlannedUpdate = {
  kind: "update";
  line: number;
  id: string;
  title: string;
  stockNumber: string | null;
  vin: string | null;
  /** Womit zugeordnet wurde – steht so auch im Ergebnis der Oberfläche. */
  matchedBy: "vin" | "stockNumber";
  values: ImportValues;
  /** Fachlich geänderte Felder. Leer = unverändert. */
  changedFields: (keyof ImportValues)[];
  /** true, wenn das Fahrzeug zuvor als fehlend markiert war. */
  wasMissing: boolean;
  /**
   * true, wenn das Fahrzeug schon aus einem früheren Import stammt. Bei false
   * wurde es von Hand angelegt und wird jetzt erstmals einer Importzeile
   * zugeordnet – dann setzt der Import `importedAt`, ohne einen vorhandenen
   * Wert zu überschreiben.
   */
  previouslyImported: boolean;
  warnings: string[];
};

export type PlannedMissing = {
  id: string;
  title: string;
  /** true, wenn die Markierung schon aus einem früheren Import stammt. */
  alreadyFlagged: boolean;
};

export type SkippedRow = { line: number; reason: string };

export type ImportPlan = {
  creates: PlannedCreate[];
  /** Zeilen mit fachlichen Änderungen. */
  updates: PlannedUpdate[];
  /** Zugeordnete Zeilen ohne fachliche Änderung. */
  unchanged: PlannedUpdate[];
  /**
   * Zuvor importierte Fahrzeuge, die in dieser Datei fehlen.
   *
   * Sie werden ausschließlich markiert: kein Löschen, kein automatisches
   * "verkauft", keine Änderung der Sichtbarkeit. Von Hand angelegte Fahrzeuge
   * stehen hier nie – sie waren nie Teil eines Imports.
   */
  missing: PlannedMissing[];
  skipped: SkippedRow[];
};

/** Baujahr -> 1. Jänner. Genauer gibt die CSV es nicht her. */
export function yearToDate(year: number | null): Date | null {
  return year === null ? null : new Date(Date.UTC(year, 0, 1));
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

function toValues(row: ParsedVehicleRow, fallback?: ExistingVehicle): ImportValues {
  return {
    make: row.make,
    model: row.model,
    // Leere Spalten überschreiben nichts: Was im Admin ergänzt wurde, bleibt
    // stehen, wenn die CSV dazu nichts sagt.
    color: row.color ?? fallback?.color ?? null,
    priceCents: row.priceCents ?? fallback?.priceCents ?? 0,
    mileageKm: row.mileageKm ?? fallback?.mileageKm ?? 0,
    firstRegistration: yearToDate(row.year) ?? fallback?.firstRegistration ?? null,
  };
}

function diff(values: ImportValues, existing: ExistingVehicle): (keyof ImportValues)[] {
  const changed: (keyof ImportValues)[] = [];

  if (values.make !== existing.make) changed.push("make");
  if (values.model !== existing.model) changed.push("model");
  if (values.color !== existing.color) changed.push("color");
  if (values.priceCents !== existing.priceCents) changed.push("priceCents");
  if (values.mileageKm !== existing.mileageKm) changed.push("mileageKm");
  if (!sameDay(values.firstRegistration, existing.firstRegistration)) {
    changed.push("firstRegistration");
  }

  return changed;
}

export function planVehicleImport(input: {
  rows: ParsedVehicleRow[];
  existing: ExistingVehicle[];
}): ImportPlan {
  const byVin = new Map<string, ExistingVehicle>();
  const byStockNumber = new Map<string, ExistingVehicle>();

  for (const vehicle of input.existing) {
    if (vehicle.vin) byVin.set(vehicle.vin, vehicle);
    if (vehicle.stockNumber) byStockNumber.set(vehicle.stockNumber, vehicle);
  }

  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];
  const unchanged: PlannedUpdate[] = [];
  const skipped: SkippedRow[] = [];

  /** Bereits in dieser Datei vergebene Merkmale – gegen Dubletten innerhalb einer CSV. */
  const seenVins = new Set<string>();
  const seenStockNumbers = new Set<string>();
  /** Zugeordnete Bestandsfahrzeuge; alles Übrige gilt am Ende als fehlend. */
  const touched = new Set<string>();

  for (const row of input.rows) {
    // --- Zeilen ohne jedes Merkmal ---------------------------------------
    // Sie ließen sich bei keinem weiteren Import wiedererkennen und würden
    // jedes Mal ein zusätzliches Fahrzeug anlegen. Deshalb ausdrücklich
    // übersprungen statt still angelegt.
    if (!row.vin && !row.stockNumber) {
      skipped.push({
        line: row.line,
        reason:
          `${row.make} ${row.model}: weder FIN noch GW-Nr vorhanden. Ohne ` +
          `eines der beiden Merkmale ließe sich die Zeile bei keinem weiteren ` +
          `Import wiedererkennen – bitte im Händlersystem ergänzen oder das ` +
          `Fahrzeug von Hand anlegen.`,
      });
      continue;
    }

    if (row.vin && seenVins.has(row.vin)) {
      skipped.push({
        line: row.line,
        reason: `FIN ${row.vin} kommt in der Datei mehrfach vor. Nur das erste Vorkommen wurde übernommen.`,
      });
      continue;
    }

    if (row.stockNumber && seenStockNumbers.has(row.stockNumber)) {
      skipped.push({
        line: row.line,
        reason: `GW-Nr ${row.stockNumber} kommt in der Datei mehrfach vor. Nur das erste Vorkommen wurde übernommen.`,
      });
      continue;
    }

    if (row.vin) seenVins.add(row.vin);
    if (row.stockNumber) seenStockNumbers.add(row.stockNumber);

    // --- Zuordnung: FIN schlägt GW-Nr ------------------------------------
    // Die FIN identifiziert ein Fahrzeug weltweit eindeutig, eine
    // Bestandsnummer nur innerhalb des Händlersystems und kann nach einem
    // Verkauf neu vergeben werden.
    const matchedByVin = row.vin ? byVin.get(row.vin) : undefined;
    const matched =
      matchedByVin ??
      (row.stockNumber ? byStockNumber.get(row.stockNumber) : undefined);

    if (!matched) {
      creates.push({
        kind: "create",
        line: row.line,
        stockNumber: row.stockNumber,
        vin: row.vin,
        values: toValues(row),
        warnings: row.warnings,
      });
      continue;
    }

    if (touched.has(matched.id)) {
      skipped.push({
        line: row.line,
        reason: `Zeile zeigt auf dasselbe Fahrzeug wie eine frühere Zeile (${matched.title}) und wurde übersprungen.`,
      });
      continue;
    }

    touched.add(matched.id);

    const values = toValues(row, matched);
    const changedFields = diff(values, matched);

    const planned: PlannedUpdate = {
      kind: "update",
      line: row.line,
      id: matched.id,
      title: matched.title,
      stockNumber: row.stockNumber ?? matched.stockNumber,
      vin: row.vin ?? matched.vin,
      matchedBy: matchedByVin ? "vin" : "stockNumber",
      values,
      changedFields,
      wasMissing: matched.missingSinceImportAt !== null,
      previouslyImported: matched.importedAt !== null,
      warnings: row.warnings,
    };

    if (changedFields.length > 0) updates.push(planned);
    else unchanged.push(planned);
  }

  // --- Fahrzeuge, die in dieser Datei fehlen ------------------------------
  // Nur solche, die überhaupt einmal importiert wurden. Ein von Hand
  // angelegtes Fahrzeug war nie Teil einer CSV und darf deshalb nicht als
  // "fehlt" erscheinen.
  const missing: PlannedMissing[] = input.existing
    .filter((vehicle) => vehicle.importedAt !== null && !touched.has(vehicle.id))
    .map((vehicle) => ({
      id: vehicle.id,
      title: vehicle.title,
      alreadyFlagged: vehicle.missingSinceImportAt !== null,
    }));

  return { creates, updates, unchanged, missing, skipped };
}
