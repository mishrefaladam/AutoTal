import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { batchFiles } from "@/lib/upload-batches";

/**
 * Fahrzeugbilder: mehrere auf einmal hochladen, sortieren, Titelbild.
 *
 * Das Datenmodell (VehicleImage.position) und die Upload-Route konnten
 * mehrere Bilder schon; die Oberfläche hat es nur umständlich gemacht. Die
 * Tests hier sichern das Zusammenspiel: Stapelbildung im Client gegen die
 * Server-Grenzen, Position 0 als Titelbild, Reihenfolge in der Datenbank.
 */

const route = readFileSync("src/app/api/admin/vehicles/[id]/images/route.ts", "utf8");
const manager = readFileSync("src/components/admin/vehicle-image-manager.tsx", "utf8");
const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");

// ---------------------------------------------------------------------------
// 10: Mehrere Bilder in einem Vorgang
// ---------------------------------------------------------------------------

describe("Mehrere Bilder hochladen", () => {
  it("nimmt mehrere Dateien in einer Anfrage an", () => {
    assert.match(route, /formData\s*\.getAll\("files"\)/);
    assert.match(manager, /multiple/);
    assert.match(manager, /body\.append\("files", file\)/);
  });

  it("teilt eine große Auswahl in Stapel innerhalb der Server-Grenzen", () => {
    const mb = 1024 * 1024;
    const files = [
      { size: 1.5 * mb, name: "a" },
      { size: 1.5 * mb, name: "b" },
      { size: 1.5 * mb, name: "c" },
      { size: 0.5 * mb, name: "d" },
    ];
    const batches = batchFiles(files, 4 * mb, 20);

    assert.equal(batches.length, 2);
    assert.deepEqual(batches[0].map((f) => f.name), ["a", "b"]);
    assert.deepEqual(batches[1].map((f) => f.name), ["c", "d"]);
  });

  it("begrenzt die Anzahl je Stapel", () => {
    const files = Array.from({ length: 45 }, (_, i) => ({ size: 1, name: String(i) }));
    const batches = batchFiles(files, 4 * 1024 * 1024, 20);
    assert.deepEqual(batches.map((b) => b.length), [20, 20, 5]);
  });

  it("lässt eine zu große Datei allein in ihren Stapel – der Server lehnt sie benannt ab", () => {
    const mb = 1024 * 1024;
    const batches = batchFiles([{ size: 6 * mb }, { size: 1 * mb }], 4 * mb, 20);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 1);
  });

  it("zeigt Status und Fehler je Datei", () => {
    assert.match(manager, /type FileOutcome/);
    assert.match(manager, /"pending" \| "uploading" \| "done" \| "failed"/);
    assert.match(manager, /von \$\{outcomes\.length\} hochgeladen/);
    // Der Server meldet abgelehnte Dateien als "name: Grund".
    assert.match(route, /skipped\.push\(`\$\{file\.name\}: /);
    assert.match(manager, /failed\.set\(entry\.slice\(0, separator\)/);
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
  it("verwendet weiterhin das Titelbild", () => {
    const social = readFileSync("src/modules/social/repository.ts", "utf8");
    const socialActions = readFileSync("src/modules/social/actions.ts", "utf8");
    assert.match(social, /orderBy: \{ position: "asc" \}, take: 1/);
    assert.match(socialActions, /vehicle\.images\.slice\(0, 1\)/);
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
    assert.match(service, /listPdf: File \| null = null/);
    assert.match(service, /const enrichment = listPdf\s*\?/);
    assert.match(importRoute, /pdfEntry instanceof File && pdfEntry\.size > 0 \? pdfEntry : null/);
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
