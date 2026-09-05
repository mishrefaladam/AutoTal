import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { VEHICLE_STATUS_LABELS } from "@/modules/vehicles/labels";
import { PURCHASE_INQUIRY_CLOSED_STATUSES } from "@/modules/purchase-inquiries/labels";

/**
 * Die Fahrzeugverwaltung trennt zwei fachlich verschiedene Dinge: den eigenen
 * Bestand von AutoTal und Fahrzeuge, die Kunden anbieten. Diese Tests sichern
 * genau diese Trennung sowie den Statusfilter ab – beides fällt bei einem
 * Umbau sonst leicht unbemerkt zusammen.
 */

const page = readFileSync("src/app/admin/(protected)/fahrzeuge/page.tsx", "utf8");
const overview = readFileSync("src/components/admin/vehicle-overview.tsx", "utf8");
const repository = readFileSync("src/modules/vehicles/admin-repository.ts", "utf8");
const shell = readFileSync("src/components/admin/admin-shell.tsx", "utf8");

describe("Statusfilter der eigenen Fahrzeuge", () => {
  it("kennt genau die drei Status des bestehenden Datenmodells", () => {
    // Kein eigenes Filtermodell: Die Tabs bilden VehicleStatus ab.
    assert.deepEqual(Object.keys(VEHICLE_STATUS_LABELS).sort(), [
      "IN_STOCK",
      "RESERVED",
      "SOLD",
    ]);
  });

  it("übersetzt jeden URL-Parameter in genau einen Status", () => {
    const mapping = page.slice(
      page.indexOf("const STATUS_BY_PARAM"),
      page.indexOf("};", page.indexOf("const STATUS_BY_PARAM")),
    );

    for (const status of Object.keys(VEHICLE_STATUS_LABELS)) {
      assert.ok(
        mapping.includes(`${status.toLowerCase()}: "${status}"`),
        `Der Filterwert für ${status} fehlt`,
      );
    }
  });

  it("fällt bei unbekanntem Filterwert auf 'alle' zurück statt zu leeren", () => {
    assert.match(page, /STATUS_BY_PARAM\[rawStatus\.toLowerCase\(\)\] \?\? null/);
  });

  it("filtert in der Datenbank, nicht erst im Speicher", () => {
    assert.match(repository, /where: status \? \{ status \} : undefined/);
  });

  it("zählt je Status in einer einzigen groupBy-Abfrage", () => {
    // Sonst hingen die Zahlen über den Tabs vom aktiven Tab ab.
    assert.match(repository, /groupBy\(\{[\s\S]*?by: \["status"\]/);
  });
});

describe("Bestand und Ankaufanfragen bleiben getrennt", () => {
  it("lädt Fahrzeuge und Ankaufanfragen aus getrennten Modulen", () => {
    assert.match(page, /from "@\/modules\/vehicles\/admin-repository"/);
    assert.match(page, /from "@\/modules\/purchase-inquiries\/repository"/);
  });

  it("mischt Ankaufanfragen nicht in die Fahrzeugliste", () => {
    // Die Anfragen dürfen ausschließlich als Zahl vorkommen, nie als Zeile.
    const listBlock = page.slice(page.indexOf("vehicles.map("));
    assert.ok(!/inquir/i.test(listBlock), "Ankaufanfragen tauchen in der Fahrzeugliste auf");
  });

  it("verlinkt die Ankaufanfragen auf ihre eigene Seite", () => {
    assert.match(overview, /href="\/admin\/ankauf"/);
  });

  it("zeigt in der Übersichtskarte nur offene Anfragen", () => {
    assert.match(page, /countOpenPurchaseInquiries\(\)/);
    // Der Zähler stützt sich auf dieselbe Abgrenzung wie die Ankaufseite.
    assert.ok(PURCHASE_INQUIRY_CLOSED_STATUSES.length > 0);
  });
});

describe("Navigation", () => {
  it("zeigt den Zähler nur bei den Ankaufanfragen und nur wenn offen", () => {
    assert.match(
      shell,
      /item\.href === "\/admin\/ankauf" && openInquiries > 0/,
    );
  });
});

describe("Keine veralteten Sync-Versprechen mehr", () => {
  it("behauptet im Admin keine Synchronisierung", () => {
    const actions = readFileSync("src/modules/vehicles/admin-actions.ts", "utf8");
    const detail = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/[id]/page.tsx",
      "utf8",
    );

    for (const [name, source] of [
      ["Liste", page],
      ["Detailseite", detail],
      ["Aktionen", actions],
    ] as const) {
      assert.ok(
        !/nächsten Synchronisierung/.test(source),
        `${name} verspricht weiterhin eine Synchronisierung`,
      );
    }
  });

  it("verlinkt nicht auf die entfernte öffentliche Fahrzeugseite", () => {
    // /fahrzeuge/[slug] gibt es seit der willhaben-Umstellung nicht mehr.
    const detail = readFileSync(
      "src/app/admin/(protected)/fahrzeuge/[id]/page.tsx",
      "utf8",
    );
    for (const [name, source] of [["Liste", page], ["Detailseite", detail]] as const) {
      assert.ok(
        !/\/fahrzeuge\/\$\{vehicle\.slug\}/.test(source),
        `${name} verlinkt noch auf eine Route, die es nicht mehr gibt`,
      );
    }
  });
});
