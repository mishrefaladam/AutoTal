import "server-only";

import { del, get, head, list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { env, isBlobStorageConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";
import { MAX_LIST_PDF_DIRECT_BYTES } from "@/modules/vehicles/import-dto";

import { describeBlobUploadError } from "./vercel-blob";

/**
 * Temporäre Fahrzeuglisten-PDFs: direkt vom Browser nach Vercel Blob.
 *
 * WARUM: Eine Vercel Function nimmt je Anfrage höchstens 4,5 MB Body an und
 * antwortet darüber mit 413, bevor eine Zeile Code läuft. Die Fahrzeugliste
 * aus willhaben liegt mit 32 Fotos bei rund 5 MB – sie kam nie an. Der
 * Browser lädt sie deshalb direkt in den Blob-Store (Vercels dokumentierter
 * Weg um das Limit) und gibt der Anwendung nur noch den Pfad.
 *
 * SICHERHEIT – drei Regeln, die zusammen SSRF und Fremdzugriff ausschließen:
 *
 *   1. Der Client nennt nie eine URL, nur einen Pfad. Und der Pfad muss
 *      exakt dem Muster entsprechen, das die Anwendung selbst vergibt:
 *      `temp/vehicle-imports/<uuid>.pdf`. Alles andere wird abgewiesen, ohne
 *      dass irgendetwas aufgerufen wird.
 *   2. Gelesen wird über das SDK mit unserem Token: `get(pathname)` löst den
 *      Pfad innerhalb UNSERES Stores auf. Ein Pfad aus einem fremden Store
 *      existiert für uns nicht. Es gibt keinen Code, der eine vom Client
 *      gelieferte Adresse per fetch() abruft.
 *   3. Das Upload-Token entsteht serverseitig, nur für angemeldete Admins,
 *      nur für PDF, nur für diesen Präfix, nur bis 25 MB und nur für ein
 *      paar Minuten.
 *
 * PUBLIC ODER PRIVATE: Ein Blob-Store ist entweder öffentlich oder privat –
 * nicht je Datei. Dieser Store ist öffentlich, weil Instagram die
 * Fahrzeugbilder über ihre URL abrufen muss (siehe README). Die PDF liegt
 * deshalb ebenfalls öffentlich, aber unter einem zufälligen, nicht
 * erratbaren Pfad, nur für die Dauer eines Imports, und wird danach gelöscht.
 * Sie enthält ohnehin nur, was der Händler bei willhaben veröffentlicht.
 * Sollte später ein zweiter, privater Store dazukommen, ändert sich hier
 * genau eine Konstante.
 *
 * AUFRÄUMEN: Schließt jemand den Browser mitten im Import, bleibt die Datei
 * liegen. Ohne Cron und ohne Datenbank: Jede Vorschau räumt nebenbei alles
 * unter dem Präfix weg, was älter als einen Tag ist – ein `list`-Aufruf, im
 * Hintergrund, ohne den Import aufzuhalten.
 */

export const TEMP_IMPORT_PREFIX = "temp/vehicle-imports/";

/** Fachliche Obergrenze der Fahrzeugliste – das Function-Limit gilt hier nicht. */
export const TEMP_IMPORT_MAX_BYTES = MAX_LIST_PDF_DIRECT_BYTES;

/** Ein Upload-Token gilt nur kurz; der Upload selbst dauert Sekunden. */
const TOKEN_VALID_MS = 10 * 60 * 1000;

/** Liegengebliebene Dateien: Nach einem Tag ist kein Import mehr im Gang. */
export const TEMP_IMPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Siehe Kopfkommentar "Public oder Private". */
const TEMP_IMPORT_ACCESS = "public" as const;

const PATHNAME_PATTERN = /^temp\/vehicle-imports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[A-Za-z0-9]+)?\.pdf$/;

/**
 * Nur Pfade, die die Anwendung selbst vergibt: Präfix, UUID, optionaler
 * Zufallssuffix von Vercel, `.pdf`. Keine Punkte, keine Schrägstriche, keine
 * Protokolle – ein anderer Store oder ein anderer Host ist damit
 * ausgeschlossen, bevor irgendetwas aufgerufen wird.
 */
export function isTempImportPathname(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && PATHNAME_PATTERN.test(value);
}

/** Vom Client vorgeschlagener Name – vor dem Zufallssuffix. */
export function isProposedTempImportPathname(value: string): boolean {
  return /^temp\/vehicle-imports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/.test(
    value,
  );
}

export function isDirectUploadAvailable(): boolean {
  return isBlobStorageConfigured();
}

function requireToken(): string {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new UserFacingError(
      "Der Dateispeicher ist in dieser Umgebung nicht eingerichtet.",
      "NOT_CONFIGURED",
    );
  }
  return token;
}

/**
 * Token-Route: Der Browser fragt hier nach der Erlaubnis, eine Datei direkt
 * hochzuladen. `handleUpload` prüft die Anfrage des SDK und stellt das Token
 * mit genau den Einschränkungen aus, die `onBeforeGenerateToken` nennt.
 *
 * Wer das aufruft, muss vorher als Admin geprüft sein – das macht die Route.
 */
export async function handleTempImportUpload(
  body: HandleUploadBody,
  request: Request,
): Promise<unknown> {
  const token = requireToken();

  return handleUpload({
    body,
    request,
    token,
    onBeforeGenerateToken: async (pathname) => tempImportTokenOptions(pathname),
  });
}

/**
 * Die Einschränkungen des Upload-Tokens – als reine Funktion, damit sie sich
 * ohne Blob-Store prüfen lassen.
 */
export function tempImportTokenOptions(pathname: string, now = Date.now()) {
  if (!isProposedTempImportPathname(pathname)) {
    throw new UserFacingError("Ungültiger Ablagepfad.", "VALIDATION");
  }

  return {
    allowedContentTypes: ["application/pdf"],
    maximumSizeInBytes: TEMP_IMPORT_MAX_BYTES,
    // Vercel hängt zusätzlich einen Zufallssuffix an – der Pfad ist damit
    // auch dann nicht erratbar, wenn die UUID bekannt wäre.
    addRandomSuffix: true,
    allowOverwrite: false,
    validUntil: now + TOKEN_VALID_MS,
    tokenPayload: null,
  };
}

export type TempImportFile = {
  pathname: string;
  size: number;
  bytes: Buffer;
};

/**
 * Liest die hochgeladene PDF – ausschließlich über das SDK und unseren Token.
 *
 * `head` bestätigt zuerst, dass es die Datei in unserem Store gibt und wie
 * groß sie ist; erst dann fließen Bytes. Ein Pfad, der das Muster erfüllt,
 * aber nie hochgeladen wurde, endet hier mit einer sauberen Meldung.
 */
export async function readTempImport(pathname: unknown): Promise<TempImportFile> {
  if (!isTempImportPathname(pathname)) {
    throw new UserFacingError(
      "Die Fahrzeugliste konnte nicht zugeordnet werden. Bitte laden Sie sie erneut hoch.",
      "VALIDATION",
    );
  }
  const token = requireToken();

  let meta: Awaited<ReturnType<typeof head>>;
  try {
    meta = await head(pathname, { token });
  } catch (error) {
    logger.warn("Temporäre Fahrzeugliste nicht gefunden", {
      ...describeBlobUploadError(error, token),
      pathnamePrefix: TEMP_IMPORT_PREFIX,
    });
    throw new UserFacingError(
      "Die hochgeladene Fahrzeugliste ist nicht mehr vorhanden. Bitte laden Sie sie erneut hoch.",
      "NOT_FOUND",
    );
  }

  if (meta.contentType !== "application/pdf") {
    throw new UserFacingError("Die hochgeladene Datei ist keine PDF.", "VALIDATION");
  }
  if (meta.size > TEMP_IMPORT_MAX_BYTES) {
    throw new UserFacingError(
      `Die Fahrzeugliste ist größer als ${TEMP_IMPORT_MAX_BYTES / 1024 / 1024} MB.`,
      "VALIDATION",
    );
  }

  const result = await get(pathname, { access: TEMP_IMPORT_ACCESS, token, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new UserFacingError(
      "Die Fahrzeugliste konnte nicht gelesen werden. Bitte laden Sie sie erneut hoch.",
      "SERVICE_UNAVAILABLE",
    );
  }

  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { pathname, size: bytes.length, bytes };
}

/** Entfernt eine temporäre PDF. Ein bereits gelöschtes Objekt ist kein Fehler. */
export async function deleteTempImport(pathname: unknown): Promise<boolean> {
  if (!isTempImportPathname(pathname)) return false;
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) return false;

  try {
    await del(pathname, { token });
    return true;
  } catch (error) {
    logger.warn("Temporäre Fahrzeugliste konnte nicht gelöscht werden", {
      ...describeBlobUploadError(error, token),
    });
    return false;
  }
}

/**
 * Räumt liegengebliebene Uploads weg – alles unter dem Präfix, das älter als
 * `maxAgeMs` ist. Läuft nebenbei bei jeder Vorschau; Fehler werden nur
 * protokolliert, der Import wartet nicht darauf.
 */
export async function cleanupStaleTempImports(
  maxAgeMs = TEMP_IMPORT_MAX_AGE_MS,
  now = Date.now(),
): Promise<number> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) return 0;

  try {
    const { blobs } = await list({ prefix: TEMP_IMPORT_PREFIX, limit: 200, token });
    const stale = blobs
      .filter((blob) => now - new Date(blob.uploadedAt).getTime() > maxAgeMs)
      .map((blob) => blob.pathname)
      .filter(isTempImportPathname);

    if (stale.length > 0) {
      await del(stale, { token });
      logger.info("Liegengebliebene Fahrzeuglisten entfernt", { count: stale.length });
    }
    return stale.length;
  } catch (error) {
    logger.warn("Aufräumen temporärer Fahrzeuglisten fehlgeschlagen", {
      ...describeBlobUploadError(error, token),
    });
    return 0;
  }
}
