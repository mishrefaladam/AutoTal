import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EMPTY_VEHICLE_FORM,
  vehicleFormSchema,
} from "@/modules/vehicles/admin-schemas";
import { parseVehicleCsv } from "@/modules/vehicles/csv-import";
import {
  MAX_CUSTOM_EQUIPMENT_LENGTH,
  addEquipment,
  equipmentLines,
  matchesEquipment,
  mergeEquipment,
  removeEquipment,
} from "@/modules/vehicles/equipment";
import {
  EQUIPMENT_CATALOG,
  EXTRAS_CATALOG,
} from "@/modules/vehicles/equipment-catalog";
import {
  planVehicleImport,
  type ExistingVehicle,
} from "@/modules/vehicles/import-plan";
import { mapPriceSheet } from "@/modules/vehicles/price-sheet-mapping";

/**
 * Ausstattung: eine Liste statt drei.
 *
 * `features` ist die zentrale Ausstattung, `extras` bleibt getrennt, und die
 * früheren `highlights` gehen in der Ausstattung auf – in der Datenbank per
 * Migration, in Formular, Import, Preisblatt und KI-Prompt über dieselbe
 * Zusammenführung. Nichts davon darf einen bestehenden Eintrag verlieren
 * oder einen doppelt führen.
 */

// ---------------------------------------------------------------------------
// Zusammenführen
// ---------------------------------------------------------------------------

describe("Zusammenführen", () => {
  it("dedupliziert ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum", () => {
    assert.deepEqual(
      mergeEquipment(
        ["Navigationssystem", " Sitzheizung vorne "],
        ["navigationssystem", "Sitzheizung vorne", "Panoramadach"],
      ),
      ["Navigationssystem", "Sitzheizung vorne", "Panoramadach"],
    );
  });

  it("behält die erste Schreibweise und die Reihenfolge", () => {
    assert.deepEqual(mergeEquipment(["LED", "abs"], ["ABS", "led", "ESP"]), [
      "LED",
      "abs",
      "ESP",
    ]);
  });

  it("lässt Leerwerte weg", () => {
    assert.deepEqual(mergeEquipment(["", "  ", "ABS", ""]), ["ABS"]);
    assert.deepEqual(mergeEquipment([], []), []);
  });

  it("liest eine Zeilenliste, wie das Formular sie speichert", () => {
    assert.deepEqual(equipmentLines("ABS\r\nESP\n\nabs\n  LED  "), [
      "ABS",
      "ESP",
      "LED",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Einzelne Einträge
// ---------------------------------------------------------------------------

describe("Hinzufügen und Entfernen", () => {
  it("fügt einen eigenen Eintrag hinzu, aber nie doppelt", () => {
    assert.deepEqual(addEquipment(["ABS"], "Standheizung"), ["ABS", "Standheizung"]);
    assert.deepEqual(addEquipment(["ABS"], "abs"), ["ABS"]);
    assert.deepEqual(addEquipment(["ABS"], "  ABS  "), ["ABS"]);
  });

  it("weist Leeres, Überlanges und Mehrzeiliges ab", () => {
    assert.deepEqual(addEquipment(["ABS"], ""), ["ABS"]);
    assert.deepEqual(addEquipment(["ABS"], "x".repeat(MAX_CUSTOM_EQUIPMENT_LENGTH + 1)), ["ABS"]);
    assert.deepEqual(addEquipment(["ABS"], "ESP\nLED"), ["ABS"]);
  });

  it("entfernt unabhängig von der Schreibweise", () => {
    assert.deepEqual(removeEquipment(["ABS", "ESP"], "abs"), ["ESP"]);
    assert.deepEqual(removeEquipment(["ABS"], "LED"), ["ABS"]);
  });
});

// ---------------------------------------------------------------------------
// Suche im Katalog
// ---------------------------------------------------------------------------

describe("Katalogsuche", () => {
  it("findet unabhängig von Groß-/Kleinschreibung", () => {
    assert.equal(matchesEquipment("Rückfahrkamera", "rück"), true);
    assert.equal(matchesEquipment("Rückfahrkamera", "KAMERA"), true);
  });

  it("findet mit und ohne Umlaute", () => {
    assert.equal(matchesEquipment("Rückfahrkamera", "rueck"), true);
    assert.equal(matchesEquipment("Anhängerkupplung", "anhaenger"), true);
    assert.equal(matchesEquipment("Sitzbelüftung", "belüftung"), true);
  });

  it("verlangt jedes Wort", () => {
    assert.equal(matchesEquipment("Sitzheizung vorne", "sitz vorne"), true);
    assert.equal(matchesEquipment("Sitzheizung vorne", "sitz hinten"), false);
    assert.equal(matchesEquipment("Sitzheizung vorne", ""), true);
  });
});

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

describe("Ausstattungskatalog", () => {
  it("ist umfangreich und in Kategorien gegliedert", () => {
    assert.ok(EQUIPMENT_CATALOG.length >= 10, "mindestens zehn Kategorien");
    const total = EQUIPMENT_CATALOG.reduce((n, c) => n + c.options.length, 0);
    assert.ok(total >= 150, `mindestens 150 Einträge, sind ${total}`);

    for (const category of EQUIPMENT_CATALOG) {
      assert.ok(category.name.trim().length > 0);
      assert.ok(category.options.length > 0, `${category.name} ist leer`);
    }
  });

  it("enthält keinen Eintrag doppelt, auch nicht über Kategorien hinweg", () => {
    const seen = new Set<string>();
    for (const category of EQUIPMENT_CATALOG) {
      for (const option of category.options) {
        const key = option.trim().toLowerCase();
        assert.ok(option.trim() === option, `„${option}“ hat Leerraum am Rand`);
        assert.ok(!seen.has(key), `„${option}“ kommt doppelt vor`);
        seen.add(key);
      }
    }
  });

  it("dient den Extras als derselbe Katalog", () => {
    assert.equal(EXTRAS_CATALOG, EQUIPMENT_CATALOG);
  });

  it("wählt nichts von selbst aus", () => {
    // Der Katalog ist ein Vorschlag. Ein Fahrzeug hat nur, was jemand
    // ausdrücklich angehakt oder eingetragen hat.
    const select = readFileSync("src/components/admin/equipment-select.tsx", "utf8");
    assert.match(select, /checked=\{contains\(option\)\}/);
    assert.ok(!/defaultChecked/.test(select));
  });
});

// ---------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------

describe("Fahrzeugformular", () => {
  /** Vollständige, gültige Eingabe – wie im bestehenden Formular-Test. */
  const base = {
    ...EMPTY_VEHICLE_FORM,
    make: "BMW",
    model: "X5",
    priceEuro: "10000",
    mileageKm: "1000",
  };

  it("führt alte Highlights beim Speichern in die Ausstattung über", () => {
    const parsed = vehicleFormSchema.safeParse({
      ...base,
      features: "Navigationssystem\nSitzheizung vorne",
      highlights: "navigationssystem\nPanoramadach",
    });

    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
    assert.deepEqual(parsed.data.features, [
      "Navigationssystem",
      "Sitzheizung vorne",
      "Panoramadach",
    ]);
    assert.equal("highlights" in parsed.data, false);
  });

  it("dedupliziert die Ausstattung schon beim Einlesen", () => {
    const parsed = vehicleFormSchema.safeParse({
      ...base,
      features: "ABS\nabs\n ABS \nESP",
      extras: "Standheizung\nstandheizung",
    });

    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.features, ["ABS", "ESP"]);
    assert.deepEqual(parsed.data.extras, ["Standheizung"]);
  });

  it("begrenzt einen Eintrag, nicht die ganze Liste", () => {
    const tooLong = vehicleFormSchema.safeParse({
      ...base,
      features: "x".repeat(MAX_CUSTOM_EQUIPMENT_LENGTH + 1),
    });
    assert.equal(tooLong.success, false);

    const many = vehicleFormSchema.safeParse({
      ...base,
      features: Array.from({ length: 300 }, (_, i) => `Merkmal ${i}`).join("\n"),
    });
    assert.ok(many.success, "300 Einträge sind erlaubt");
  });

  it("zeigt keinen eigenen Highlights-Bereich mehr", () => {
    const form = readFileSync("src/components/admin/vehicle-form.tsx", "utf8");
    assert.ok(!/label="Highlights"/.test(form));
    assert.ok(!/register\("highlights"\)/.test(form));
    // Ausstattung und Extras laufen über die Katalogauswahl.
    assert.equal((form.match(/<EquipmentSelect/g) ?? []).length, 2);
    assert.match(form, /catalog=\{EQUIPMENT_CATALOG\}/);
    assert.match(form, /catalog=\{EXTRAS_CATALOG\}/);
  });

  it("leert die veraltete Spalte beim Speichern", () => {
    const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");
    assert.match(actions, /highlights: \[\]/);
  });

  it("lädt bestehende Highlights beim Bearbeiten in die Ausstattung", () => {
    const page = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/[id]/page.tsx",
      "utf8",
    );
    assert.match(page, /features: mergeEquipment\(vehicle\.features, vehicle\.highlights\)/);
  });
});

// ---------------------------------------------------------------------------
// Datenmigration
// ---------------------------------------------------------------------------

describe("Datenmigration", () => {
  const sql = readFileSync(
    "prisma/migrations/20260912100000_merge_vehicle_equipment/migration.sql",
    "utf8",
  );

  it("führt Highlights in die Ausstattung über und leert sie danach", () => {
    assert.match(sql, /unnest\(vehicle\."features" \|\| vehicle\."highlights"\)/);
    assert.match(sql, /"highlights" = ARRAY\[\]::text\[\]/);
  });

  it("dedupliziert ohne Rücksicht auf Schreibweise und behält die Reihenfolge", () => {
    assert.match(sql, /DISTINCT ON \(lower\(btrim\(raw/);
    assert.match(sql, /WITH ORDINALITY/);
    assert.match(sql, /ORDER BY position/);
  });

  it("ändert keine Struktur und löscht keine Zeile", () => {
    assert.ok(!/ALTER TABLE|DROP|DELETE|TRUNCATE/i.test(sql));
  });
});

// ---------------------------------------------------------------------------
// CSV-Import
// ---------------------------------------------------------------------------

describe("CSV-Import", () => {
  const HEADER =
    "GW-Nr;FIN;Marke;Modell;Farbe;KM-Stand;Baujahr;Verkaufspreis;Angebotspreis;online auf;Standzeit (Tage);Ausstattung;Highlights";

  function existing(features: string[]): ExistingVehicle {
    return {
      id: "veh-1",
      title: "BMW X5",
      stockNumber: "A-1",
      vin: null,
      make: "BMW",
      model: "X5",
      color: null,
      priceCents: 1_000_000,
      listPriceCents: null,
      mileageKm: 1000,
      firstRegistration: null,
      daysInStock: null,
      importFingerprint: null,
      importedAt: new Date(),
      missingSinceImportAt: null,
      features,
    };
  }

  it("liest Ausstattung und Highlights als eine Liste", () => {
    const parsed = parseVehicleCsv(
      `${HEADER}\nA-1;;BMW;X5;;1000;2020;10000;0;willhaben;1;Navigationssystem|Sitzheizung vorne;navigationssystem|Panoramadach`,
    );

    assert.deepEqual(parsed.rows[0].features, [
      "Navigationssystem",
      "Sitzheizung vorne",
      "Panoramadach",
    ]);
  });

  it("löscht bestehende Ausstattung nicht durch leere Spalten", () => {
    const parsed = parseVehicleCsv(
      `${HEADER}\nA-1;;BMW;X5;;1000;2020;10000;0;willhaben;1;;`,
    );
    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing(["Navigationssystem", "Panoramadach"])],
    });

    const entry = [...plan.updates, ...plan.unchanged][0];
    assert.ok(entry);
    assert.equal("features" in entry.values, false, "Feld wird nicht angefasst");
    assert.ok(!entry.changedFields.includes("features"));
  });

  it("ergänzt bestehende Ausstattung statt sie zu ersetzen", () => {
    const parsed = parseVehicleCsv(
      `${HEADER}\nA-1;;BMW;X5;;1000;2020;10000;0;willhaben;1;LED-Scheinwerfer;`,
    );
    const plan = planVehicleImport({
      rows: parsed.rows,
      existing: [existing(["Navigationssystem"])],
    });

    assert.deepEqual(plan.updates[0].values.features, [
      "Navigationssystem",
      "LED-Scheinwerfer",
    ]);
    assert.ok(plan.updates[0].changedFields.includes("features"));
  });
});

// ---------------------------------------------------------------------------
// Preisblatt
// ---------------------------------------------------------------------------

describe("Preisblatt", () => {
  it("liefert Highlights als Ausstattung", () => {
    const values = mapPriceSheet({
      Marke: "BMW",
      Bezeichnung: "X5",
      Highlights_1: "Navigationssystem",
      Highlights_2: "Sitzheizung vorne",
      Highlights_3: "navigationssystem",
      Highlights_12: "Panoramadach",
    });

    assert.deepEqual(values.features, [
      "Navigationssystem",
      "Sitzheizung vorne",
      "Panoramadach",
    ]);
    assert.equal("highlights" in values, false);
  });

  it("ergänzt beim Übernehmen und leert die veraltete Spalte", () => {
    const service = readFileSync("src/modules/vehicles/price-sheet-service.ts", "utf8");
    assert.match(
      service,
      /data\.features = mergeEquipment\(current\.features, current\.highlights, values\.features\)/,
    );
    assert.match(service, /data\.highlights = \[\]/);
    // Die Prüfzeile heißt jetzt "Ausstattung" und wird wie zuvor bestätigt.
    assert.match(service, /features: "Ausstattung"/);
    assert.match(service, /accepted\.has\("features"\)/);
  });
});

// ---------------------------------------------------------------------------
// KI-Prompt
// ---------------------------------------------------------------------------

describe("KI-Prompt", () => {
  const openai = readFileSync("src/integrations/openai/index.ts", "utf8");

  it("übergibt die Ausstattung vollständig, Highlights eingeschlossen", () => {
    assert.match(openai, /const equipment = mergeEquipment\(vehicle\.features, vehicle\.highlights\)/);
    assert.match(openai, /Ausstattung:\\n\$\{equipment\.map/);
    assert.ok(!/Highlights: \$\{vehicle\.highlights/.test(openai));
  });

  it("lässt die KI fünf bis acht auswählen und nichts erfinden", () => {
    assert.match(openai, /fünf bis acht verkaufsrelevante Ausstattungen/);
    assert.match(openai, /ausschließlich tatsächlich vorhandene Ausstattung/);
    assert.match(openai, /Vermeide Dubletten/);
    assert.match(openai, /Fehlt Ausstattung vollständig, lasse den Block weg/);
  });

  it("hält Extras weiterhin getrennt", () => {
    assert.match(openai, /Extras: \$\{vehicle\.extras\.join/);
  });
});
