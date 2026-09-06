import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Beispielfahrzeuge dürfen niemals in der Produktionsdatenbank landen.
 *
 * Der Seed läuft im Vercel-Build mit, wo NODE_ENV auf "production" steht –
 * die Schutzabfrage in seedDevelopmentVehicles() ist damit die einzige
 * Trennlinie zwischen Testdaten und echter Datenbank.
 *
 * Geprüft wird der Quelltext, nicht die Ausführung: prisma/seed.ts ruft beim
 * Import sofort main() auf und braucht eine Datenbank, die die Testsuite
 * bewusst nicht voraussetzt. Die Zusicherungen gehen deshalb über ein
 * blosses "kommt vor" hinaus und prüfen die Reihenfolge – eine Abfrage, die
 * erst NACH dem Schreiben greift, wäre wertlos.
 */

const seed = readFileSync("prisma/seed.ts", "utf8");

/** Der Rumpf von seedDevelopmentVehicles(), ohne den Rest der Datei. */
function developmentVehiclesBody(): string {
  const start = seed.indexOf("async function seedDevelopmentVehicles()");
  assert.notEqual(start, -1, "seedDevelopmentVehicles() wurde umbenannt oder entfernt");

  const end = seed.indexOf("\n}", start);
  assert.notEqual(end, -1, "Ende von seedDevelopmentVehicles() nicht gefunden");

  return seed.slice(start, end);
}

describe("Seed erzeugt in Produktion keine Beispielfahrzeuge", () => {
  it("prüft NODE_ENV auf 'production'", () => {
    assert.match(
      developmentVehiclesBody(),
      /process\.env\.NODE_ENV === "production"/,
    );
  });

  it("steigt bei Produktion aus, bevor irgendetwas geschrieben wird", () => {
    const body = developmentVehiclesBody();

    const guard = body.indexOf('process.env.NODE_ENV === "production"');
    const earlyReturn = body.indexOf("return;", guard);
    const firstWrite = body.indexOf("prisma.vehicle.create");

    assert.ok(guard !== -1, "keine Produktionsabfrage vorhanden");
    assert.ok(earlyReturn !== -1, "die Produktionsabfrage kehrt nicht zurück");
    assert.ok(firstWrite !== -1, "der Schreibzugriff wurde umbenannt");

    assert.ok(
      earlyReturn < firstWrite,
      "die Produktionsabfrage greift erst nach dem Schreibzugriff",
    );
  });

  it("legt Beispielfahrzeuge ausschliesslich in dieser geschützten Funktion an", () => {
    // Ein zweiter, ungeschützter Schreibzugriff anderswo im Seed würde die
    // Absicherung aushebeln.
    const writes = seed.match(/prisma\.vehicle\.create/g) ?? [];
    const guarded = developmentVehiclesBody().match(/prisma\.vehicle\.create/g) ?? [];

    assert.equal(
      writes.length,
      guarded.length,
      "es gibt einen Fahrzeug-Schreibzugriff ausserhalb der geschützten Funktion",
    );
  });

  it("verwendet die Beispieldaten nirgends sonst", () => {
    const references = seed.match(/DEV_VEHICLES/g) ?? [];
    const inFunction = developmentVehiclesBody().match(/DEV_VEHICLES/g) ?? [];

    // Eine Referenz ist die Definition selbst, der Rest muss in der
    // geschützten Funktion liegen.
    assert.equal(references.length - 1, inFunction.length);
  });

  it("markiert Beispielfahrzeuge nicht als Fremdquelle", () => {
    // Die 14 lokalen "mock"-Datensätze stammen aus dem entfernten
    // Provider-Sync. Der heutige Seed darf so etwas nicht neu erzeugen.
    assert.ok(!seed.includes('"mock"'), 'der Seed erzeugt wieder "mock"-Fahrzeuge');
    assert.match(developmentVehiclesBody(), /externalSource: MANUAL_SOURCE/);
  });
});
