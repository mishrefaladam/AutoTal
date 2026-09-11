import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parsePriceColumn, parseVehicleCsv } from "@/modules/vehicles/csv-import";
import {
  planVehicleImport,
  type ExistingVehicle,
} from "@/modules/vehicles/import-plan";

/**
 * Preisübernahme aus dem Bestandsexport.
 *
 * Der Fehler, um den es hier geht: WillhabenPro schreibt in die Spalte
 * "Angebotspreis" eine 0, wenn es keinen Aktionspreis gibt – in einem echten
 * Export steht das in jeder einzelnen Zeile. Die frühere Auswertung nahm den
 * Angebotspreis mit `??` vor den Verkaufspreis; 0 ist aber weder null noch
 * undefined, also gewann die 0, und jedes importierte Fahrzeug landete mit
 * 0 € im Bestand.
 *
 * Geprüft wird gegen dieselben Spalten und Schreibweisen wie im echten Export.
 */

const HEADER =
  "GW-Nr;FIN;Marke;Modell;Farbe;KM-Stand;Baujahr;Verkaufspreis;Angebotspreis;online auf;Standzeit (Tage)";

const VIN = "WVWZZZ1KZAW123456";

/** Eine Zeile mit frei wählbaren Preisspalten. */
function row(sale: string, offer: string): ReturnType<typeof parseVehicleCsv> {
  return parseVehicleCsv(
    `${HEADER}\nA-1;${VIN};BMW;X3 Reihe;Schwarz;245.858;2015;${sale};${offer};willhaben;42`,
  );
}

function existing(overrides: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: "veh-1",
    title: "BMW X3 Reihe",
    stockNumber: "A-1",
    vin: VIN,
    make: "BMW",
    model: "X3 Reihe",
    color: "Schwarz",
    priceCents: 1_649_000,
    listPriceCents: null,
    mileageKm: 245_858,
    firstRegistration: new Date(Date.UTC(2015, 0, 1)),
    daysInStock: 42,
    importFingerprint: null,
    importedAt: new Date("2026-09-01T10:00:00Z"),
    missingSinceImportAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1–3: Zuordnung der beiden Preisspalten
// ---------------------------------------------------------------------------

describe("Preiszuordnung", () => {
  it("nimmt den Angebotspreis als beworbenen Preis", () => {
    const parsed = row("17.990", "15.990");

    assert.equal(parsed.rows[0].priceCents, 1_599_000);
    assert.equal(parsed.rows[0].listPriceCents, 1_799_000);
  });

  it("führt den Verkaufspreis als Listenpreis, wenn er abweicht", () => {
    assert.equal(row("17.990", "15.990").rows[0].listPriceCents, 1_799_000);
  });

  it("führt keinen Listenpreis, wenn beide Spalten gleich sind", () => {
    // Zwei gleiche Zahlen in zwei Feldern wären keine Information, sondern
    // eine Dublette, die beim nächsten Preiswechsel auseinanderläuft.
    assert.equal(row("15.990", "15.990").rows[0].listPriceCents, null);
  });

  it("nutzt den Verkaufspreis, wenn kein Angebotspreis dasteht", () => {
    const parsed = row("16.490", "");

    assert.equal(parsed.rows[0].priceCents, 1_649_000);
    assert.equal(parsed.rows[0].listPriceCents, null);
  });

  it("behandelt einen Angebotspreis von 0 als fehlende Angabe", () => {
    // Genau der Fall des echten Exports: Verkaufspreis 16.490, Angebot 0.
    const parsed = row("16.490", "0");

    assert.equal(parsed.rows[0].priceCents, 1_649_000);
    assert.equal(parsed.rows[0].listPriceCents, null);
  });

  it("nimmt auch eine allgemeine Spalte „Preis“ an", () => {
    const parsed = parseVehicleCsv(
      `GW-Nr;Marke;Modell;Preis\nA-1;BMW;X3 Reihe;16.490`,
    );

    assert.equal(parsed.rows[0].priceCents, 1_649_000);
  });

  it("erkennt „Listenpreis“ als Spaltenüberschrift", () => {
    const parsed = parseVehicleCsv(
      `GW-Nr;Marke;Modell;Listenpreis;Angebotspreis\nA-1;BMW;X3;17.990;15.990`,
    );

    assert.equal(parsed.rows[0].priceCents, 1_599_000);
    assert.equal(parsed.rows[0].listPriceCents, 1_799_000);
  });
});

// ---------------------------------------------------------------------------
// 4–6: Schreibweisen
// ---------------------------------------------------------------------------

describe("Deutsche Preisformate", () => {
  it("liest alle geforderten Schreibweisen als denselben Betrag", () => {
    for (const written of [
      "16490",
      "16490,00",
      "16.490",
      "16.490,00",
      "€ 16.490",
      "€ 16.490,-",
      "16 490,00",
      "16.490,00 €",
    ]) {
      assert.equal(
        parsePriceColumn(written),
        1_649_000,
        `„${written}“ ergab nicht 1.649.000 Cent`,
      );
    }
  });

  it("rechnet in ganzen Cent, ohne Fließkommarest", () => {
    assert.equal(parsePriceColumn("16.490,05"), 1_649_005);
    assert.equal(Number.isInteger(parsePriceColumn("0,07")), true);
    assert.equal(parsePriceColumn("0,07"), 7);
  });

  it("wertet 0, Negatives und Unlesbares als „keine Angabe“", () => {
    assert.equal(parsePriceColumn("0"), null);
    assert.equal(parsePriceColumn("0,00"), null);
    assert.equal(parsePriceColumn("-500"), null);
    assert.equal(parsePriceColumn("auf Anfrage"), null);
    assert.equal(parsePriceColumn(""), null);
  });
});

// ---------------------------------------------------------------------------
// 7 + 8: Bestehende Preise und neue Fahrzeuge
// ---------------------------------------------------------------------------

describe("Aktualisieren und Anlegen", () => {
  it("lässt einen leeren CSV-Preis den gepflegten Preis nicht löschen", () => {
    const plan = planVehicleImport({
      rows: row("", "").rows,
      existing: [existing()],
    });

    const entry = [...plan.updates, ...plan.unchanged][0];

    assert.ok(entry, "Zeile wurde nicht zugeordnet");
    assert.equal(entry.values.priceCents, 1_649_000);
    assert.ok(!entry.changedFields.includes("priceCents"));
  });

  it("schreibt beim Aktualisieren kein leeres Preisfeld", () => {
    // `undefined` heißt für Prisma "Feld nicht anfassen" – eine ausdrückliche
    // null würde den Preis leeren.
    const service = readFileSync(
      "src/modules/vehicles/import-service.ts",
      "utf8",
    );

    assert.match(service, /priceCents: entry\.values\.priceCents \?\? undefined/);
    assert.match(
      service,
      /listPriceCents: entry\.values\.listPriceCents \?\? undefined/,
    );
  });

  it("legt ein neues Fahrzeug ohne Preis nicht mit 0 € an", () => {
    const plan = planVehicleImport({ rows: row("", "").rows, existing: [] });

    assert.equal(plan.creates.length, 0, "kein Fahrzeug für 0 €");
    assert.equal(plan.skipped.length, 1);
    assert.match(plan.skipped[0].reason, /kein Preis in der Datei/);
  });

  it("benennt den fehlenden Preis schon beim Einlesen", () => {
    const parsed = row("", "");

    assert.equal(parsed.rows[0].priceCents, null);
    assert.match(parsed.rows[0].warnings.join(" "), /Kein Preis angegeben/);
  });

  it("legt mit Preis ganz normal an", () => {
    const plan = planVehicleImport({ rows: row("", "15.990").rows, existing: [] });

    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].values.priceCents, 1_599_000);
  });

  it("meldet eine Preisänderung als Änderung", () => {
    const plan = planVehicleImport({
      rows: row("", "15.990").rows,
      existing: [existing({ priceCents: 1_649_000 })],
    });

    assert.equal(plan.updates.length, 1);
    assert.ok(plan.updates[0].changedFields.includes("priceCents"));
    assert.equal(plan.updates[0].values.priceCents, 1_599_000);
    assert.equal(plan.updates[0].previousPriceCents, 1_649_000);
  });
});

// ---------------------------------------------------------------------------
// 9–12: Vorschau, Speichern, Anzeige, Social Media
// ---------------------------------------------------------------------------

describe("Vorschau, Speichern und Weitergabe", () => {
  const route = readFileSync(
    "src/app/api/admin/vehicles/import/route.ts",
    "utf8",
  );
  const importUi = readFileSync(
    "src/components/admin/vehicle-import.tsx",
    "utf8",
  );
  const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");

  it("stellt in der Vorschau den bisherigen dem neuen Preis gegenüber", () => {
    // Der bisherige Preis wird nur mitgegeben, wenn er sich auch ändert.
    assert.match(route, /previousPriceCents: entry\.changedFields\.includes\("priceCents"\)/);
    assert.match(route, /\?\s*entry\.previousPriceCents/);
    assert.match(importUi, /row\.previousPriceCents !== null/);
    assert.match(importUi, /formatEuro\(row\.previousPriceCents\)/);
  });

  it("macht in der Vorschau sichtbar, warum ein Preis fehlt", () => {
    // Zeilenwarnungen und übersprungene Zeilen werden beide einzeln
    // aufgeführt, nichts wird zusammengefasst.
    assert.match(importUi, /row\.warnings\.map/);
    assert.match(importUi, /data\.skipped\.map/);
  });

  it("speichert den Preis beim Anlegen und beim Aktualisieren", () => {
    assert.match(service, /\.\.\.create\.values/);
    assert.match(service, /\.\.\.entry\.values/);
  });

  it("führt den Preis in der Admin-Fahrzeugliste", () => {
    const repository = readFileSync(
      "src/modules/vehicles/admin-repository.ts",
      "utf8",
    );
    const list = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/page.tsx",
      "utf8",
    );

    assert.match(repository, /priceCents: true/);
    assert.match(list, /formatEuro\(vehicle\.priceCents\)/);
  });

  it("gibt den Preis an die Beitragsauswahl und den Prompt weiter", () => {
    const social = readFileSync("src/modules/social/repository.ts", "utf8");
    const openai = readFileSync("src/integrations/openai/index.ts", "utf8");

    assert.match(social, /priceCents: true/);
    assert.match(openai, /formatEuro\(vehicle\.priceCents\)/);
  });
});
