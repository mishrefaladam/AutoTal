import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Fahrzeugbilder: mehrere auf einmal hochladen, sortieren, Titelbild.
 *
 * Das Datenmodell (VehicleImage.position) und die Upload-Route konnten
 * mehrere Bilder schon; die Oberfläche hat es nur umständlich gemacht. Die
 * Tests hier sichern das Zusammenspiel: eine Datei je Anfrage über eine
 * Warteschlange (die Stapelbildung von früher scheiterte am mobilen Safari),
 * Position 0 als Titelbild, Reihenfolge in der Datenbank.
 */

const route = readFileSync("src/app/api/admin/vehicles/[id]/images/route.ts", "utf8");
const manager = readFileSync("src/components/admin/vehicle-image-manager.tsx", "utf8");
const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");

// ---------------------------------------------------------------------------
// 10: Mehrere Bilder in einem Vorgang
// ---------------------------------------------------------------------------

describe("Mehrere Bilder hochladen", () => {
  it("nimmt mehrere Dateien an – jede in ihrer eigenen Anfrage", () => {
    assert.match(manager, /multiple/);
    // Kein gemeinsamer Multipart-Stapel mehr: Der direkte Weg nach Blob
    // trägt jede Datei einzeln, der Rückfall über die Function ebenso.
    assert.match(manager, /runUploadQueue\(/);
    assert.match(manager, /async function uploadDirect\(vehicleId: string, file: File\)/);
    assert.match(manager, /async function uploadViaFunction\(vehicleId: string, file: File\)/);
    assert.ok(!/batchFiles/.test(manager));
    // Die bestehende Route nimmt weiterhin mehrere Dateien – andere Aufrufer
    // bleiben unberührt.
    assert.match(route, /formData\s*\.getAll\("files"\)/);
  });

  it("lädt höchstens zwei Bilder gleichzeitig hoch", () => {
    assert.match(manager, /const UPLOAD_CONCURRENCY = 2;/);
    assert.match(manager, /concurrency: UPLOAD_CONCURRENCY/);
  });

  it("zeigt Status und Fehler je Datei", () => {
    assert.match(manager, /type FileOutcome/);
    assert.match(manager, /state: UploadItemState/);
    assert.match(manager, /von \$\{outcomes\.length\} hochgeladen/);
    assert.match(manager, /fehlgeschlagen/);
    assert.match(manager, /outcome\.state\.kind === "retrying"/);
    // Der Server meldet abgelehnte Dateien als "name: Grund".
    assert.match(route, /skipped\.push\(`\$\{file\.name\}: /);
    assert.match(manager, /skipped\?\.\[0\]\?\.split\(": "\)/);
  });

  it("nimmt Dateien per Ablegen an", () => {
    assert.match(manager, /onDrop=\{\(event\) => \{/);
    assert.match(manager, /event\.dataTransfer\.files/);
    assert.match(manager, /file\.type\.startsWith\("image\/"\)/);
  });

  it("respektiert die bestehenden Grenzen", () => {
    assert.match(route, /ALLOWED_IMAGE_TYPES/);
    assert.match(route, /MAX_IMAGE_BYTES/);
    assert.match(route, /MAX_UPLOAD_REQUEST_BYTES/);
    assert.match(route, /MAX_IMAGES_PER_VEHICLE/);
    assert.match(manager, /accept="image\/jpeg,image\/png,image\/webp"/);
  });
});

// ---------------------------------------------------------------------------
// 11–15: Galerie
// ---------------------------------------------------------------------------

describe("Galerie", () => {
  it("schließt neue Bilder hinten an, statt Bestehende zu ersetzen", () => {
    assert.match(route, /let position = vehicle\._count\.images/);
    assert.match(route, /position \+= 1/);
    assert.ok(!/vehicleImage\.deleteMany/.test(route));
  });

  it("zeigt Position 0 als Titelbild", () => {
    assert.match(manager, /index === 0 && \(/);
    assert.match(manager, /Titelbild/);
  });

  it("setzt ein Bild in einem Schritt auf Position 0", () => {
    assert.match(manager, /onClick=\{\(\) => moveTo\(index, 0\)\}/);
    assert.match(manager, /als Titelbild verwenden/);
  });

  it("speichert die Reihenfolge als Position in der Datenbank", () => {
    const reorder = actions.slice(
      actions.indexOf("export async function reorderVehicleImages"),
      actions.indexOf("export async function", actions.indexOf("export async function reorderVehicleImages") + 10),
    );
    assert.match(reorder, /data: \{ position: index \}/);
    // Nur eigene Bilder – eine fremde ID wird abgewiesen.
    assert.match(reorder, /ownedIds\.has\(id\)/);
  });

  it("sortiert per Ziehen und weiterhin per Pfeil", () => {
    assert.match(manager, /draggable=\{!pending\}/);
    assert.match(manager, /onDragStart/);
    assert.match(manager, /moveTo\(dragIndex, index\)/);
    assert.match(manager, /move\(index, -1\)/);
    assert.match(manager, /move\(index, 1\)/);
  });

  it("löscht ein Bild samt Datei", () => {
    assert.match(manager, /deleteVehicleImage\(id\)/);
    const del = actions.slice(actions.indexOf("export async function deleteVehicleImage"));
    assert.match(del, /vehicleImage\.delete\(/);
    assert.match(del, /getFileStorage\(\)\.remove\(image\.url\)/);
  });

  it("braucht keine neue Bibliothek", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies)) {
      assert.ok(!/dnd|sortable|dropzone/i.test(name), `${name} ist neu`);
    }
  });
});

// ---------------------------------------------------------------------------
// 16: Social Media
// ---------------------------------------------------------------------------

describe("Social Media", () => {
  it("wählt bei neuen Entwürfen die Galerie und behält den Legacy-Fallback", () => {
    const social = readFileSync("src/modules/social/repository.ts", "utf8");
    const socialActions = readFileSync("src/modules/social/actions.ts", "utf8");
    // Fahrzeugwahl: nur das Titelbild als Vorschau.
    assert.match(social, /orderBy: \{ position: "asc" \}, take: 1/);
    // Neue Entwürfe erhalten die kompatible Galerie; bestehende bleiben unverändert.
    assert.match(social, /images: \{ orderBy: \{ position: "asc" \}, select: \{ url: true \} \}/);
    assert.match(socialActions, /imageUrls:\s*defaultInstagramImages\(/);
    assert.match(socialActions, /galleryUrls\.slice\(0, 1\)/);
  });
});

// ---------------------------------------------------------------------------
// 1, 18: Bestehende Flows
// ---------------------------------------------------------------------------

describe("Bestehende Flows", () => {
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");
  const importRoute = readFileSync("src/app/api/admin/vehicles/import/route.ts", "utf8");
  const importUi = readFileSync("src/components/admin/vehicle-import.tsx", "utf8");

  it("läuft der CSV-Import ohne PDF wie bisher", () => {
    assert.match(service, /listPdf: ListPdfSource \| null = null/);
    assert.match(service, /const enrichment = listPdf\s*\?/);
    assert.match(importRoute, /pdfEntry instanceof File && pdfEntry\.size > 0/);
    assert.match(importUi, /Ohne PDF läuft der Import wie bisher/);
  });

  it("bleibt das einzelne Preisblatt beim Fahrzeug", () => {
    const sheet = readFileSync("src/modules/vehicles/price-sheet-service.ts", "utf8");
    assert.match(sheet, /export async function applyPriceSheet/);
    assert.match(sheet, /export async function analysePriceSheet/);
    // Die Fahrzeugliste weist auf den Preisblatt-Weg hin, statt ihn zu ersetzen.
    // Die Meldung ist im Quelltext über zwei Zeilen verteilt.
    assert.match(service, /einzelnes Preisblatt laden Sie bitte direkt beim jeweiligen Fahrzeug hoch/);
  });

  it("liest die Vorschau und das Bestätigen über dieselbe Routine", () => {
    assert.match(importRoute, /const preview = await buildImportPreview\(file, pdf\)/);
    assert.match(importRoute, /applyImportPlan\(preview, decisions\)/);
  });

  it("prüft die Entscheidungen des Reviews streng", () => {
    assert.match(importRoute, /decisionsSchema/);
    assert.match(importRoute, /z\.enum\(ENRICHMENT_FIELDS\)/);
    assert.match(importRoute, /\.max\(500\)/);
  });

  it("braucht keine Migration", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    assert.match(schema, /model VehicleImage \{[\s\S]*?position Int/);
    assert.match(schema, /powerKw\s+Int\?/);
    assert.match(schema, /displacementCcm\s+Int\?/);
    assert.match(schema, /drivetrain\s+DrivetrainType\?/);
  });
});

// ---------------------------------------------------------------------------
// Vorschau: Größe, Fortschritt, Fehlerpfad
// ---------------------------------------------------------------------------

describe("Import-Vorschau: Upload und Wartezeit", () => {
  const importUi = readFileSync("src/components/admin/vehicle-import.tsx", "utf8");
  const dto = readFileSync("src/modules/vehicles/import-dto.ts", "utf8");

  it("hält den Request unter dem Body-Limit von Vercel – die PDF geht direkt nach Blob", () => {
    // 4,5 MB je Anfrage, darüber 413 vor der ersten Codezeile. Der Request
    // trägt die PDF nur noch im Rückfall ohne Blob-Speicher; dort gilt die
    // knappe Grenze, sonst nur der Pfad.
    assert.match(dto, /MAX_LIST_PDF_BYTES = 4 \* 1024 \* 1024/);
    assert.match(dto, /MAX_IMPORT_REQUEST_BYTES = 4\.5 \* 1024 \* 1024/);
    assert.match(dto, /MAX_LIST_PDF_DIRECT_BYTES = 25 \* 1024 \* 1024/);
    assert.match(importUi, /inRequest > MAX_LIST_PDF_BYTES/);
    assert.match(importUi, /selected\.size \+ inRequest > MAX_IMPORT_REQUEST_BYTES/);
    const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");
    assert.match(service, /source\.file\.size > MAX_LIST_PDF_BYTES/);
  });

  it("prüft die Größe, bevor irgendetwas hochgeladen wird", () => {
    const send = importUi.slice(importUi.indexOf("async function send("));
    assert.ok(
      send.indexOf("sizeProblem(selected, pdf)") < send.indexOf("new FormData()"),
      "Größenprüfung vor dem Bauen des Requests",
    );
  });

  it("bleibt bei einer Nicht-JSON-Antwort nicht hängen", () => {
    // Ein 413 der Plattform kommt als Klartext. Vorher warf response.json()
    // und die Seite blieb für immer bei "Dateien werden gelesen …".
    assert.match(importUi, /JSON\.parse\(xhr\.responseText\)/);
    assert.match(importUi, /xhr\.status === 413/);
    assert.match(importUi, /xhr\.onerror/);
    assert.ok(!/response\.json\(\)/.test(importUi));
  });

  it("zeigt echten Upload-Fortschritt und danach die Analysephase", () => {
    assert.match(importUi, /xhr\.upload\.onprogress/);
    assert.match(importUi, /event\.lengthComputable/);
    assert.match(importUi, /kind: "uploading"; what: "pdf" \| "request"; sent: number; total: number/);
    assert.match(importUi, /kind: "analyzing"/);
    assert.match(importUi, /Fahrzeugliste wird analysiert/);
    assert.match(importUi, /CSV wird gelesen und mit dem Bestand abgeglichen/);
    assert.ok(!/Dateien werden gelesen …/.test(importUi));
  });

  it("zeigt keinen erfundenen Prozentwert", () => {
    const notice = importUi.slice(importUi.indexOf("function ProgressNotice"));
    assert.ok(!/%/.test(notice.slice(0, notice.indexOf("// ----"))), "kein Prozentzeichen");
    assert.match(notice, /formatMegabytes\(phase\.sent\)/);
  });

  it("weist nach 15 Sekunden darauf hin, dass noch verarbeitet wird", () => {
    assert.match(importUi, /SLOW_HINT_AFTER_MS = 15_000/);
    assert.match(importUi, /Die Fahrzeugliste wird noch verarbeitet\. Bei größeren PDFs kann dies\s+einen Moment dauern\./);
  });

  it("protokolliert serverseitig nur Dauern, keine Inhalte", () => {
    const route = readFileSync("src/app/api/admin/vehicles/import/route.ts", "utf8");
    const log = route.slice(route.indexOf('logger.info("Bestandsvorschau erstellt"'));
    const block = log.slice(0, log.indexOf("});") + 3);
    assert.match(block, /\.\.\.preview\.timings/);
    assert.match(block, /requestMs/);
    assert.ok(!/fileName|rows|cards:\s*preview\.enrichment\?\.list\.cards\b[^.]/.test(block));
    assert.ok(!/vin|stockNumber|make|model/.test(block), "keine Fahrzeugdaten im Log");
  });
});
