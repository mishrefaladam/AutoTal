import type { ParsedVehicleRow } from "./csv-import";
import { mergeEquipment } from "./equipment";

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
  features?: string[];
  id: string;
  title: string;
  stockNumber: string | null;
  vin: string | null;
  make: string;
  model: string;
  color: string | null;
  priceCents: number;
  listPriceCents: number | null;
  mileageKm: number;
  firstRegistration: Date | null;
  daysInStock: number | null;
  /** Gespeicherte Ersatzkennung, sofern das Fahrzeug so angelegt wurde. */
  importFingerprint: string | null;
  /** null = nie über den Import angelegt, also von Hand gepflegt. */
  importedAt: Date | null;
  missingSinceImportAt: Date | null;
};

/** Fachliche Werte, die eine Importzeile setzt. Alles andere bleibt unberührt. */
export type ImportValues = {
  features?: string[];
  make: string;
  model: string;
  color: string | null;
  /**
   * Beworbener Preis in Cent.
   *
   * null heißt "die Datei nennt keinen und das Fahrzeug hat noch keinen".
   * Bewusst nicht 0: Ein Fahrzeug für null Euro würde im Admin, auf der
   * Fahrzeugkarte und im Instagram-Text genau so erscheinen.
   */
  priceCents: number | null;
  /** Listenpreis, nur wenn er vom beworbenen Preis abweicht. */
  listPriceCents: number | null;
  mileageKm: number;
  firstRegistration: Date | null;
  /** Standzeit in Tagen. Die CSV führt sie als eigene Spalte. */
  daysInStock: number | null;
};

/**
 * Werte eines anzulegenden Fahrzeugs.
 *
 * Der Preis ist hier verbindlich: Zeilen ohne Preis werden gar nicht erst zu
 * einem `PlannedCreate` – der Planer überspringt sie mit Begründung.
 */
export type CreateValues = ImportValues & { priceCents: number };

export type PlannedCreate = {
  kind: "create";
  line: number;
  stockNumber: string | null;
  vin: string | null;
  /** Nur belegt, wenn weder FIN noch GW-Nr vorliegen. */
  fingerprint: string | null;
  values: CreateValues;
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
  matchedBy: "vin" | "stockNumber" | "fingerprint";
  /** Kennung, unter der das Fahrzeug künftig wiedererkannt wird. */
  fingerprint: string | null;
  values: ImportValues;
  /** Fachlich geänderte Felder. Leer = unverändert. */
  changedFields: (keyof ImportValues)[];
  /** Preis vor dem Import – für die Gegenüberstellung in der Vorschau. */
  previousPriceCents: number;
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

/**
 * Ersatzkennung aus Marke, Modell, Baujahr und Kilometerstand.
 *
 * WOZU: Der Bestandsexport von willhabenPro lässt die GW-Nr-Spalte leer und
 * führt nur bei einem Drittel der Fahrzeuge eine FIN. Ohne ein drittes
 * Merkmal bliebe der Rest bei jedem Import liegen.
 *
 * WARUM DIESE VIER FELDER: An vier echten Exporten über zehn Tage gemessen
 * sind sie bei 49 von 50 Fahrzeugen eindeutig und über die Tage stabil – der
 * Kilometerstand eines Fahrzeugs im Bestand veränderte sich in keinem einzigen
 * Fall. Der Preis ist bewusst NICHT dabei: Er änderte sich bei 3 von 17
 * Fahrzeugen, und ein gesenkter Preis würde ein Fahrzeug sonst zu einem neuen
 * machen.
 *
 * Fehlt Baujahr oder Kilometerstand, entsteht keine Kennung: Zwei Fahrzeuge
 * gleicher Marke und gleichen Modells wären damit nicht mehr auseinanderzu-
 * halten, und eine falsche Zuordnung ist schlimmer als gar keine.
 */
export function buildImportFingerprint(input: {
  make: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
}): string | null {
  if (input.year === null || input.mileageKm === null) return null;

  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");

  const make = normalize(input.make);
  const model = normalize(input.model);
  if (make === "" || model === "") return null;

  return `${make}|${model}|${input.year}|${input.mileageKm}`;
}

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
    ...(row.features?.length ? { features: mergeEquipment(fallback?.features ?? [], row.features) } : {}),
    make: row.make,
    model: row.model,
    // Leere Spalten überschreiben nichts: Was im Admin ergänzt wurde, bleibt
    // stehen, wenn die CSV dazu nichts sagt.
    color: row.color ?? fallback?.color ?? null,
    // Leere Preisspalten lassen den gepflegten Preis stehen.
    priceCents: row.priceCents ?? fallback?.priceCents ?? null,
    listPriceCents: row.listPriceCents ?? fallback?.listPriceCents ?? null,
    mileageKm: row.mileageKm ?? fallback?.mileageKm ?? 0,
    firstRegistration: yearToDate(row.year) ?? fallback?.firstRegistration ?? null,
    daysInStock: row.standingDays ?? fallback?.daysInStock ?? null,
  };
}

function diff(values: ImportValues, existing: ExistingVehicle): (keyof ImportValues)[] {
  const changed: (keyof ImportValues)[] = [];
  if (values.features && JSON.stringify(values.features) !== JSON.stringify(existing.features ?? [])) {
    changed.push("features");
  }

  if (values.make !== existing.make) changed.push("make");
  if (values.model !== existing.model) changed.push("model");
  if (values.color !== existing.color) changed.push("color");
  if (values.priceCents !== existing.priceCents) changed.push("priceCents");
  if (values.listPriceCents !== existing.listPriceCents) {
    changed.push("listPriceCents");
  }
  if (values.mileageKm !== existing.mileageKm) changed.push("mileageKm");
  if (!sameDay(values.firstRegistration, existing.firstRegistration)) {
    changed.push("firstRegistration");
  }
  if (values.daysInStock !== existing.daysInStock) changed.push("daysInStock");

  return changed;
}

export function planVehicleImport(input: {
  rows: ParsedVehicleRow[];
  existing: ExistingVehicle[];
}): ImportPlan {
  const byVin = new Map<string, ExistingVehicle>();
  const byStockNumber = new Map<string, ExistingVehicle>();
  const byFingerprint = new Map<string, ExistingVehicle>();
  /** Kennungen, die im Bestand mehrfach vorkommen – damit unbrauchbar. */
  const ambiguousFingerprints = new Set<string>();

  for (const vehicle of input.existing) {
    if (vehicle.vin) byVin.set(vehicle.vin, vehicle);
    if (vehicle.stockNumber) byStockNumber.set(vehicle.stockNumber, vehicle);

    if (vehicle.importFingerprint) {
      if (byFingerprint.has(vehicle.importFingerprint)) {
        ambiguousFingerprints.add(vehicle.importFingerprint);
      } else {
        byFingerprint.set(vehicle.importFingerprint, vehicle);
      }
    }
  }

  for (const fingerprint of ambiguousFingerprints) {
    byFingerprint.delete(fingerprint);
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

  /** Ersatzkennungen, die in DIESER Datei mehrfach vorkommen. */
  const fingerprintCounts = new Map<string, number>();
  for (const row of input.rows) {
    if (row.vin || row.stockNumber) continue;
    const fingerprint = buildImportFingerprint(row);
    if (!fingerprint) continue;
    fingerprintCounts.set(
      fingerprint,
      (fingerprintCounts.get(fingerprint) ?? 0) + 1,
    );
  }

  for (const row of input.rows) {
    // --- Drittes Merkmal: die Ersatzkennung -------------------------------
    // Nur wenn weder FIN noch GW-Nr dastehen. Sie ist schwächer als beide und
    // soll ihnen deshalb nie vorgreifen.
    const fingerprint =
      !row.vin && !row.stockNumber ? buildImportFingerprint(row) : null;

    // --- Zeilen ohne jedes Merkmal ---------------------------------------
    // Sie ließen sich bei keinem weiteren Import wiedererkennen und würden
    // jedes Mal ein zusätzliches Fahrzeug anlegen. Deshalb ausdrücklich
    // übersprungen statt still angelegt.
    if (!row.vin && !row.stockNumber && !fingerprint) {
      skipped.push({
        line: row.line,
        reason:
          `${row.make} ${row.model}: weder FIN noch GW-Nr vorhanden, und ohne ` +
          `Baujahr und Kilometerstand lässt sich auch keine Ersatzkennung ` +
          `bilden. Bitte im Händlersystem ergänzen oder das Fahrzeug von Hand ` +
          `anlegen.`,
      });
      continue;
    }

    // Mehrere Zeilen mit derselben Ersatzkennung: Der Export unterscheidet
    // diese Fahrzeuge nicht, also kann der Import es auch nicht. Eine davon
    // zu wählen wäre geraten.
    if (fingerprint && (fingerprintCounts.get(fingerprint) ?? 0) > 1) {
      skipped.push({
        line: row.line,
        reason:
          `${row.make} ${row.model}: Diese Zeile ist in allen Merkmalen ` +
          `identisch mit einer anderen (${row.year ?? "?"}, ` +
          `${row.mileageKm ?? "?"} km) und hat weder FIN noch GW-Nr. Beide ` +
          `Fahrzeuge bitte von Hand anlegen oder im Händlersystem eine ` +
          `GW-Nr vergeben.`,
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
    const matchedByStockNumber = row.stockNumber
      ? byStockNumber.get(row.stockNumber)
      : undefined;
    const matchedByFingerprint = fingerprint
      ? byFingerprint.get(fingerprint)
      : undefined;

    const matched = matchedByVin ?? matchedByStockNumber ?? matchedByFingerprint;

    if (!matched) {
      const values = toValues(row);

      // --- Anlegen ohne Preis ----------------------------------------------
      // Ein neues Fahrzeug braucht einen Preis. Ihn auf 0 zu setzen wäre keine
      // Notlösung, sondern eine Falschangabe: "€ 0" stünde in der
      // Fahrzeugliste und ginge über die Caption-Erzeugung in einen
      // Instagram-Beitrag. Deshalb wird die Zeile benannt übersprungen –
      // anlegen kann der Händler sie von Hand.
      if (values.priceCents === null) {
        skipped.push({
          line: row.line,
          reason:
            `${row.make} ${row.model}: kein Preis in der Datei. Ein neues ` +
            `Fahrzeug wird ohne Preis nicht angelegt – bitte den Preis im ` +
            `Export ergänzen oder das Fahrzeug von Hand anlegen.`,
        });
        continue;
      }

      creates.push({
        kind: "create",
        line: row.line,
        stockNumber: row.stockNumber,
        vin: row.vin,
        fingerprint,
        values: { ...values, priceCents: values.priceCents },
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
      matchedBy: matchedByVin
        ? "vin"
        : matchedByStockNumber
          ? "stockNumber"
          : "fingerprint",
      // Beim Aktualisieren mitgeführt: Ändert sich der Kilometerstand in der
      // Datei, muss die gespeicherte Kennung mitwandern – sonst erkennt der
      // nächste Import dasselbe Fahrzeug nicht wieder.
      fingerprint: fingerprint ?? matched.importFingerprint,
      values,
      changedFields,
      previousPriceCents: matched.priceCents,
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
