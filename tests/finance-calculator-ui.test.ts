import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Der Rechner selbst hat keine Test-Infrastruktur für gerenderte Komponenten
 * in diesem Projekt (kein DOM-Test-Runner). Diese Tests prüfen deshalb den
 * Quelltext direkt – nach demselben Muster wie tests/motion.test.ts. Sie
 * sichern Kundenvorgaben ab, die sonst durch einen Refactor lautlos
 * zurückkommen könnten (ein wieder editierbarer Zinssatz, eine wieder
 * prominente "Effektiver Jahreszins"-Zahl).
 */

const source = readFileSync("src/components/financing/finance-calculator.tsx", "utf8");

// Nur der öffentliche Rechner selbst – FinanceTeaser ist eine separate,
// aktuell ungenutzte Komponente und nennt den Zinssatz weiterhin (dort
// als reiner Informationstext, nicht als Regler).
const calculatorSource = source.slice(
  source.indexOf("export function FinanceCalculator"),
  source.indexOf("function SliderField"),
);

describe("Der Zinssatz ist keine Besucher-Eingabe", () => {
  it("hat keinen Zinssatz-Regler mehr", () => {
    assert.ok(!source.includes('id="fin-rate"'), "ein Zinssatz-Regler ist noch vorhanden");
  });

  it("hält den Zinssatz als reine Admin-Vorgabe fest", () => {
    assert.match(source, /const interestRateBp = config\.defaultInterestRateBp;/);
    // Kein State (also kein setInterestRateBp) mehr für den Zinssatz.
    assert.ok(!source.includes("setInterestRateBp"));
  });
});

describe("Die Ergebnisbox zeigt nur die gewünschten Felder", () => {
  it("zeigt Finanzierungsbetrag, Laufzeit und (bedingt) Schlussrate", () => {
    assert.match(source, /Finanzierungsbetrag/);
    assert.match(source, /<dt className="text-ink-muted">Laufzeit<\/dt>/);
    assert.match(source, /effectiveBalloon > 0 &&[\s\S]{0,80}Schlussrate/);
  });

  it("zeigt weder Zinsen gesamt, Gesamtbetrag noch effektiven Jahreszins prominent", () => {
    for (const label of ["Zinsen gesamt", "Effektiver Jahreszins", "Gesamtbetrag"]) {
      assert.ok(!source.includes(label), `"${label}" ist wieder in der Ergebnisbox`);
    }
  });

  it("zeigt den Sollzins nicht mehr in der Kurzzusammenfassung", () => {
    assert.ok(!calculatorSource.includes("Sollzins p. a."), "Sollzins wird wieder prominent angezeigt");
  });
});

describe("Laufzeit nur in 12-Monats-Schritten, begrenzt durch das Fahrzeugalter", () => {
  it("bezieht die Laufzeitgrenze aus dem Alters-Modul, nicht aus einer eigenen Kopie", () => {
    assert.match(source, /getAllowedTermMonths/);
    assert.match(source, /getMaxFinancingMonths/);
    assert.match(source, /FINANCING_TERM_STEP_MONTHS/);
  });

  it("fragt das Erstzulassungsjahr ab", () => {
    assert.match(source, /Erstzulassung/);
  });

  it("zeigt bei zu altem Fahrzeug die vorgegebene Kundenmeldung", () => {
    assert.match(source, /NO_FINANCING_TERM_AVAILABLE_MESSAGE/);
  });

  it("blendet Anzahlung, Laufzeit und Schlussrate aus, wenn keine Laufzeit verfügbar ist", () => {
    assert.match(source, /\{hasAvailableTerm && \(/);
  });
});
