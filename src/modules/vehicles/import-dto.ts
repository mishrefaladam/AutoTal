/**
 * Was die Importseite vom Server zurückbekommt.
 *
 * Bewusst ein eigenes, flaches Format statt der internen Plan-Typen: Es geht
 * über die Leitung, muss sich als JSON darstellen lassen und soll nur
 * enthalten, was die Oberfläche wirklich anzeigt. Reine Typen, damit die
 * Client-Komponente nichts Serverseitiges mitzieht.
 */

export type ImportAction = "create" | "update" | "unchanged";

export const IMPORT_ACTION_LABELS: Record<ImportAction, string> = {
  create: "neu",
  update: "aktualisiert",
  unchanged: "unverändert",
};

/** Eine Zeile der Vorschautabelle. */
export type ImportPreviewRow = {
  line: number;
  action: ImportAction;
  title: string;
  stockNumber: string | null;
  vin: string | null;
  priceCents: number | null;
  /** Bisheriger Preis – nur bei Änderungen belegt, für "alt → neu". */
  previousPriceCents: number | null;
  mileageKm: number | null;
  year: number | null;
  /** Womit zugeordnet wurde – nur bei update/unchanged belegt. */
  matchedBy: "vin" | "stockNumber" | "fingerprint" | null;
  /** Fachlich geänderte Felder in Klartext. */
  changed: string[];
  warnings: string[];
};

export type ImportColumn = {
  /** Überschrift, wie sie in der Datei steht. */
  header: string;
  /** Feld, dem sie zugeordnet wurde. */
  label: string;
};

export type ImportCounts = {
  dataRows: number;
  create: number;
  update: number;
  unchanged: number;
  missing: number;
  skipped: number;
  /** Zeilen ohne Inserat – nicht importiert, nur gezählt. */
  inactive: number;
};

export type ImportPreviewResponse = {
  mode: "preview";
  fileName: string;
  columns: ImportColumn[];
  ignoredColumns: string[];
  counts: ImportCounts;
  rows: ImportPreviewRow[];
  /** Zeilen, die übersprungen werden – mit Begründung. */
  skipped: { line: number; reason: string }[];
  /** Fahrzeuge, die in dieser Datei fehlen. Werden nur markiert. */
  missing: { title: string; alreadyFlagged: boolean }[];
  /** Auffälligkeiten der Datei als Ganzes. */
  fileWarnings: string[];
  /** Zeilen, die kein Fahrzeug ergeben. */
  rowErrors: { line: number; message: string }[];
};

export type ImportCommitResponse = {
  mode: "commit";
  fileName: string;
  created: number;
  updated: number;
  unchanged: number;
  markedMissing: number;
  reappeared: number;
  skipped: number;
  rowErrors: number;
  /** Zeilen ohne Inserat – nicht importiert, nur gezählt. */
  inactive: number;
  /** Zeilen, die beim Schreiben scheiterten. Nie stillschweigend. */
  failures: string[];
};

export type ImportErrorResponse = { error: string };
