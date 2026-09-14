import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  VEHICLE_IMAGE_DIRECT_MAX_BYTES,
  isProposedVehicleImagePathname,
  isVehicleImagePathname,
  vehicleImageTokenOptions,
} from "@/integrations/storage/vehicle-images-direct";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/integrations/storage/types";

/**
 * Fahrzeugbilder direkt vom Browser nach Vercel Blob.
 *
 * WARUM: iPhone-Fotos haben drei bis sechs Megabyte. Über die Function
 * (4,5-MB-Body-Limit, Laufzeitgrenze auf Mobilfunk) kamen sie als
 * "Verbindung abgebrochen" zurück. Jetzt geht jedes Bild einzeln in den
 * Store; die Function sieht nur noch einen Pfad – und der muss exakt so
 * aussehen, wie die Anwendung ihn selbst vergibt.
 */

const VEHICLE = "cm3abc123XYZ_-";
const UUID = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";
const PROPOSED = `fahrzeuge/${VEHICLE}/${UUID}.jpg`;
const STORED = `fahrzeuge/${VEHICLE}/${UUID}-Kx9Qz2Lm4Pq.jpg`;

const tokenRoute = readFileSync("src/app/api/admin/vehicles/[id]/images/upload/route.ts", "utf8");
const registerRoute = readFileSync("src/app/api/admin/vehicles/[id]/images/register/route.ts", "utf8");
const storage = readFileSync("src/integrations/storage/vehicle-images-direct.ts", "utf8");
const client = readFileSync("src/components/admin/vehicle-image-manager.tsx", "utf8");

describe("Grenzen", () => {
  it("nimmt ein 5-MB-iPhone-Foto an – über dem Function-Limit, unter Instagrams 8 MB", () => {
    const iphonePhoto = 5.2 * 1024 * 1024;
    assert.ok(iphonePhoto > 4.5 * 1024 * 1024);
    assert.ok(iphonePhoto > MAX_IMAGE_BYTES, "über die Function ginge es nicht");
    assert.ok(iphonePhoto <= VEHICLE_IMAGE_DIRECT_MAX_BYTES, "direkt geht es");
    assert.equal(VEHICLE_IMAGE_DIRECT_MAX_BYTES, 8 * 1024 * 1024);
    assert.match(client, /const DIRECT_MAX_BYTES = 8 \* 1024 \* 1024;/);
  });

  it("schreibt Bildtypen, 8 MB und kurze Gültigkeit in das Upload-Token", () => {
    const options = vehicleImageTokenOptions(VEHICLE, PROPOSED, 1_000);
    assert.deepEqual(options.allowedContentTypes, [...ALLOWED_IMAGE_TYPES]);
    assert.equal(options.maximumSizeInBytes, 8 * 1024 * 1024);
    assert.equal(options.addRandomSuffix, true);
    assert.equal(options.allowOverwrite, false);
    assert.equal(options.validUntil, 1_000 + 10 * 60 * 1000);
  });

  it("prüft Typ und Größe beim Eintragen noch einmal serverseitig", () => {
    assert.match(storage, /ALLOWED_IMAGE_TYPES\.includes\(meta\.contentType/);
    assert.match(storage, /meta\.size > VEHICLE_IMAGE_DIRECT_MAX_BYTES/);
  });
});

describe("Pfade", () => {
  it("erlaubt nur fahrzeuge/<fahrzeug-id>/<uuid>.<bildendung>", () => {
    assert.equal(isProposedVehicleImagePathname(VEHICLE, PROPOSED), true);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/${UUID}.png`), true);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/${UUID}.webp`), true);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/${UUID}.JPEG`), true);

    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/${UUID}.pdf`), false);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/foto.jpg`), false);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/anderes/${UUID}.jpg`), false);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `temp/vehicle-imports/${UUID}.jpg`), false);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `fahrzeuge/${VEHICLE}/../${UUID}.jpg`), false);
    assert.equal(isProposedVehicleImagePathname(VEHICLE, `https://x.public.blob.vercel-storage.com/${PROPOSED}`), false);
    // Das Token trägt bereits den Zufallssuffix nicht – der kommt vom Store.
    assert.equal(isProposedVehicleImagePathname(VEHICLE, STORED), false);
  });

  it("bindet den Pfad an das Fahrzeug – kein Bild landet bei einem anderen", () => {
    assert.equal(isVehicleImagePathname(VEHICLE, STORED), true);
    assert.equal(isVehicleImagePathname(VEHICLE, PROPOSED), true);
    assert.equal(isVehicleImagePathname("anderesFahrzeug", STORED), false);
    assert.equal(isVehicleImagePathname("", STORED), false);
    assert.equal(isVehicleImagePathname("a/b", `fahrzeuge/a/b/${UUID}.jpg`), false);
    assert.equal(isVehicleImagePathname(VEHICLE, 42), false);
    assert.equal(isVehicleImagePathname(VEHICLE, "x".repeat(300)), false);
  });

  it("weist einen falschen Pfad schon beim Token ab", () => {
    assert.throws(
      () => vehicleImageTokenOptions(VEHICLE, `fahrzeuge/${VEHICLE}/${UUID}.pdf`),
      /Ungültiger Ablagepfad/,
    );
  });
});

describe("Sicherheit", () => {
  it("verlangt für Token und Eintrag eine Admin-Sitzung", () => {
    for (const route of [tokenRoute, registerRoute]) {
      assert.match(route, /const session = await getAdminSession\(\)/);
      assert.match(route, /if \(!session\)/);
      assert.match(route, /status: 401/);
    }
    // Auch die Auskunft, ob der direkte Weg offen ist, nur für Admins.
    assert.match(tokenRoute, /export async function GET\(\) \{\s*if \(!\(await getAdminSession\(\)\)\)/);
  });

  it("stellt ein Token nur für ein vorhandenes Fahrzeug aus", () => {
    assert.match(tokenRoute, /prisma\.vehicle\.findUnique\(\{ where: \{ id: vehicleId \}/);
    assert.match(tokenRoute, /status: 404/);
  });

  it("ruft nie eine vom Client gelieferte URL ab", () => {
    // Der Client nennt einen Pfad; die URL kommt aus der Antwort des SDK.
    assert.match(registerRoute, /pathname: z\.string\(\)\.min\(1\)\.max\(240\)/);
    assert.match(storage, /meta = await head\(pathname, \{ token \}\)/);
    assert.match(storage, /url: meta\.url/);
    assert.ok(!/fetch\(/.test(storage), "kein fetch im Storage-Modul");
    assert.ok(!/fetch\(/.test(registerRoute), "kein fetch in der Register-Route");
  });

  it("verrät im Log weder Token noch Bildinhalt", () => {
    assert.ok(!/BLOB_READ_WRITE_TOKEN[^\n]*logger/.test(storage));
    // Das Token geht nur in die Schwärzung – nie als Feld ins Log.
    for (const call of storage.match(/logger\.[a-z]+\([\s\S]*?\n\s*\}\);/g) ?? []) {
      assert.ok(!/\btoken\s*[,}:]/.test(call), "kein Token im Log");
    }
    assert.match(storage, /describeBlobUploadError\(error, token\)/);
    const log = registerRoute.slice(registerRoute.indexOf('logger.info("Fahrzeugbild eingetragen"'));
    const block = log.slice(0, log.indexOf("});") + 3);
    assert.match(block, /sizeBytes: uploaded\.size/);
    assert.ok(!/url|pathname/.test(block), "kein Pfad, keine URL im Log");
  });

  it("schließt neue Bilder hinten an und legt keine Dublette an", () => {
    assert.match(registerRoute, /position: vehicle\._count\.images/);
    assert.match(registerRoute, /vehicleImage\.upsert\(/);
    assert.match(registerRoute, /MAX_IMAGES_PER_VEHICLE = 30/);
  });
});

describe("Client", () => {
  it("lädt mit Blob-Token direkt, sonst eine Datei je Anfrage über die Function", () => {
    assert.match(client, /import \{ upload \} from "@vercel\/blob\/client"/);
    assert.match(client, /access: "public"/);
    assert.match(client, /handleUploadUrl: `\/api\/admin\/vehicles\/\$\{vehicleId\}\/images\/upload`/);
    assert.match(client, /\/api\/admin\/vehicles\/\$\{vehicleId\}\/images\/register/);
    assert.match(client, /direct\s*\?\s*await uploadDirect\(vehicleId, target\.file\)\s*:\s*await uploadViaFunction\(vehicleId, target\.file\)/);
    assert.match(client, /const maxBytes = direct \? DIRECT_MAX_BYTES : MAX_IMAGE_BYTES;/);
  });

  it("schickt kein Base64 und keinen gemeinsamen Multipart-Stapel", () => {
    assert.ok(!/readAsDataURL|base64/i.test(client));
    assert.ok(!/batchFiles/.test(client));
    // Der Rückfall hängt genau eine Datei an.
    const fallback = client.slice(client.indexOf("async function uploadViaFunction"));
    const bodyBlock = fallback.slice(0, fallback.indexOf("const response"));
    assert.equal((bodyBlock.match(/body\.append\("files"/g) ?? []).length, 1);
  });

  it("wiederholt nur Netzwerkfehler – Ablehnungen sind endgültig", () => {
    assert.match(client, /const UPLOAD_MAX_ATTEMPTS = 2;/);
    assert.match(client, /const UPLOAD_BACKOFF_MS = 1500;/);
    // 4xx = Urteil über die Datei, 5xx = vorübergehend.
    assert.match(client, /if \(status >= 400 && status < 500\)/);
    assert.match(client, /new UploadError\([\s\S]*?false,\s*\)/);
    assert.match(client, /new UploadError\(message \?\? "Der Server hat nicht geantwortet", true\)/);
    // Was das Blob-SDK ablehnt (Typ, Größe), wird nicht wiederholt.
    assert.match(client, /rejected \? message : "Die Verbindung ist abgebrochen\."/);
  });

  it("bietet gescheiterte Bilder einzeln zum erneuten Versuch an", () => {
    assert.match(client, /function retryFailed\(\)/);
    assert.match(client, /outcomes\.filter\(\(o\) => o\.state\.kind === "failed"\)/);
    assert.match(client, /onClick=\{retryFailed\}/);
    assert.match(client, /Erneut versuchen/);
    // Erfolgreiche werden nicht noch einmal geschickt.
    assert.match(client, /void runUploads\(failed\)/);
  });

  it("prüft Typ und Größe, bevor ein Byte das Gerät verlässt", () => {
    const worker = client.slice(client.indexOf("await runUploadQueue("));
    assert.ok(
      worker.indexOf("ALLOWED_IMAGE_TYPES.includes") < worker.indexOf("uploadDirect(vehicleId"),
      "Typprüfung vor dem Upload",
    );
    assert.ok(
      worker.indexOf("target.file.size > maxBytes") < worker.indexOf("uploadDirect(vehicleId"),
      "Größenprüfung vor dem Upload",
    );
  });
});
