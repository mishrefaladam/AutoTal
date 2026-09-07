import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  PROVIDER_LABELS,
  VEHICLE_WIDGET_PROVIDER,
  type VehicleWidgetProvider,
} from "@/components/integrations/vehicle-widget/config";
import { getWillhabenLiteStatus } from "@/components/integrations/vehicle-widget/willhaben-lite-config";
import { getCarportStatus } from "@/components/integrations/vehicle-widget/carport";

/**
 * Die Fahrzeugbörse wird von willhaben eingebettet. Es gibt für diesen
 * Händler keinen API-Zugang, und gescrapt wird nichts.
 *
 * Der offizielle Einbettungscode liegt seit dem 06.09.2026 vor. Diese Tests
 * sichern ab, dass genau dieser Code verwendet wird und nichts daneben
 * erfunden wurde: eine einzige willhaben-Domain, der von willhaben genannte
 * Pfad, kein iframe, kein dangerouslySetInnerHTML und die von der Anleitung
 * geforderte Reihenfolge (erst das Element, dann das Script).
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

/**
 * Entfernt Kommentare – geprüft wird der tatsächliche Code.
 *
 * Das `//` in "https://" darf dabei nicht als Zeilenkommentar gelten, sonst
 * verschwindet jede URL aus dem geprüften Code und die Prüfungen darauf
 * laufen ins Leere.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
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
  it("meldet Widget Lite als eingerichtet", () => {
    assert.equal(getWillhabenLiteStatus(), "ready");
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

  it("lädt ausschließlich von der von willhaben genannten Adresse", () => {
    // Genau eine Host-Adresse, genau der Pfad aus dem gelieferten Code.
    // Alles andere wäre geraten.
    const urlPattern = /https?:\/\/[^\s"'`)]*willhaben[^\s"'`)]*/gi;
    const found: string[] = [];

    for (const { content } of sources) {
      found.push(...(stripComments(content).match(urlPattern) ?? []));
    }

    assert.equal(found.length, 1, `erwartet genau eine URL, gefunden: ${found}`);
    assert.match(
      found[0],
      /^https:\/\/widget-lite\.willhaben\.at\/production\/\$\{DEALER_ID\}\/loader\.js$/,
    );
  });

  it("bettet kein iframe ein", () => {
    // Laut Anleitung rendert Widget Lite direkt in das Custom Element,
    // ausdrücklich ohne iframe.
    for (const { file, content } of sources) {
      assert.ok(
        !/<iframe/i.test(stripComments(content)),
        `${file} enthält ein iframe`,
      );
    }
  });

  it("lädt das Script über next/script statt über ein rohes Tag", () => {
    const lite = sources.find((s) => s.file.endsWith("willhaben-lite.tsx"));
    assert.ok(lite);

    const code = stripComments(lite.content);
    assert.match(code, /from "next\/script"/);
    assert.match(code, /strategy="afterInteractive"/);
    // Bewusst ohne /i: <Script> ist die Next.js-Komponente, <script> wäre
    // ein rohes HTML-Tag.
    assert.ok(!/<script[\s>]/.test(code), "rohes script-Tag im Code");
  });

  it("stellt das Element vor das Script", () => {
    // Vorgabe der Anleitung: "Die Reihenfolge (erst das Element, danach das
    // Script) […] ist entscheidend, damit das Widget korrekt initialisiert
    // wird." Vertauscht bliebe die Fahrzeugliste leer.
    const lite = sources.find((s) => s.file.endsWith("willhaben-lite.tsx"));
    assert.ok(lite);

    const code = stripComments(lite.content);
    const element = code.indexOf("<widget-lite");
    const script = code.indexOf("<Script");

    assert.ok(element !== -1, "das Custom Element fehlt");
    assert.ok(script !== -1, "der Script-Aufruf fehlt");
    assert.ok(element < script, "das Script steht vor dem Element");
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

  it("hat für Carport weiterhin keinen erfundenen Code", () => {
    // Carport ist das kostenpflichtige Widget. Dafür liegt nach wie vor kein
    // Einbettungscode vor – dort darf weiterhin nichts geraten werden.
    const carport = sources.find((s) => s.file.endsWith("carport.tsx"));

    assert.ok(carport, "carport.tsx nicht gefunden");
    assert.match(
      carport.content,
      /TODO: Insert official willhaben Carport Widget embed code here/,
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
