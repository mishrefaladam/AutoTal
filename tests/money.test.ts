import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyBasisPoints,
  bpToPercent,
  clamp,
  eurosToCents,
  formatEuro,
  formatKilometers,
  formatPercent,
  formatNumber,
  formatPower,
  kwToPs,
  percentToBp,
} from "@/lib/money";

/**
 * Cent- und Basispunkt-Rechnung ist die Grundlage aller Preisangaben.
 * Rundungsfehler hier zeigen sich als falscher Preis auf der Website.
 */

describe("Umrechnungen", () => {
  it("rechnet zwischen Euro und Cent verlustfrei", () => {
    assert.equal(eurosToCents(19_999), 1_999_900);
    assert.equal(eurosToCents(0), 0);
  });

  it("rechnet zwischen Prozent und Basispunkten", () => {
    assert.equal(percentToBp(5.99), 599);
    assert.equal(bpToPercent(599), 5.99);
    assert.equal(percentToBp(bpToPercent(1234)), 1234);
  });

  it("berechnet Anteile in Basispunkten kaufmännisch gerundet", () => {
    // 20 % von 19.999 € = 3.999,80 €
    assert.equal(applyBasisPoints(1_999_900, 2000), 399_980);
    assert.equal(applyBasisPoints(1_000_000, 0), 0);
    assert.equal(applyBasisPoints(1_000_000, 10_000), 1_000_000);
  });

  it("rechnet kW in PS um", () => {
    assert.equal(kwToPs(140), 190);
    assert.equal(kwToPs(110), 150);
  });

  it("begrenzt Werte auf einen Bereich", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-3, 0, 10), 0);
    assert.equal(clamp(99, 0, 10), 10);
  });
});

describe("Formatierung", () => {
  it("gruppiert Tausender durchgehend mit Punkt", () => {
    // Währung und reine Zahl müssen dieselbe Gruppierung verwenden – sonst
    // stünde auf der Fahrzeugkarte "€ 34.900" neben "96 200 km".
    // Das Leerzeichen nach dem Eurozeichen ist geschützt und wird normalisiert.
    const normalize = (value: string) =>
      value.replace(/[\u00a0\u202f]/g, " ");

    assert.equal(normalize(formatEuro(3_490_000)), "€ 34.900");
    assert.equal(normalize(formatKilometers(96_200)), "96.200 km");
    assert.equal(normalize(formatNumber(1_234_567)), "1.234.567");
  });

  it("formatiert Prozentsätze mit Komma", () => {
    assert.match(formatPercent(599), /5,99/);
  });

  it("gibt Leistung in kW und PS an", () => {
    assert.match(formatPower(140), /140 kW/);
    assert.match(formatPower(140), /190 PS/);
  });
});
