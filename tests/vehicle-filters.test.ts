import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EMPTY_VEHICLE_FILTERS,
  buildVehicleWhere,
  dropInvalidModel,
  hasActiveVehicleFilters,
  matchesVehicleFilters,
  parseVehicleFilters,
  searchTerms,
  vehicleFiltersHref,
  vehicleFiltersToSearchParams,
  type VehicleFilters,
} from "@/modules/vehicles/filters";

/**
 * Suche und Filter der Fahrzeuglisten.
 *
 * Ein Kern für zwei Stellen: /admin/fahrzeuge und die Fahrzeugauswahl im
 * Beitragsassistenten. Die reinen Funktionen werden hier direkt geprüft; dass
 * beide Seiten sie auch tatsächlich verwenden, prüfen die Strukturtests am
 * Ende gegen den Quelltext.
 */

type Vehicle = Parameters<typeof matchesVehicleFilters>[0];

const BMW_X5: Vehicle = {
  make: "BMW",
  model: "X5",
  variant: "xDrive30d M-Sport",
  stockNumber: "GW-1234",
  vin: "WBAJA71090B123456",
  color: "Schwarz",
  status: "IN_STOCK",
};

const BMW_X3: Vehicle = {
  make: "BMW",
  model: "X3",
  variant: "xDrive20d",
  stockNumber: "GW-1235",
  vin: "WBATR91020B654321",
  color: "Weiß",
  status: "RESERVED",
};

const MERCEDES_C: Vehicle = {
  make: "Mercedes-Benz",
  model: "C-Klasse",
  variant: "C 220 d",
  stockNumber: null,
  vin: null,
  color: "Silber",
  status: "SOLD",
};

const FLEET = [BMW_X5, BMW_X3, MERCEDES_C];

function f(overrides: Partial<VehicleFilters>): VehicleFilters {
  return { ...EMPTY_VEHICLE_FILTERS, ...overrides };
}

function filter(filters: VehicleFilters): Vehicle[] {
  return FLEET.filter((vehicle) => matchesVehicleFilters(vehicle, filters));
}

// ---------------------------------------------------------------------------
// 1–4, 15, 16: Marke, Modell, Status – einzeln und zusammen
// ---------------------------------------------------------------------------

describe("Marke, Modell und Status", () => {
  it("Marke BMW liefert nur BMW", () => {
    const hits = filter(f({ make: "BMW" }));

    assert.equal(hits.length, 2);
    assert.ok(hits.every((v) => v.make === "BMW"));
  });

  it("Modell X5 liefert nur X5", () => {
    assert.deepEqual(filter(f({ model: "X5" })), [BMW_X5]);
  });

  it("Marke und Modell gelten zusammen", () => {
    assert.deepEqual(filter(f({ make: "BMW", model: "X5" })), [BMW_X5]);
    assert.deepEqual(filter(f({ make: "Mercedes-Benz", model: "X5" })), []);
  });

  it("Status IN_STOCK und Marke BMW", () => {
    assert.deepEqual(filter(f({ status: "IN_STOCK", make: "BMW" })), [BMW_X5]);
  });

  it("reservierte Fahrzeuge erscheinen nur bei passendem Status", () => {
    assert.deepEqual(filter(f({ status: "RESERVED" })), [BMW_X3]);
    assert.ok(!filter(f({ status: "IN_STOCK" })).includes(BMW_X3));
  });

  it("verkaufte Fahrzeuge erscheinen nur bei passendem Status", () => {
    assert.deepEqual(filter(f({ status: "SOLD" })), [MERCEDES_C]);
    assert.ok(!filter(f({ status: "IN_STOCK" })).includes(MERCEDES_C));
    // Ohne Status: alle.
    assert.equal(filter(EMPTY_VEHICLE_FILTERS).length, 3);
  });

  it("alle Filter zusammen: Status, Marke, Modell und Suche", () => {
    const hits = filter(
      f({ status: "IN_STOCK", make: "BMW", model: "X5", q: "30d" }),
    );

    assert.deepEqual(hits, [BMW_X5]);
  });
});

// ---------------------------------------------------------------------------
// 5–8: Freitextsuche
// ---------------------------------------------------------------------------

describe("Freitextsuche", () => {
  it("findet über die Variante", () => {
    assert.deepEqual(filter(f({ q: "M-Sport" })), [BMW_X5]);
    assert.deepEqual(filter(f({ q: "30d" })), [BMW_X5]);
  });

  it("findet über die GW-Nr", () => {
    assert.deepEqual(filter(f({ q: "GW-1235" })), [BMW_X3]);
    assert.deepEqual(filter(f({ q: "1234" })), [BMW_X5]);
  });

  it("findet über die FIN", () => {
    assert.deepEqual(filter(f({ q: "WBAJA71090B123456" })), [BMW_X5]);
    // Auch ein Teil der FIN genügt – wer den Zettel in der Hand hat, tippt
    // selten alle 17 Zeichen.
    assert.deepEqual(filter(f({ q: "B654321" })), [BMW_X3]);
  });

  it("ignoriert Groß- und Kleinschreibung", () => {
    assert.deepEqual(filter(f({ q: "bmw x5" })), [BMW_X5]);
    assert.deepEqual(filter(f({ q: "M-SPORT" })), [BMW_X5]);
    assert.deepEqual(filter(f({ q: "wbaja" })), [BMW_X5]);
  });

  it("findet über die Farbe", () => {
    assert.deepEqual(filter(f({ q: "silber" })), [MERCEDES_C]);
  });

  it("verlangt jedes Wort, egal in welchem Feld", () => {
    // "BMW X5" steht in zwei Feldern – trotzdem ein Treffer.
    assert.deepEqual(filter(f({ q: "BMW X5" })), [BMW_X5]);
    // Ein Wort, das nirgends vorkommt, lässt den Treffer platzen.
    assert.deepEqual(filter(f({ q: "BMW Cabrio" })), []);
  });

  it("zerlegt den Suchtext an Leerraum und lässt Leeres weg", () => {
    assert.deepEqual(searchTerms("  x5   30d "), ["x5", "30d"]);
    assert.deepEqual(searchTerms(""), []);
    assert.deepEqual(searchTerms("   "), []);
  });

  it("baut eine parametrisierte Prisma-Bedingung, kein Roh-SQL", () => {
    const where = buildVehicleWhere(
      f({ status: "IN_STOCK", make: "BMW", model: "X5", q: "30d" }),
    );

    assert.deepEqual(where, {
      AND: [
        { status: "IN_STOCK" },
        { make: "BMW" },
        { model: "X5" },
        {
          OR: [
            { make: { contains: "30d", mode: "insensitive" } },
            { model: { contains: "30d", mode: "insensitive" } },
            { variant: { contains: "30d", mode: "insensitive" } },
            { stockNumber: { contains: "30d", mode: "insensitive" } },
            { vin: { contains: "30d", mode: "insensitive" } },
            { color: { contains: "30d", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("liefert ohne Filter eine leere Bedingung", () => {
    assert.deepEqual(buildVehicleWhere(EMPTY_VEHICLE_FILTERS), {});
  });

  it("verwendet kein Roh-SQL", () => {
    const source = readFileSync("src/modules/vehicles/filters.ts", "utf8");
    assert.ok(!/\$queryRaw|\$executeRaw|Prisma\.sql|Prisma\.raw/.test(source));
  });
});

// ---------------------------------------------------------------------------
// 9, 10: Modelle folgen der Marke
// ---------------------------------------------------------------------------

describe("Modell folgt der Marke", () => {
  it("lädt die Modelloptionen eingeschränkt auf die gewählte Marke", () => {
    const repository = readFileSync(
      "src/modules/vehicles/admin-repository.ts",
      "utf8",
    );
    const block = repository.slice(
      repository.indexOf("export async function listVehicleFilterOptions"),
      repository.indexOf("export async function resolveVehicleFilters"),
    );

    // Marken und Modelle über GROUP BY, keine Liste im Speicher.
    assert.equal((block.match(/prisma\.vehicle\.groupBy/g) ?? []).length, 2);
    assert.match(block, /by: \["make"\]/);
    assert.match(block, /by: \["model"\]/);
    assert.match(block, /filters\.make \? \{ make: filters\.make \} : \{\}/);
    // Leere Werte bleiben draußen, alphabetisch sortiert.
    assert.match(block, /make: \{ not: "" \}/);
    assert.match(block, /orderBy: \{ make: "asc" \}/);
    assert.match(block, /orderBy: \{ model: "asc" \}/);
  });

  it("entfernt ein Modell, das es bei der Marke nicht gibt", () => {
    const filters = f({ make: "BMW", model: "A-Klasse" });
    const cleaned = dropInvalidModel(filters, ["X3", "X5"]);

    assert.equal(cleaned.model, null);
    assert.equal(cleaned.make, "BMW", "die Marke bleibt");
  });

  it("behält ein gültiges Modell", () => {
    const filters = f({ make: "BMW", model: "X5" });
    assert.equal(dropInvalidModel(filters, ["X3", "X5"]), filters);
  });

  it("setzt das Modell in der Leiste beim Markenwechsel zurück", () => {
    const bar = readFileSync("src/components/admin/vehicle-filter-bar.tsx", "utf8");
    assert.match(bar, /make: value === ALL \? null : value, model: null/);
  });
});

// ---------------------------------------------------------------------------
// 11, 12: Adressparameter und Zurücksetzen
// ---------------------------------------------------------------------------

describe("Adressparameter", () => {
  it("liest status, make, model und q", () => {
    const filters = parseVehicleFilters({
      status: "in_stock",
      make: "BMW",
      model: "X5",
      q: "  30d ",
    });

    assert.deepEqual(filters, {
      status: "IN_STOCK",
      make: "BMW",
      model: "X5",
      q: "30d",
    });
  });

  it("nimmt bei mehrfachen Parametern den ersten", () => {
    const filters = parseVehicleFilters({ make: ["BMW", "Audi"] });
    assert.equal(filters.make, "BMW");
  });

  it("lässt unbekannte Stati still auf die Vorgabe fallen", () => {
    assert.equal(parseVehicleFilters({ status: "kaputt" }).status, null);
    assert.equal(
      parseVehicleFilters({ status: "kaputt" }, { defaultStatus: "IN_STOCK" })
        .status,
      "IN_STOCK",
    );
    // Groß-/Kleinschreibung ist egal.
    assert.equal(parseVehicleFilters({ status: "SOLD" }).status, "SOLD");
  });

  it("behandelt leere Werte wie fehlende", () => {
    const filters = parseVehicleFilters({ make: "", model: "  ", q: "" });
    assert.deepEqual(filters, EMPTY_VEHICLE_FILTERS);
  });

  it("schreibt nur gesetzte Werte in die Adresse", () => {
    assert.equal(
      vehicleFiltersHref("/admin/fahrzeuge", f({ make: "BMW", q: "30d" })),
      "/admin/fahrzeuge?make=BMW&q=30d",
    );
    assert.equal(
      vehicleFiltersHref(
        "/admin/fahrzeuge",
        f({ status: "IN_STOCK", make: "BMW", model: "X5", q: "30d" }),
      ),
      "/admin/fahrzeuge?status=in_stock&make=BMW&model=X5&q=30d",
    );
  });

  it("Zurücksetzen entfernt die Parameter wieder", () => {
    const set = f({ status: "IN_STOCK", make: "BMW", model: "X5", q: "30d" });
    const reset: VehicleFilters = { ...set, q: "", make: null, model: null };

    // Nur der Status bleibt – er gehört zu den Tabs, nicht zur Leiste.
    assert.equal(
      vehicleFiltersHref("/admin/fahrzeuge", reset),
      "/admin/fahrzeuge?status=in_stock",
    );
    assert.equal(
      vehicleFiltersHref("/admin/fahrzeuge", EMPTY_VEHICLE_FILTERS),
      "/admin/fahrzeuge",
    );
    assert.equal(hasActiveVehicleFilters(reset), false);
    assert.equal(hasActiveVehicleFilters(set), true);
  });

  it("Lesen und Schreiben sind zueinander umkehrbar", () => {
    const original = f({ status: "RESERVED", make: "Mercedes-Benz", q: "C 220" });
    const params = vehicleFiltersToSearchParams(original);
    const back = parseVehicleFilters(Object.fromEntries(params));

    assert.deepEqual(back, original);
  });

  it("die Status-Tabs nehmen Marke, Modell und Suche mit", () => {
    const tabs = readFileSync("src/components/admin/vehicle-overview.tsx", "utf8");
    assert.match(tabs, /vehicleFiltersHref\("\/admin\/fahrzeuge", \{\s*\.\.\.filters,\s*status: tab\.value,\s*\}\)/);
  });
});

// ---------------------------------------------------------------------------
// 13, 14: Beitragsassistent
// ---------------------------------------------------------------------------

describe("Fahrzeugauswahl im Beitragsassistenten", () => {
  const page = readFileSync(
    "src/app/admin/(protected)/social-media/page.tsx",
    "utf8",
  );
  const repository = readFileSync("src/modules/social/repository.ts", "utf8");

  it("gibt IN_STOCK vor", () => {
    assert.match(page, /const DEFAULT_STATUS = "IN_STOCK" as const/);
    assert.match(page, /defaultStatus: DEFAULT_STATUS/);

    const filters = parseVehicleFilters({}, { defaultStatus: "IN_STOCK" });
    assert.equal(filters.status, "IN_STOCK");
  });

  it("lässt die Vorgabe mit ?status=all aufheben", () => {
    const all = parseVehicleFilters({ status: "all" }, { defaultStatus: "IN_STOCK" });
    assert.equal(all.status, null);

    // Und schreibt sie so auch zurück – ein Vorgabestatus braucht keinen
    // Parameter, "alle" trotz Vorgabe schon.
    assert.equal(
      vehicleFiltersHref("/admin/social-media", f({ status: "IN_STOCK" }), {
        defaultStatus: "IN_STOCK",
      }),
      "/admin/social-media",
    );
    assert.equal(
      vehicleFiltersHref("/admin/social-media", f({ status: null }), {
        defaultStatus: "IN_STOCK",
      }),
      "/admin/social-media?status=all",
    );
  });

  it("erlaubt reservierte und verkaufte Fahrzeuge ausdrücklich", () => {
    assert.equal(
      parseVehicleFilters({ status: "sold" }, { defaultStatus: "IN_STOCK" }).status,
      "SOLD",
    );
    assert.equal(
      parseVehicleFilters({ status: "reserved" }, { defaultStatus: "IN_STOCK" })
        .status,
      "RESERVED",
    );
  });

  it("verwendet denselben Filterkern wie die Fahrzeugverwaltung", () => {
    // Kein eigenes where, keine zweite Suchlogik.
    assert.match(repository, /where: buildVehicleWhere\(filters\)/);
    assert.ok(!/status: "IN_STOCK"/.test(repository), "kein hartes IN_STOCK mehr");
    assert.match(page, /resolveVehicleFilters\(/);
    assert.match(page, /parseVehicleFilters\(/);
  });

  it("Marke und Modell greifen dort wie hier", () => {
    // Derselbe Kern – derselbe Test genügt.
    assert.deepEqual(
      filter(f({ status: "IN_STOCK", make: "BMW", model: "X5" })),
      [BMW_X5],
    );
  });
});

// ---------------------------------------------------------------------------
// 17: Kein 0-€-Preis
// ---------------------------------------------------------------------------

describe("Fehlender Preis", () => {
  it("wird in der Auswahl nicht als 0 € weitergereicht", () => {
    const repository = readFileSync("src/modules/social/repository.ts", "utf8");
    assert.match(repository, /priceCents: vehicle\.priceCents > 0 \? vehicle\.priceCents : null/);
  });

  it("wird in der Oberfläche nicht formatiert", () => {
    const manager = readFileSync(
      "src/components/admin/social-media-manager.tsx",
      "utf8",
    );
    // Jede Preisformatierung steht hinter einer Null-Prüfung; ohne Wert
    // erscheint nichts bzw. ein Hinweis, nie eine Zahl.
    assert.match(manager, /"kein Preis hinterlegt"/);

    const calls = [...manager.matchAll(/formatEuro\((\w+)\.priceCents\)/g)];
    assert.ok(calls.length >= 2, "Preis wird in Liste und Vorschau formatiert");
    for (const call of calls) {
      const before = manager.slice(Math.max(0, call.index - 80), call.index);
      assert.match(
        before,
        new RegExp(`${call[1]}\\.priceCents !== null`),
        `ungeprüfte Formatierung: ${call[0]}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 18: Bestehende Funktionen bleiben
// ---------------------------------------------------------------------------

describe("Bestehende Funktionen", () => {
  it("behält die Liste, ihre Kennzeichen und die gekürzte FIN", () => {
    const list = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/page.tsx",
      "utf8",
    );

    for (const needed of [
      "formatMonthYear(vehicle.firstRegistration)",
      "formatKilometers(vehicle.mileageKm)",
      "formatEuro(vehicle.priceCents)",
      "vehicle.color",
      "GW-Nr: ${vehicle.stockNumber}",
      "FIN: ${vehicle.vinShort}",
      "Keine Fahrzeuge mit diesen Filtern gefunden.",
      "VehicleStatusTabs",
      "VehicleFilterBar",
    ]) {
      assert.ok(list.includes(needed), `fehlt: ${needed}`);
    }
    // Die vollständige FIN erscheint in der Liste nicht.
    assert.ok(!/vehicle\.vin\b(?!Short)/.test(list));
  });

  it("lässt Import, Preisblatt, Statuswechsel, Löschen und Bilder unangetastet", () => {
    const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");
    for (const fn of [
      "createVehicle",
      "updateVehicle",
      "deleteVehicle",
      "deleteMissingImportedVehicles",
      "deleteVehicleImage",
    ]) {
      assert.match(actions, new RegExp(`export async function ${fn}\\(`));
    }

    const route = readFileSync("src/app/api/admin/vehicles/import/route.ts", "utf8");
    assert.match(route, /export async function POST/);

    const sheet = readFileSync("src/modules/vehicles/price-sheet-service.ts", "utf8");
    assert.match(sheet, /mapPriceSheet\(/);
  });

  it("die Beitragserzeugung liest weiterhin die Fahrzeug-ID", () => {
    const manager = readFileSync(
      "src/components/admin/social-media-manager.tsx",
      "utf8",
    );
    assert.match(manager, /generateCaption\(\{ vehicleId: selectedVehicleId \}\)/);
    // Fällt das gewählte Fahrzeug aus der gefilterten Liste, rückt das erste nach.
    assert.match(manager, /vehicles\.some\(\(v\) => v\.id === chosenVehicleId\)/);
  });
});
