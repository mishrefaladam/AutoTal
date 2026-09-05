import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS,
  getAllowedTermMonths,
  getMaxFinancingMonths,
} from "@/modules/financing/age-limit";

/**
 * "Maximal 11 Jahre am Laufzeitende" ist eine AutoTal-Finanzierungsrichtlinie
 * für den eigenen Rechner – keine Bankenregel. Diese Tests sichern genau die
 * vom Kunden vorgegebenen Beispielwerte ab.
 */

describe("getMaxFinancingMonths", () => {
  it("2019 bei 2026 -> 48 Monate", () => {
    assert.equal(getMaxFinancingMonths(2019, 2026), 48);
  });

  it("2020 bei 2026 -> 60 Monate", () => {
    assert.equal(getMaxFinancingMonths(2020, 2026), 60);
  });

  it("2021 bei 2026 -> 72 Monate", () => {
    assert.equal(getMaxFinancingMonths(2021, 2026), 72);
  });

  it("ein brandneues Fahrzeug bekommt die volle Altersgrenze", () => {
    assert.equal(
      getMaxFinancingMonths(2026, 2026),
      AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS * 12,
    );
  });

  it("ein genau 11 Jahre altes Fahrzeug bekommt keine reguläre Laufzeit mehr", () => {
    assert.equal(getMaxFinancingMonths(2015, 2026), 0);
  });

  it("ein älteres Fahrzeug bleibt bei 0, statt negativ zu werden", () => {
    assert.equal(getMaxFinancingMonths(2005, 2026), 0);
  });

  it("ein Erstzulassungsjahr in der Zukunft erzeugt keine negative Laufzeit", () => {
    // Tippfehler im Jahr sollen nicht zu absurd langen Laufzeiten führen,
    // aber auch nicht zu einem Rechenfehler mit negativem Alter.
    const result = getMaxFinancingMonths(2030, 2026);
    assert.equal(result, AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS * 12);
  });

  it("liefert immer ein Vielfaches von 12", () => {
    for (let year = 2010; year <= 2026; year += 1) {
      assert.equal(getMaxFinancingMonths(year, 2026) % 12, 0);
    }
  });
});

describe("getAllowedTermMonths", () => {
  it("erzeugt volle 12-Monats-Schritte innerhalb der Grenzen", () => {
    assert.deepEqual(getAllowedTermMonths(12, 48), [12, 24, 36, 48]);
  });

  it("rundet eine ungerade Obergrenze nach unten ab", () => {
    // 50 Monate erlauben keine reguläre 4-Jahres-Rate mehr, wohl aber 48.
    assert.deepEqual(getAllowedTermMonths(12, 50), [12, 24, 36, 48]);
  });

  it("rundet eine ungerade Untergrenze nach oben auf", () => {
    assert.deepEqual(getAllowedTermMonths(18, 48), [24, 36, 48]);
  });

  it("liefert eine leere Liste, wenn keine Laufzeit mehr passt", () => {
    assert.deepEqual(getAllowedTermMonths(12, 0), []);
    assert.deepEqual(getAllowedTermMonths(60, 48), []);
  });

  it("kombiniert mit der Altersgrenze: 2019 bei 2026 lässt nur bis 48 zu", () => {
    const maxByAge = getMaxFinancingMonths(2019, 2026);
    assert.deepEqual(getAllowedTermMonths(12, maxByAge), [
      12, 24, 36, 48,
    ]);
  });

  it("ein zu altes Fahrzeug hat keine wählbare Laufzeit", () => {
    const maxByAge = getMaxFinancingMonths(2010, 2026);
    assert.deepEqual(getAllowedTermMonths(12, maxByAge), []);
  });
});
