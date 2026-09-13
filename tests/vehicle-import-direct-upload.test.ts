import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  TEMP_IMPORT_MAX_AGE_MS,
  TEMP_IMPORT_MAX_BYTES,
  TEMP_IMPORT_PREFIX,
  isProposedTempImportPathname,
  isTempImportPathname,
  tempImportTokenOptions,
} from "@/integrations/storage/temp-imports";
import { MAX_LIST_PDF_DIRECT_BYTES } from "@/modules/vehicles/import-dto";

/**
 * Fahrzeuglisten-PDF direkt vom Browser nach Vercel Blob.
 *
 * Das 4,5-MB-Body-Limit einer Vercel Function gilt für den direkten Upload
 * nicht. Die Function bekommt nur noch einen Pfad – und der muss exakt so
 * aussehen, wie die Anwendung ihn selbst vergibt.
 */

const REAL_PDF_BYTES = 5_078_621;
const VALID = "temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf";
const VALID_WITH_SUFFIX =
  "temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b-Kx9Qz2Lm4Pq.pdf";

const uploadRoute = readFileSync("src/app/api/admin/vehicles/import/upload/route.ts", "utf8");
const importRoute = readFileSync("src/app/api/admin/vehicles/import/route.ts", "utf8");
const storage = readFileSync("src/integrations/storage/temp-imports.ts", "utf8");
const client = readFileSync("src/components/admin/vehicle-import.tsx", "utf8");
const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");

// ---------------------------------------------------------------------------
// 1, 2, 3, 4: Größen und Typen
// ---------------------------------------------------------------------------

describe("Grenzen", () => {
  it("lässt die echte 5,08-MB-PDF zu – über dem Function-Limit, unter der fachlichen Grenze", () => {
    const functionLimit = 4.5 * 1024 * 1024;
    assert.ok(REAL_PDF_BYTES > functionLimit, "die echte Datei überschreitet das Function-Limit");
    assert.ok(REAL_PDF_BYTES <= TEMP_IMPORT_MAX_BYTES, "direkt hochgeladen passt sie");
    assert.equal(TEMP_IMPORT_MAX_BYTES, 25 * 1024 * 1024);
    assert.equal(TEMP_IMPORT_MAX_BYTES, MAX_LIST_PDF_DIRECT_BYTES);
  });

  it("schreibt die 25 MB in das Upload-Token", () => {
    const options = tempImportTokenOptions(VALID, 1_000);
    assert.equal(options.maximumSizeInBytes, 25 * 1024 * 1024);
    assert.deepEqual(options.allowedContentTypes, ["application/pdf"]);
    assert.equal(options.addRandomSuffix, true);
    assert.equal(options.allowOverwrite, false);
    assert.equal(options.validUntil, 1_000 + 10 * 60 * 1000);
  });

  it("weist über 25 MB serverseitig beim Lesen ab", () => {
    assert.match(storage, /if \(meta\.size > TEMP_IMPORT_MAX_BYTES\)/);
    assert.match(client, /selected\.size > MAX_LIST_PDF_DIRECT_BYTES/);
  });

  it("nimmt nur PDF an", () => {
    assert.match(storage, /if \(meta\.contentType !== "application\/pdf"\)/);
    assert.match(client, /function isPdfFile/);
    assert.match(client, /contentType: "application\/pdf"/);
  });

  it("schickt eine direkt hochgeladene PDF nie als Request-Body", () => {
    // Nur der Pfad geht mit; die Datei selbst nur im Rückfall ohne Blob.
    assert.match(client, /body\.append\("pdfRef", selection\.ref\.pathname\)/);
    assert.match(client, /if \(selection\?\.kind === "file"\) body\.append\("pdf", selection\.file\)/);
    assert.match(client, /const inRequest = selection\?\.kind === "file" \? selection\.file\.size : 0/);
  });
});

// ---------------------------------------------------------------------------
// 5: Token nur für Admins
// ---------------------------------------------------------------------------

describe("Token-Route", () => {
  it("lehnt unangemeldete Anfragen ab – GET, POST und DELETE", () => {
    const handlers = ["export async function GET", "export async function POST", "export async function DELETE"];
    for (const handler of handlers) {
      const block = uploadRoute.slice(uploadRoute.indexOf(handler));
      const body = block.slice(0, block.indexOf("\n}\n"));
      assert.match(body, /requireSession\(\)/, `${handler} prüft die Anmeldung`);
      assert.match(body, /status: 401/);
    }
  });

  it("stellt das Token nur für den eigenen Präfix aus", () => {
    assert.throws(() => tempImportTokenOptions("fahrzeuge/abc/liste.pdf"), /Ungültiger Ablagepfad/);
    assert.throws(() => tempImportTokenOptions("temp/vehicle-imports/../liste.pdf"), /Ungültiger Ablagepfad/);
    assert.throws(() => tempImportTokenOptions("temp/vehicle-imports/liste.pdf"), /Ungültiger Ablagepfad/);
    assert.throws(() => tempImportTokenOptions("temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.exe"), /Ungültiger Ablagepfad/);
  });

  it("nutzt den vorgesehenen handleUpload-Ablauf des SDK", () => {
    assert.match(storage, /import \{ handleUpload, type HandleUploadBody \} from "@vercel\/blob\/client"/);
    assert.match(storage, /onBeforeGenerateToken: async \(pathname\) => tempImportTokenOptions\(pathname\)/);
    assert.match(client, /import \{ upload \} from "@vercel\/blob\/client"/);
    assert.match(client, /handleUploadUrl: UPLOAD_ROUTE/);
  });

  it("loggt keine Tokens", () => {
    for (const source of [storage, uploadRoute, importRoute]) {
      const logCalls = [...source.matchAll(/logger\.\w+\([\s\S]*?\}\);/g)].map((m) => m[0]);
      for (const call of logCalls) {
        assert.ok(!/\btoken\b\s*[,}]/.test(call), `Token im Log: ${call.slice(0, 80)}`);
      }
    }
    assert.match(storage, /describeBlobUploadError\(error, token\)/, "SDK-Fehler werden bereinigt");
  });
});

// ---------------------------------------------------------------------------
// 6, 7, 8: Referenzen – SSRF
// ---------------------------------------------------------------------------

describe("Referenzen", () => {
  it("akzeptiert einen eigenen Pfad, mit und ohne Zufallssuffix", () => {
    assert.equal(isTempImportPathname(VALID), true);
    assert.equal(isTempImportPathname(VALID_WITH_SUFFIX), true);
    assert.equal(isProposedTempImportPathname(VALID), true);
    assert.equal(isProposedTempImportPathname(VALID_WITH_SUFFIX), false, "der Client schlägt ohne Suffix vor");
  });

  it("weist fremde und externe Adressen ab", () => {
    for (const bad of [
      "https://evil.example/liste.pdf",
      "https://other-store.public.blob.vercel-storage.com/temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
      "http://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
      "//evil.example/x.pdf",
    ]) {
      assert.equal(isTempImportPathname(bad), false, bad);
    }
  });

  it("weist einen falschen Präfix und Pfadtricks ab", () => {
    for (const bad of [
      "fahrzeuge/abc/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
      "temp/other/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
      "temp/vehicle-imports/../../fahrzeuge/x.pdf",
      "temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf/../x",
      "temp/vehicle-imports/3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b.pdf?x=1",
      "temp/vehicle-imports/",
      "",
      42,
      null,
      undefined,
    ]) {
      assert.equal(isTempImportPathname(bad), false, String(bad));
    }
    assert.equal(TEMP_IMPORT_PREFIX, "temp/vehicle-imports/");
  });

  it("ruft nie eine vom Client gelieferte Adresse ab", () => {
    // Gelesen wird ausschließlich über das SDK mit unserem Token; fetch()
    // kommt in der Speicherschicht nicht vor.
    const code = storage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\bfetch\(/.test(code), "kein fetch() in der Speicherschicht");
    assert.match(storage, /await head\(pathname, \{ token \}\)/);
    assert.match(storage, /await get\(pathname, \{ access: TEMP_IMPORT_ACCESS, token/);
  });

  it("prüft die Referenz in der Import-Route, bevor irgendetwas passiert", () => {
    const post = importRoute.slice(importRoute.indexOf("export async function POST"));
    assert.ok(
      post.indexOf("!isTempImportPathname(pdfRef)") < post.indexOf("readTempImport(pdfRef)"),
      "Musterprüfung vor dem Lesen",
    );
    assert.match(post, /status: 400/);
  });
});

// ---------------------------------------------------------------------------
// 9, 10, 11: Vorschau und Bestätigen mit derselben Datei
// ---------------------------------------------------------------------------

describe("Ein Upload für Vorschau und Bestätigen", () => {
  it("liest die Vorschau aus dem Blob-Pfad, ohne PDF-Bytes im Request", () => {
    assert.match(importRoute, /const temp = await readTempImport\(pdfRef\)/);
    assert.match(importRoute, /pdf = \{ kind: "blob", pathname: temp\.pathname/);
    assert.match(service, /kind: "blob"; pathname: string; name: string; bytes: Buffer/);
  });

  it("verwendet beim Bestätigen dieselbe Referenz", () => {
    // Der Client hält die Referenz und schickt sie in beiden Modi mit; ein
    // zweiter Upload kommt im Code nicht vor.
    assert.match(client, /const result = await send\(file, pdf, "commit"/);
    const uploads = client.match(/\bupload\(/g) ?? [];
    assert.equal(uploads.length, 1, "genau ein Aufruf des Blob-Uploads");
    assert.ok(client.indexOf("upload(") < client.indexOf("async function handleImport"));
  });

  it("behält die optimierte Verarbeitung", () => {
    const preview = service.slice(
      service.indexOf("async function buildEnrichmentPreview"),
      service.indexOf("async function applyEnrichment"),
    );
    assert.ok(!/extractImages|decodeImage/.test(preview), "keine Bildbytes in der Vorschau");
    assert.match(service, /if \(!list\.recognized\)/);
  });
});

// ---------------------------------------------------------------------------
// 12, 13, 14: Aufräumen
// ---------------------------------------------------------------------------

describe("Aufräumen", () => {
  it("löscht die temporäre PDF nach erfolgreichem Bestätigen", () => {
    const commit = importRoute.slice(importRoute.indexOf("const decisions = parseDecisions"));
    assert.match(commit, /if \(pdf\?\.kind === "blob" && failures\.length === 0\)/);
    assert.match(commit, /await deleteTempImport\(pdf\.pathname\)/);
    // Und erst nach dem Schreiben – nicht davor.
    assert.ok(commit.indexOf("applyImportPlan(") < commit.indexOf("deleteTempImport("));
  });

  it("lässt die Datei bei Fehlern für einen erneuten Versuch liegen", () => {
    const commit = importRoute.slice(importRoute.indexOf("const decisions = parseDecisions"));
    const catchBlock = importRoute.slice(importRoute.lastIndexOf("} catch (error) {"));
    assert.ok(!/deleteTempImport/.test(catchBlock), "im Fehlerpfad wird nicht gelöscht");
    assert.match(commit, /failures\.length === 0/);
    // Der Client behält die Auswahl, wenn das Bestätigen scheitert.
    const importFn = client.slice(client.indexOf("async function handleImport"));
    assert.match(importFn, /setState\(\{ step: "preview", data: state\.data \}\)/);
  });

  it("räumt bei „PDF entfernen“ die temporäre Datei weg", () => {
    assert.match(client, /method: "DELETE"/);
    assert.match(client, /\$\{UPLOAD_ROUTE\}\?ref=\$\{encodeURIComponent\(pdf\.ref\.pathname\)\}/);
    const del = uploadRoute.slice(uploadRoute.indexOf("export async function DELETE"));
    assert.match(del, /isTempImportPathname\(pathname\)/);
    assert.match(del, /deleteTempImport\(pathname\)/);
  });

  it("räumt liegengebliebene Uploads nach Alter auf – ohne Cron und ohne Datenbank", () => {
    assert.equal(TEMP_IMPORT_MAX_AGE_MS, 24 * 60 * 60 * 1000);
    assert.match(storage, /list\(\{ prefix: TEMP_IMPORT_PREFIX/);
    assert.match(storage, /now - new Date\(blob\.uploadedAt\)\.getTime\(\) > maxAgeMs/);
    // Nur eigene Pfade, und nebenbei bei der Vorschau.
    assert.match(storage, /\.filter\(isTempImportPathname\)/);
    assert.match(importRoute, /void cleanupStaleTempImports\(\)/);
  });
});

// ---------------------------------------------------------------------------
// 15: Ladezustand
// ---------------------------------------------------------------------------

describe("Ladezustand", () => {
  it("endet bei einem fehlgeschlagenen Upload sauber", () => {
    const select = client.slice(client.indexOf("async function handleSelectPdf"));
    assert.match(select, /const restore = \(\)/);
    assert.match(select, /\} catch \(cause\) \{/);
    assert.match(select, /restore\(\);\s*return;/);
  });

  it("zeigt den echten Fortschritt der PDF", () => {
    assert.match(client, /onUploadProgress: \(\{ loaded, total \}\)/);
    assert.match(client, /what: "pdf", sent: loaded, total/);
    assert.match(client, /"Fahrzeugliste wird hochgeladen"/);
    assert.match(client, /Fahrzeugliste wird analysiert/);
  });

  it("fällt ohne Blob-Speicher auf den Request-Upload zurück", () => {
    assert.match(uploadRoute, /directUpload: isDirectUploadAvailable\(\)/);
    assert.match(client, /if \(availability\.directUpload\)/);
    assert.match(client, /selection = \{ kind: "file", file: selected \}/);
  });
});

// ---------------------------------------------------------------------------
// 16, 17, 18: Bestehendes
// ---------------------------------------------------------------------------

describe("Bestehendes", () => {
  it("läuft der reine CSV-Import ohne PDF weiter", () => {
    assert.match(importRoute, /pdfRef !== null && !isTempImportPathname\(pdfRef\)/);
    assert.match(service, /listPdf: ListPdfSource \| null = null/);
    assert.match(client, /Ohne PDF läuft der Import wie bisher/);
  });

  it("lässt die Fahrzeugbild-Uploads unverändert", () => {
    const imagesRoute = readFileSync("src/app/api/admin/vehicles/[id]/images/route.ts", "utf8");
    assert.match(imagesRoute, /MAX_UPLOAD_REQUEST_BYTES/);
    assert.match(imagesRoute, /storage\.upload\(/);
    assert.ok(!/temp-imports|pdfRef/.test(imagesRoute));
  });

  it("hält die Fahrzeugbilder öffentlich – der Store bleibt, wie er ist", () => {
    const blob = readFileSync("src/integrations/storage/vercel-blob.ts", "utf8");
    assert.match(blob, /access: "public"/);
    assert.ok(!/temp-imports/.test(blob), "die Bildablage kennt die PDF-Ablage nicht");
    // Die temporäre PDF liegt im selben, öffentlichen Store – bewusst und
    // dokumentiert, mit zufälligem Pfad und kurzer Lebensdauer.
    assert.match(storage, /const TEMP_IMPORT_ACCESS = "public" as const/);
    assert.match(storage, /PUBLIC ODER PRIVATE/);
  });
});
