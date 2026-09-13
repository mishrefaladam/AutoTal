import type {
  EnrichmentChangeKind,
  EnrichmentField,
  EnrichmentTargetRef,
} from "./import-enrichment";

/**
 * Obergrenze der Fahrzeuglisten-PDF – gilt für Client und Server gleich.
 *
 * Vercel nimmt je Anfrage höchstens 4,5 MB Body an und antwortet darüber mit
 * 413, bevor eine Zeile Code läuft. CSV und Multipart-Rahmen brauchen etwas
 * Platz; 4 MB für die PDF lassen dafür Reserve. Der Client prüft das vor dem
 * Hochladen – eine Ablehnung nach dem Upload wäre nur verlorene Zeit.
 */
export const MAX_LIST_PDF_BYTES = 4 * 1024 * 1024;

/** Alles zusammen muss unter dem Body-Limit der Plattform bleiben. */
export const MAX_IMPORT_REQUEST_BYTES = 4.5 * 1024 * 1024 - 64 * 1024;

/**
 * Fachliche Obergrenze der Fahrzeugliste beim direkten Upload nach Vercel
 * Blob. Dort gilt das Function-Limit nicht; 25 MB decken auch Listen mit
 * deutlich mehr Fahrzeugen und Fotos.
 */
export const MAX_LIST_PDF_DIRECT_BYTES = 25 * 1024 * 1024;

/** Referenz auf eine bereits direkt hochgeladene Fahrzeugliste. */
export type ListPdfReference = {
  /** Pfad im Blob-Store, z. B. "temp/vehicle-imports/<uuid>-<suffix>.pdf". */
  pathname: string;
  /** Ursprünglicher Dateiname – nur zur Anzeige. */
  name: string;
  size: number;
};

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
  /** Ergänzung aus der Fahrzeuglisten-PDF, falls eine hochgeladen wurde. */
  enrichment: ImportEnrichmentDto | null;
};

// ---------------------------------------------------------------------------
// Fahrzeuglisten-PDF: anzeigefertig für das Review
// ---------------------------------------------------------------------------

/** Ein mögliches Zielfahrzeug einer PDF-Karte, mit dem, was sich ändern würde. */
export type EnrichmentOptionDto = {
  ref: EnrichmentTargetRef;
  /** Schlüssel für Auswahlfelder, z. B. "existing:abc" oder "create:12". */
  key: string;
  title: string;
  /** Unterscheidungsmerkmale in einer Zeile: "12/2016 · 294.330 km · 17.990 €". */
  detail: string;
  changes: EnrichmentChangeDto[];
  /** Foto vorausgewählt, weil das Fahrzeug noch keines hat. */
  imagePreselected: boolean;
};

export type EnrichmentChangeDto = {
  field: EnrichmentField;
  label: string;
  kind: EnrichmentChangeKind;
  current: string | null;
  proposed: string;
  preselected: boolean;
};

export type EnrichmentEntryDto = {
  cardKey: string;
  title: string;
  variant: string | null;
  /** Kennzahlen der Karte: "12/2016 · 294.330 km · 17.990 €". */
  detail: string;
  /** safe = genau ein Treffer; ambiguous = mehrere; unmatched = keiner. */
  matchKind: "safe" | "ambiguous" | "unmatched";
  /** Bei "safe" das gefundene Fahrzeug, sonst null. */
  defaultKey: string | null;
  options: EnrichmentOptionDto[];
  hasImage: boolean;
  warnings: string[];
};

export type ImportEnrichmentDto = {
  fileName: string;
  listedAt: string | null;
  pages: number;
  counts: { cards: number; safe: number; ambiguous: number; unmatched: number };
  entries: EnrichmentEntryDto[];
  warnings: string[];
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
  /** Aus der Fahrzeuglisten-PDF ergänzte Fahrzeuge und gespeicherte Fotos. */
  enriched: number;
  imagesStored: number;
  /** Zeilen, die beim Schreiben scheiterten. Nie stillschweigend. */
  failures: string[];
};

export type ImportErrorResponse = { error: string };
