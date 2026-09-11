import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decodeCsv,
  detectDelimiter,
  parseEuroToCents,
  parseGermanInteger,
  parseVehicleCsv,
  sanitizeCell,
} from "@/modules/vehicles/csv-import";
import {
  planVehicleImport,
  yearToDate,
  type ExistingVehicle,
} from "@/modules/vehicles/import-plan";

/**
 * CSV-Bestandsimport.
 *
 * Der Import ist der einzige Weg, auf dem Fahrzeugdaten von außen in die
 * interne Tabelle gelangen. Entsprechend geprüft wird hier vor allem, was
 * dabei schiefgehen kann: doppelte Anlagen bei jedem Lauf, still verschluckte
 * Zeilen und Fahrzeuge, die aus dem Export fallen und deshalb verschwinden.
 *
 * Einlesen und Planen sind reine Funktionen und werden direkt geprüft. Für die
 * schreibende Schicht und den Endpunkt gilt der Quelltext als Beleg – beide
 * brauchen eine Datenbank bzw. eine Sitzung.
 */

const HEADER = "GW-Nr;FIN;Marke;Modell;Farbe;KM-Stand;Baujahr;Verkaufspreis;Angebotspreis;online auf;Standzeit (Tage)";

/**
 * Die Fixtures beschreiben inserierte Fahrzeuge. Ein leeres "online auf"
 * hieße "nicht inseriert" und würde vom Import ausgesondert – deshalb wird die
 * Spalte hier vorbelegt, wenn eine Zeile sie leer lässt. Tests, die gezielt
 * inaktive Fahrzeuge prüfen, stehen in vehicle-csv-inactive.test.ts.
 */
function csv(...rows: string[]): string {
  const listed = rows.map((row) => {
    const cells = row.split(";");
    if (cells.length === 11 && cells[9] === "") cells[9] = "willhaben";
    return cells.join(";");
  });
  return [HEADER, ...listed].join("\n");
}

const VIN_A = "WVWZZZ1KZAW123456";
const VIN_B = "WAUZZZ8V7JA987654";

function existing(overrides: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: "veh-1",
    title: "VW Golf",
    stockNumber: null,
    vin: null,
    make: "VW",
    model: "Golf",
    color: "Blau",
    priceCents: 1_250_000,
    listPriceCents: null,
    mileageKm: 145_000,
    firstRegistration: yearToDate(2019),
    daysInStock: null,
    importFingerprint: null,
    importedAt: new Date("2026-09-01T10:00:00Z"),
    missingSinceImportAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Einlesen
// ---------------------------------------------------------------------------

describe("CSV einlesen", () => {
  it("erkennt das Semikolon deutscher Exporte", () => {
    assert.equal(detectDelimiter(HEADER), ";");
    assert.equal(detectDelimiter("a,b,c,d"), ",");
  });

  it("entfernt eine Byte Order Mark", () => {
    const bytes = new TextEncoder().encode("﻿Marke;Modell");
    assert.equal(decodeCsv(bytes), "Marke;Modell");
  });

  it("liest Windows-1252 statt Unsinn zu erzeugen", () => {
    // "Grün" in Windows-1252: 0xFC ist kein gültiges UTF-8.
    const bytes = Uint8Array.from([0x47, 0x72, 0xfc, 0x6e]);
    assert.equal(decodeCsv(bytes), "Grün");
  });

  it("ordnet Spalten unabhängig von Schreibweise und Leerzeichen zu", () => {
    const parsed = parseVehicleCsv(
      "  gw nr ; fin ;MARKE;modell\nA-1;" + VIN_A + ";VW;Golf",
    );

    assert.deepEqual(
      parsed.mapping.matched.map((entry) => entry.field),
      ["stockNumber", "vin", "make", "model"],
    );
    assert.equal(parsed.rows[0].make, "VW");
    assert.equal(parsed.rows[0].stockNumber, "A-1");
  });

  it("meldet fehlende Pflichtspalten, statt leer durchzulaufen", () => {
    const parsed = parseVehicleCsv("GW-Nr;Farbe\nA-1;Blau");

    assert.equal(parsed.rows.length, 0);
    assert.equal(parsed.errors.length, 1);
    assert.match(parsed.errors[0].message, /Marke, Modell/);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6: deutsche Zahlenformate
// ---------------------------------------------------------------------------

describe("Deutsche Zahlenformate", () => {
  it("liest Preise mit Tausenderpunkt und Dezimalkomma", () => {
    assert.equal(parseEuroToCents("12.500"), 1_250_000);
    assert.equal(parseEuroToCents("12.500,50"), 1_250_050);
    assert.equal(parseEuroToCents("EUR 12.500,-"), 1_250_000);
    assert.equal(parseEuroToCents("9.990,00 €"), 999_000);
    assert.equal(parseEuroToCents(""), null);
  });

  it("verwechselt Tausenderpunkt nicht mit Dezimalpunkt", () => {
    // "12.500" sind zwölftausendfünfhundert, nicht zwölfeinhalb.
    assert.equal(parseGermanInteger("12.500"), 12_500);
    // Zwei Nachkommastellen hinter einem Punkt sind dagegen dezimal.
    assert.equal(parseEuroToCents("12.50"), 1_250);
  });

  it("liest Kilometerangaben mit Einheit und Leerzeichen", () => {
    assert.equal(parseGermanInteger("145.000 km"), 145_000);
    assert.equal(parseGermanInteger("145 000"), 145_000);
    assert.equal(parseGermanInteger("0"), 0);
  });

  it("übernimmt die Formate aus einer vollständigen Zeile", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_A};VW;Golf;Blau;145.000 km;2019;13.900,00;12.500,-;willhaben;42`),
    );

    const row = parsed.rows[0];
    assert.equal(row.mileageKm, 145_000);
    assert.equal(row.year, 2019);
    // Der Angebotspreis gewinnt gegen den Verkaufspreis.
    assert.equal(row.priceCents, 1_250_000);
    assert.equal(row.standingDays, 42);
  });
});

// ---------------------------------------------------------------------------
// 4: fehlende optionale Werte
// ---------------------------------------------------------------------------

describe("Fehlende optionale Werte", () => {
  it("übernimmt eine Zeile, die nur Kennung, Marke und Modell hat", () => {
    const parsed = parseVehicleCsv(csv(`A-1;;VW;Golf;;;;;;;`));

    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.rows.length, 1);

    const row = parsed.rows[0];
    assert.equal(row.vin, null);
    assert.equal(row.color, null);
    assert.equal(row.mileageKm, null);
    assert.equal(row.year, null);
    assert.equal(row.priceCents, null);
    assert.equal(row.listPriceCents, null);

    // Der fehlende Preis wird benannt: Ohne ihn lässt sich ein neues Fahrzeug
    // nicht anlegen, ein bestehendes behält seinen bisherigen.
    assert.equal(row.warnings.length, 1);
    assert.match(row.warnings[0], /Kein Preis angegeben/);
  });

  it("überschreibt gepflegte Werte nicht mit leeren Spalten", () => {
    const parsed = parseVehicleCsv(csv(`A-1;;VW;Golf;;;;;;;`));
    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing({ stockNumber: "A-1" })],
    });

    // Farbe, Preis, Kilometer und Baujahr stammen weiterhin aus dem Bestand.
    assert.equal(plan.unchanged.length, 1);
    assert.deepEqual(plan.unchanged[0].changedFields, []);
    assert.equal(plan.unchanged[0].values.color, "Blau");
    assert.equal(plan.unchanged[0].values.priceCents, 1_250_000);
  });
});

// ---------------------------------------------------------------------------
// 1: neues Fahrzeug
// ---------------------------------------------------------------------------

describe("Neues Fahrzeug", () => {
  it("legt an, was im Bestand nicht vorkommt", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;willhaben;42`),
    );
    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 1);
    assert.equal(plan.updates.length, 0);

    const created = plan.creates[0];
    assert.equal(created.vin, VIN_A);
    assert.equal(created.stockNumber, "A-1");
    assert.equal(created.values.priceCents, 1_250_000);
    assert.equal(created.values.firstRegistration?.getUTCFullYear(), 2019);
  });

  it("legt beim zweiten Lauf derselben Datei nichts erneut an", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;willhaben;42`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [
        existing({
          vin: VIN_A,
          stockNumber: "A-1",
          color: "Blau",
          priceCents: 1_250_000,
          mileageKm: 145_000,
          daysInStock: 42,
    importFingerprint: null,
        }),
      ],
    });

    assert.equal(plan.creates.length, 0);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.unchanged.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2 + 3: Zuordnung bestehender Fahrzeuge
// ---------------------------------------------------------------------------

describe("Zuordnung bestehender Fahrzeuge", () => {
  it("ordnet über die FIN zu", () => {
    const parsed = parseVehicleCsv(
      csv(`ANDERE-NR;${VIN_A};VW;Golf;Blau;150.000;2019;;12.500;willhaben;50`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing({ vin: VIN_A, stockNumber: "A-1" })],
    });

    assert.equal(plan.creates.length, 0);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].matchedBy, "vin");
    assert.equal(plan.updates[0].id, "veh-1");
    assert.deepEqual(plan.updates[0].changedFields, ["mileageKm", "daysInStock"]);
  });

  it("ordnet über die GW-Nr zu, wenn keine FIN vorliegt", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;;VW;Golf;Blau;145.000;2019;;13.900;willhaben;50`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing({ stockNumber: "A-1" })],
    });

    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].matchedBy, "stockNumber");
    assert.deepEqual(plan.updates[0].changedFields, ["priceCents", "daysInStock"]);
  });

  it("zieht die FIN der GW-Nr vor", () => {
    // Dieselbe GW-Nr wurde nach einem Verkauf neu vergeben; die FIN zeigt auf
    // das richtige Fahrzeug.
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_B};Audi;A4;Grau;80.000;2018;;22.000;willhaben;10`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [
        existing({ id: "alt", stockNumber: "A-1" }),
        existing({ id: "neu", title: "Audi A4", vin: VIN_B, make: "Audi", model: "A4" }),
      ],
    });

    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].id, "neu");
    assert.equal(plan.updates[0].matchedBy, "vin");
  });

  it("nimmt eine Zeile ohne FIN und GW-Nr über die Ersatzkennung auf", () => {
    // Der echte Bestandsexport lässt die GW-Nr leer und führt nur bei einem
    // Drittel eine FIN. Baujahr und Kilometerstand tragen die Zuordnung dann.
    const parsed = parseVehicleCsv(csv(`;;VW;Golf;Blau;145.000;2019;;12.500;;`));
    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].fingerprint, "vw|golf|2019|145000");
  });

  it("überspringt Zeilen, aus denen sich keine Kennung bilden lässt", () => {
    // Ohne Baujahr und Kilometerstand wären zwei VW Golf nicht mehr
    // auseinanderzuhalten.
    const parsed = parseVehicleCsv(csv(`;;VW;Golf;Blau;;;;12.500;;`));
    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 0);
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /keine Ersatzkennung/);
  });

  it("meldet Dubletten innerhalb einer Datei", () => {
    const parsed = parseVehicleCsv(
      csv(
        `A-1;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;;`,
        `A-2;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;;`,
      ),
    );

    const plan = planVehicleImport({ rows: parsed.rows, existing: [] });

    assert.equal(plan.creates.length, 1);
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /mehrfach/);
  });
});

// ---------------------------------------------------------------------------
// 7: Fahrzeug fehlt im neuen Import
// ---------------------------------------------------------------------------

describe("Fahrzeug fehlt im neuen Import", () => {
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");

  it("markiert es, statt es zu löschen oder zu verkaufen", () => {
    const parsed = parseVehicleCsv(
      csv(`A-2;${VIN_B};Audi;A4;Grau;80.000;2018;;22.000;;`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing({ vin: VIN_A, stockNumber: "A-1" })],
    });

    assert.equal(plan.missing.length, 1);
    assert.equal(plan.missing[0].id, "veh-1");
    assert.equal(plan.missing[0].alreadyFlagged, false);
  });

  it("markiert von Hand angelegte Fahrzeuge nie als fehlend", () => {
    // Sie waren nie Teil eines Imports – "fehlt" wäre eine Falschaussage.
    const parsed = parseVehicleCsv(
      csv(`A-2;${VIN_B};Audi;A4;Grau;80.000;2018;;22.000;;`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing({ importedAt: null })],
    });

    assert.equal(plan.missing.length, 0);
  });

  it("nimmt die Markierung zurück, sobald das Fahrzeug wieder auftaucht", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;;`),
    );

    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [
        existing({
          vin: VIN_A,
          missingSinceImportAt: new Date("2026-09-05T00:00:00Z"),
        }),
      ],
    });

    assert.equal(plan.missing.length, 0);
    assert.equal([...plan.updates, ...plan.unchanged][0].wasMissing, true);
  });

  it("löscht im schreibenden Teil nichts und ändert keinen Verkaufsstatus", () => {
    assert.ok(
      !/vehicle\.delete|deleteMany/.test(service),
      "Der Import darf keine Fahrzeuge löschen",
    );
    assert.ok(
      !/status:\s*"SOLD"|status:\s*"RESERVED"/.test(service),
      "Der Import darf keinen Verkaufsstatus setzen",
    );
    // Fehlende werden ausschließlich markiert.
    assert.match(service, /data:\s*\{\s*missingSinceImportAt:\s*now\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// 10: fehlerhafte Zeilen
// ---------------------------------------------------------------------------

describe("Fehlerhafte Zeilen", () => {
  it("erzeugt eine Meldung statt eines Abbruchs", () => {
    const parsed = parseVehicleCsv(
      csv(
        `A-1;${VIN_A};VW;Golf;Blau;145.000;2019;;12.500;;`,
        `A-2;;;;;;;;;;`,
        `A-3;${VIN_B};Audi;A4;Grau;80.000;2018;;22.000;;`,
      ),
    );

    // Die gute Zeile davor und die gute Zeile danach bleiben erhalten.
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].line, 3);
    assert.match(parsed.errors[0].message, /Marke und Modell/);
  });

  it("warnt bei unlesbaren Zahlen, statt die Zeile zu verwerfen", () => {
    const parsed = parseVehicleCsv(
      csv(`A-1;${VIN_A};VW;Golf;Blau;keine Angabe;abc;;auf Anfrage;;`),
    );

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].mileageKm, null);
    assert.equal(parsed.rows[0].priceCents, null);
    // Kilometer, Baujahr, unlesbarer Preis und der fehlende Preis.
    assert.equal(parsed.rows[0].warnings.length, 4);
  });

  it("warnt bei einer FIN, die nicht 17 Zeichen hat", () => {
    const parsed = parseVehicleCsv(csv(`A-1;KURZ123;VW;Golf;;;;;;;`));

    assert.equal(parsed.rows[0].vin, "KURZ123");
    assert.match(parsed.rows[0].warnings[0], /17 Zeichen/);
  });
});

// ---------------------------------------------------------------------------
// Sicherheit
// ---------------------------------------------------------------------------

describe("Sicherheit", () => {
  const route = readFileSync(
    "src/app/api/admin/vehicles/import/route.ts",
    "utf8",
  );
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");

  it("weist Unangemeldete ab", () => {
    assert.match(route, /const session = await getAdminSession\(\)/);
    assert.match(route, /if \(!session\)/);
    assert.match(route, /status: 401/);
  });

  it("liegt hinter dem Proxy-Schutz für /admin", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    // Der Matcher schließt nur Assets aus – /api/admin/... fällt darunter.
    assert.match(proxy, /_next\/static/);
    assert.match(proxy, /authProxy/);
  });

  it("prüft Dateityp, Endung und Größe", () => {
    assert.match(service, /ALLOWED_EXTENSIONS/);
    assert.match(service, /ALLOWED_TYPES/);
    assert.match(service, /file\.size > MAX_CSV_BYTES/);
  });

  it("gibt keinen Stacktrace nach außen", () => {
    // Nur ausdrücklich für Nutzer formulierte Fehler werden durchgereicht.
    assert.match(route, /error instanceof UserFacingError/);
    assert.ok(!/error\.stack|String\(error\)/.test(route));
  });

  it("entschärft Formelzeichen, damit kein Export sie ausführt", () => {
    const cell = sanitizeCell('=HYPERLINK("http://boese.example")');
    assert.ok(!cell.value.startsWith("="));
    assert.equal(cell.neutralized, true);

    // Ein Minus bleibt: In Zahlenfeldern ist es ein gültiger Wert.
    assert.equal(sanitizeCell("-5").value, "-5");
  });

  it("meldet entschärfte Zellen, statt sie still zu ändern", () => {
    const parsed = parseVehicleCsv(csv(`A-1;;=cmd|' /c calc';Golf;;;;;;;`));

    assert.equal(parsed.rows.length, 1);
    assert.ok(!parsed.rows[0].make.startsWith("="));
    assert.match(parsed.rows[0].warnings[0], /Formelzeichen/);
  });

  it("holt keine Fahrzeugdaten von außen", () => {
    const csvModule = readFileSync("src/modules/vehicles/csv-import.ts", "utf8");
    const forbidden = /fetch\(|axios|willhaben\.at|autopro24/i;

    for (const [name, source] of [
      ["csv-import", csvModule],
      ["import-service", service],
      ["route", route],
    ] as const) {
      assert.ok(!forbidden.test(source), `${name} darf nichts abrufen`);
    }
  });
});

// ---------------------------------------------------------------------------
// 8: Anbindung an Social Media
// ---------------------------------------------------------------------------

describe("Anbindung an Social Media", () => {
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");
  const socialRepository = readFileSync(
    "src/modules/social/repository.ts",
    "utf8",
  );

  it("legt importierte Fahrzeuge im Bestand an", () => {
    // Nur dadurch erscheinen sie im Beitragsassistenten.
    assert.match(service, /status:\s*"IN_STOCK"/);
  });

  it("bringt keine Bilder mit – die Auswahl setzt auch keine voraus", () => {
    assert.ok(!/images:\s*\{/.test(service), "Der Import legt keine Bilder an");
    assert.match(socialRepository, /where:\s*\{\s*status:\s*"IN_STOCK"\s*\}/);
    assert.ok(!/where:[^}]*active:\s*true/.test(socialRepository));
  });

  it("rät weder Kraftstoff noch Getriebe", () => {
    // Der Prompt führt jede gesetzte Angabe als Tatsache. Was die CSV nicht
    // kennt, bleibt leer und taucht dort gar nicht erst auf.
    assert.ok(!/fuel:/.test(service));
    assert.ok(!/transmission:/.test(service));

    const openai = readFileSync("src/integrations/openai/index.ts", "utf8");
    assert.match(openai, /if \(vehicle\.fuel\) facts\.push/);
    assert.match(openai, /if \(vehicle\.transmission\)/);
  });
});
