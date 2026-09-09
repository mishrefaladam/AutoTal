import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EMPTY_VEHICLE_FORM,
  vehicleFormSchema,
  type VehicleFormValues,
} from "@/modules/vehicles/admin-schemas";
import { isEditableSource, MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { IMPORT_SOURCE } from "@/modules/vehicles/import-plan";
import { formatMonthYear, shortenVin } from "@/modules/vehicles/labels";

/**
 * Vollständige Pflege des internen Fahrzeugbestands.
 *
 * Der Ausgangspunkt: Aus dem CSV-Import stammende Fahrzeuge waren im Admin
 * sichtbar, galten aber als "Altbestand" und damit als schreibgeschützt – die
 * Prüfung ließ nur `externalSource === "manual"` durch. Genau das machte den
 * importierten Bestand unbearbeitbar.
 */

/** Vollständige, gültige Eingabe – Grundlage für die Einzelfälle. */
function form(overrides: Partial<VehicleFormValues> = {}): VehicleFormValues {
  return {
    ...EMPTY_VEHICLE_FORM,
    make: "BMW",
    model: "X5 Reihe",
    priceEuro: "33999",
    mileageKm: "119018",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1: Bearbeitbarkeit
// ---------------------------------------------------------------------------

describe("Bearbeitbarkeit", () => {
  it("lässt von Hand angelegte und importierte Fahrzeuge zu", () => {
    assert.equal(isEditableSource(MANUAL_SOURCE), true);
    assert.equal(isEditableSource(IMPORT_SOURCE), true);
  });

  it("hält Altbestand aus der abgeschalteten Quelle schreibgeschützt", () => {
    assert.equal(isEditableSource("mock"), false);
    assert.equal(isEditableSource("willhaben-sync"), false);
  });

  it("prüft das serverseitig, nicht nur in der Oberfläche", () => {
    const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");
    assert.match(actions, /if \(!isEditableSource\(existing\.externalSource\)\)/);
  });

  it("nennt in der Oberfläche keine abgeschaffte Variable mehr", () => {
    // Der frühere Hinweistext verwies auf VEHICLE_PROVIDER und eine
    // Synchronisierung. Beides gibt es nicht mehr.
    const page = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/[id]/page.tsx",
      "utf8",
    );
    assert.ok(!page.includes("VEHICLE_PROVIDER"));
    assert.ok(!/nächste Synchronisierung/.test(page));
  });
});

// ---------------------------------------------------------------------------
// 2–8: Felder
// ---------------------------------------------------------------------------

describe("Bearbeitbare Felder", () => {
  it("speichert die Modellbezeichnung", () => {
    const parsed = vehicleFormSchema.parse(
      form({ variant: "X5 xDrive30d Aut." }),
    );
    assert.equal(parsed.variant, "X5 xDrive30d Aut.");
  });

  it("speichert GW-Nr und FIN, die FIN in Großbuchstaben", () => {
    const parsed = vehicleFormSchema.parse(
      form({ stockNumber: "1042", vin: "wvwzzz1kzaw123456" }),
    );

    assert.equal(parsed.stockNumber, "1042");
    assert.equal(parsed.vin, "WVWZZZ1KZAW123456");
  });

  it("weist eine FIN mit Sonderzeichen ab", () => {
    const result = vehicleFormSchema.safeParse(form({ vin: "WVW-ZZZ 1KZ" }));
    assert.equal(result.success, false);
  });

  it("lässt den Kraftstoff leer, statt einen zu erfinden", () => {
    const parsed = vehicleFormSchema.parse(form({ fuel: "" }));
    assert.equal(parsed.fuel, null);
  });

  it("lässt das Getriebe leer", () => {
    const parsed = vehicleFormSchema.parse(form({ transmission: "" }));
    assert.equal(parsed.transmission, null);
  });

  it("lässt den Antrieb leer und nimmt gültige Werte an", () => {
    assert.equal(vehicleFormSchema.parse(form({ drivetrain: "" })).drivetrain, null);
    assert.equal(
      vehicleFormSchema.parse(form({ drivetrain: "ALL_WHEEL" })).drivetrain,
      "ALL_WHEEL",
    );
  });

  it("weist einen erfundenen Aufzählungswert ab", () => {
    const result = vehicleFormSchema.safeParse(form({ fuel: "KEROSIN" }));
    assert.equal(result.success, false);
  });

  it("lässt alle technischen Zusatzfelder leer statt sie auf 0 zu setzen", () => {
    const parsed = vehicleFormSchema.parse(form());

    assert.equal(parsed.powerKw, null);
    assert.equal(parsed.displacementCcm, null);
    assert.equal(parsed.grossWeightKg, null);
    assert.equal(parsed.daysInStock, null);
    assert.equal(parsed.nationalCode, null);
    assert.equal(parsed.vehicleType, null);
    assert.equal(parsed.listPriceEuro, null);
  });

  it("speichert die technischen Zusatzfelder, wenn sie ausgefüllt sind", () => {
    const parsed = vehicleFormSchema.parse(
      form({
        powerKw: "140",
        grossWeightKg: "2100",
        daysInStock: "42",
        nationalCode: "AB123",
        vehicleType: "PKW",
        listPriceEuro: "35900",
      }),
    );

    assert.equal(parsed.powerKw, 140);
    assert.equal(parsed.grossWeightKg, 2100);
    assert.equal(parsed.daysInStock, 42);
    assert.equal(parsed.nationalCode, "AB123");
    assert.equal(parsed.vehicleType, "PKW");
    assert.equal(parsed.listPriceEuro, 35900);
  });

  it("macht aus Ausstattung, Extras und Highlights je eine eigene Liste", () => {
    const parsed = vehicleFormSchema.parse(
      form({
        features: "Klimaautomatik\nSitzheizung vorne",
        extras: "Anhängerkupplung",
        highlights: "ABS\nAlufelgen\n\nNavigationssystem",
      }),
    );

    assert.deepEqual(parsed.features, ["Klimaautomatik", "Sitzheizung vorne"]);
    assert.deepEqual(parsed.extras, ["Anhängerkupplung"]);
    assert.deepEqual(parsed.highlights, ["ABS", "Alufelgen", "Navigationssystem"]);
  });

  it("speichert die Beschreibung", () => {
    const parsed = vehicleFormSchema.parse(
      form({ description: "Scheckheftgepflegt, zwei Sätze Räder." }),
    );
    assert.equal(parsed.description, "Scheckheftgepflegt, zwei Sätze Räder.");
  });

  it("erfindet im leeren Formular keine Angaben", () => {
    // "Diesel" und "Schaltgetriebe" als Vorbelegung wären Falschangaben – und
    // landeten über die Caption-Erzeugung in einem Instagram-Beitrag.
    assert.equal(EMPTY_VEHICLE_FORM.fuel, "");
    assert.equal(EMPTY_VEHICLE_FORM.transmission, "");
    assert.equal(EMPTY_VEHICLE_FORM.drivetrain, "");
  });
});

// ---------------------------------------------------------------------------
// 9: CSV überschreibt keine gepflegten Daten
// ---------------------------------------------------------------------------

describe("CSV-Import und manuelle Pflege", () => {
  const importService = readFileSync(
    "src/modules/vehicles/import-service.ts",
    "utf8",
  );
  const importPlan = readFileSync("src/modules/vehicles/import-plan.ts", "utf8");

  it("schreibt beim Aktualisieren nur die Felder der CSV", () => {
    // Nur der Aktualisierungszweig zählt: Beim ANLEGEN darf der Import sehr
    // wohl status: "IN_STOCK" setzen – ein neues Fahrzeug braucht einen Stand.
    const updateBlock = importService.slice(
      importService.indexOf("for (const entry of ["),
      importService.indexOf("// --- Fehlende Fahrzeuge nur markieren"),
    );

    assert.ok(updateBlock.length > 0, "Aktualisierungszweig nicht gefunden");

    for (const field of [
      "description",
      "features",
      "extras",
      "highlights",
      "internalNotes",
      "images",
      "status",
      "active",
    ]) {
      assert.ok(
        !new RegExp(`^\\s*${field}:`, "m").test(updateBlock),
        `Der Import darf beim Aktualisieren ${field} nicht schreiben`,
      );
    }
  });

  it("hält den Umfang der geschriebenen Felder klein und benannt", () => {
    assert.match(importPlan, /export type ImportValues = \{/);
    const block = importPlan.slice(
      importPlan.indexOf("export type ImportValues = {"),
      importPlan.indexOf("export type PlannedCreate"),
    );

    for (const forbidden of ["description", "features", "extras", "highlights"]) {
      assert.ok(!block.includes(forbidden));
    }
  });

  it("lässt leere CSV-Werte bestehende Werte nie löschen", () => {
    assert.match(importPlan, /color: row\.color \?\? fallback\?\.color \?\? null/);
    assert.match(importPlan, /priceCents: row\.priceCents \?\? fallback\?\.priceCents/);
    assert.match(importPlan, /daysInStock: row\.standingDays \?\? fallback\?\.daysInStock/);
  });

  it("rührt Social-Media-Entwürfe nicht an", () => {
    assert.ok(!/socialDraft/i.test(importService));
  });
});

// ---------------------------------------------------------------------------
// 10–12: Unterscheidbarkeit und FIN
// ---------------------------------------------------------------------------

describe("Unterscheidbarkeit in der Liste", () => {
  const list = readFileSync(
    "src/app/admin/(protected)/fahrzeuge/page.tsx",
    "utf8",
  );

  it("zeigt je Fahrzeug die Merkmale, an denen sich zwei BMW X5 unterscheiden", () => {
    for (const marker of [
      "formatMonthYear(vehicle.firstRegistration)",
      "formatKilometers(vehicle.mileageKm)",
      "formatEuro(vehicle.priceCents)",
      "vehicle.color",
      "DRIVETRAIN_LABELS[vehicle.drivetrain]",
      "vehicle.stockNumber",
      "vehicle.vinShort",
    ]) {
      assert.ok(list.includes(marker), `${marker} fehlt in der Liste`);
    }
  });

  it("kürzt die FIN auf die letzten sechs Zeichen", () => {
    assert.equal(shortenVin("WVWZZZ1KZAW123456"), "…123456");
    assert.equal(shortenVin("KURZ12"), "KURZ12");
    assert.equal(shortenVin(null), null);
  });

  it("liefert die vollständige FIN nicht an die Liste aus", () => {
    const repository = readFileSync(
      "src/modules/vehicles/admin-repository.ts",
      "utf8",
    );

    // Der Listentyp führt bewusst nur `vinShort`.
    assert.match(repository, /vinShort: string \| null/);
    assert.ok(!/^\s*vin: string \| null;/m.test(repository));
    assert.match(repository, /vinShort: shortenVin\(row\.vin\)/);
  });

  it("gibt FIN und GW-Nr nirgends öffentlich aus", () => {
    // Der öffentliche Bereich liest die Fahrzeugtabelle überhaupt nicht.
    const publicFiles = [
      "src/app/(public)/fahrzeuge/page.tsx",
      "src/app/(public)/page.tsx",
      "src/app/sitemap.ts",
    ];

    for (const file of publicFiles) {
      const source = readFileSync(file, "utf8");
      assert.ok(!/\bvin\b/i.test(source), `${file} darf keine FIN ausgeben`);
      assert.ok(!/stockNumber/.test(source), `${file} darf keine GW-Nr ausgeben`);
      assert.ok(!/prisma\.vehicle/.test(source));
    }
  });

  it("zeigt Erstzulassungen im Handelsformat", () => {
    assert.equal(formatMonthYear(new Date(Date.UTC(2018, 9, 1))), "10/2018");
    assert.equal(formatMonthYear(null), null);
  });
});

// ---------------------------------------------------------------------------
// 13: Bildverwaltung bleibt
// ---------------------------------------------------------------------------

describe("Bilder", () => {
  const detail = readFileSync(
    "src/app/admin/(protected)/fahrzeuge/[id]/page.tsx",
    "utf8",
  );

  it("behält den bestehenden Bild-Upload beim Fahrzeug", () => {
    assert.match(detail, /<VehicleImageManager/);
  });

  it("behält Sortierung und Löschen der bestehenden Galerie", () => {
    const manager = readFileSync(
      "src/components/admin/vehicle-image-manager.tsx",
      "utf8",
    );

    assert.match(manager, /reorderVehicleImages/);
    assert.match(manager, /deleteVehicleImage/);
    assert.match(manager, /api\/admin\/vehicles\/\$\{vehicleId\}\/images/);
  });

  it("baut keine zweite Medienverwaltung", () => {
    // Der Preisblatt-Import legt über denselben Speicherdienst ab.
    const priceSheet = readFileSync(
      "src/modules/vehicles/price-sheet-service.ts",
      "utf8",
    );
    assert.match(priceSheet, /from "@\/integrations\/storage"/);
  });
});
