import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  PROVIDER_LABELS,
  VEHICLE_WIDGET_PROVIDER,
  type VehicleWidgetProvider,
} from "@/components/integrations/vehicle-widget/config";
import { getWillhabenLiteStatus } from "@/components/integrations/vehicle-widget/willhaben-lite";
import { getCarportStatus } from "@/components/integrations/vehicle-widget/carport";

/**
 * Die Fahrzeugbörse wird von willhaben eingebettet. Es gibt für diesen
 * Händler keinen API-Zugang, und gescrapt wird nichts.
 *
 * Diese Tests sichern vor allem eines ab: dass nirgends ein Einbettungscode,
 * eine Widget-URL oder ein API-Endpunkt erfunden wurde. Solange der offizielle
 * Code fehlt, muss die Integration ehrlich „nicht eingerichtet“ melden.
 */

const ROOT = process.cwd();
const WIDGET_DIR = path.join(ROOT, "src/components/integrations/vehicle-widget");

function readAllSources(dir: string): { file: string; content: string }[] {
  const out: { file: string; content: string }[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...readAllSources(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push({ file: full.replace(`${ROOT}/`, ""), content: readFileSync(full, "utf8") });
    }
  }

  return out;
}

/** Entfernt Kommentare – geprüft wird der tatsächliche Code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("Konfiguration der Fahrzeugbörse", () => {
  it("nutzt derzeit Widget Lite", () => {
    assert.equal(VEHICLE_WIDGET_PROVIDER, "willhaben-lite");
  });

  it("hat für jeden möglichen Anbieter eine Beschriftung", () => {
    const providers: VehicleWidgetProvider[] = ["willhaben-lite", "carport"];

    for (const provider of providers) {
      assert.ok(
        PROVIDER_LABELS[provider],
        `Beschriftung für "${provider}" fehlt`,
      );
    }
  });
});

describe("Einbettungsstatus", () => {
  it("meldet Widget Lite als noch nicht eingerichtet", () => {
    // Sobald der offizielle Code eingesetzt ist, wird daraus "ready" – dann
    // ist dieser Test bewusst anzupassen.
    assert.equal(getWillhabenLiteStatus(), "missing-embed");
  });

  it("meldet Carport als noch nicht eingerichtet", () => {
    assert.equal(getCarportStatus(), "missing-embed");
  });

  it("kennt nur die beiden definierten Zustände", () => {
    for (const status of [getWillhabenLiteStatus(), getCarportStatus()]) {
      assert.ok(["ready", "missing-embed"].includes(status));
    }
  });
});

describe("Es wurde nichts erfunden", () => {
  const sources = readAllSources(WIDGET_DIR);

  it("findet Quelldateien zum Prüfen", () => {
    assert.ok(sources.length >= 4, `nur ${sources.length} Dateien gefunden`);
  });

  it("enthält keine ausgedachten willhaben-URLs", () => {
    // Ein Verweis in einem Kommentar ist in Ordnung; eine echte URL im Code
    // wäre geraten – niemand hat uns bisher eine genannt.
    const urlPattern = /https?:\/\/[^\s"'`)]*willhaben[^\s"'`)]*/gi;

    for (const { file, content } of sources) {
      const matches = stripComments(content).match(urlPattern) ?? [];
      assert.deepEqual(matches, [], `${file} enthält eine willhaben-URL`);
    }
  });

  it("enthält keine iframe- oder script-Einbettung", () => {
    for (const { file, content } of sources) {
      const codeOnly = stripComments(content);

      assert.ok(!/<iframe/i.test(codeOnly), `${file} enthält ein iframe`);
      assert.ok(!/<script/i.test(codeOnly), `${file} enthält ein script-Tag`);
    }
  });

  it("verwendet kein dangerouslySetInnerHTML", () => {
    // Nur der Code zählt: In den Kommentaren steht die Warnung, es gerade
    // NICHT zu verwenden – die soll dort auch stehen bleiben.
    for (const { file, content } of sources) {
      assert.ok(
        !stripComments(content).includes("dangerouslySetInnerHTML"),
        `${file} verwendet dangerouslySetInnerHTML`,
      );
    }
  });

  it("markiert die Einfügestelle mit einem auffindbaren TODO", () => {
    const lite = sources.find((s) => s.file.endsWith("willhaben-lite.tsx"));

    assert.ok(lite, "willhaben-lite.tsx nicht gefunden");
    assert.match(
      lite.content,
      /TODO: Insert official willhaben Widget Lite embed code here/,
    );
  });
});

describe("Kein Rest der früheren Eigenverwaltung", () => {
  it("hat keine VehicleProvider-Schicht mehr", () => {
    assert.throws(
      () => statSync(path.join(ROOT, "src/integrations/vehicles")),
      "src/integrations/vehicles existiert noch",
    );
  });

  it("hat keine Fahrzeugsynchronisierung mehr", () => {
    for (const file of [
      "src/modules/vehicles/sync.ts",
      "src/modules/vehicles/sync-action.ts",
      "src/app/api/cron/sync-vehicles/route.ts",
    ]) {
      assert.throws(
        () => statSync(path.join(ROOT, file)),
        `${file} existiert noch`,
      );
    }
  });

  it("hat keine eigenen öffentlichen Fahrzeug-Detailseiten mehr", () => {
    assert.throws(
      () => statSync(path.join(ROOT, "src/app/(public)/fahrzeuge/[slug]")),
      "Detailseiten-Route existiert noch",
    );
  });
});
