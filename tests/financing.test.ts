import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateFinancing,
  estimateMonthlyPaymentCents,
  normalizeFinanceInput,
} from "@/modules/financing/calculator";

/**
 * Der Finanzierungsrechner ist die Stelle, an der ein Rechenfehler dem
 * Besucher direkt eine falsche Zahl zeigt. Deshalb wird hier gegen von Hand
 * nachgerechnete Werte geprüft, nicht gegen die eigene Implementierung.
 */

describe("calculateFinancing", () => {
  it("verteilt bei 0 % Zinsen gleichmäßig auf die Laufzeit", () => {
    const result = calculateFinancing({
      priceCents: 1_200_000, // 12.000 €
      downPaymentCents: 0,
      termMonths: 12,
      interestRateBp: 0,
      balloonCents: 0,
    });

    assert.equal(result.monthlyPaymentCents, 100_000); // 1.000 €
    assert.equal(result.totalInterestCents, 0);
    assert.equal(result.totalCostCents, 1_200_000);
  });

  it("berechnet die Annuität korrekt", () => {
    // 10.000 € über 12 Monate zu 6 % p. a.
    // i = 0,005; Faktor = i(1+i)^n / ((1+i)^n - 1) = 0,0860664
    // Rate = 10.000 × 0,0860664 = 860,66 €
    const result = calculateFinancing({
      priceCents: 1_000_000,
      downPaymentCents: 0,
      termMonths: 12,
      interestRateBp: 600,
      balloonCents: 0,
    });

    assert.equal(result.monthlyPaymentCents, 86_066);
    assert.equal(result.financedAmountCents, 1_000_000);
    // Zinsen = 12 × 860,66 − 10.000 = 327,92 €
    assert.equal(result.totalInterestCents, 32_792);
  });

  it("zieht die Anzahlung vom Finanzierungsbetrag ab", () => {
    const result = calculateFinancing({
      priceCents: 2_000_000,
      downPaymentCents: 500_000,
      termMonths: 24,
      interestRateBp: 599,
      balloonCents: 0,
    });

    assert.equal(result.financedAmountCents, 1_500_000);
    // Die Anzahlung fließt in den Gesamtbetrag ein.
    assert.equal(
      result.totalCostCents,
      result.totalPaymentsCents + 500_000,
    );
  });

  it("senkt die Rate durch eine Schlussrate", () => {
    const base = {
      priceCents: 3_000_000,
      downPaymentCents: 0,
      termMonths: 48,
      interestRateBp: 599,
    };

    const ohne = calculateFinancing({ ...base, balloonCents: 0 });
    const mit = calculateFinancing({ ...base, balloonCents: 1_000_000 });

    assert.ok(
      mit.monthlyPaymentCents < ohne.monthlyPaymentCents,
      "Schlussrate muss die Monatsrate senken",
    );
    assert.equal(mit.balloonCents, 1_000_000);
    // Die Schlussrate zählt zum Gesamtbetrag.
    assert.equal(
      mit.totalCostCents,
      mit.totalPaymentsCents + 1_000_000,
    );
  });

  it("liefert bei vollständiger Anzahlung eine Rate von null", () => {
    const result = calculateFinancing({
      priceCents: 1_500_000,
      downPaymentCents: 1_500_000,
      termMonths: 36,
      interestRateBp: 599,
      balloonCents: 0,
    });

    assert.equal(result.financedAmountCents, 0);
    assert.equal(result.monthlyPaymentCents, 0);
    assert.equal(result.totalInterestCents, 0);
  });

  it("erzeugt niemals eine negative Rate", () => {
    // Schlussrate über dem Finanzierungsbetrag – muss gekappt werden.
    const result = calculateFinancing({
      priceCents: 1_000_000,
      downPaymentCents: 0,
      termMonths: 24,
      interestRateBp: 599,
      balloonCents: 5_000_000,
    });

    assert.ok(result.monthlyPaymentCents >= 0);
    assert.ok(result.balloonCents <= 1_000_000);
  });
});

describe("normalizeFinanceInput", () => {
  it("begrenzt die Anzahlung auf den Fahrzeugpreis", () => {
    const result = normalizeFinanceInput({
      priceCents: 1_000_000,
      downPaymentCents: 9_999_999,
      termMonths: 36,
      interestRateBp: 599,
      balloonCents: 0,
    });

    assert.equal(result.downPaymentCents, 1_000_000);
  });

  it("fängt eine Laufzeit von null ab", () => {
    const result = normalizeFinanceInput({
      priceCents: 1_000_000,
      downPaymentCents: 0,
      termMonths: 0,
      interestRateBp: 599,
      balloonCents: 0,
    });

    assert.equal(result.termMonths, 1);
  });

  it("weist negative Werte zurück", () => {
    const result = normalizeFinanceInput({
      priceCents: -5_000,
      downPaymentCents: -100,
      termMonths: -12,
      interestRateBp: -300,
      balloonCents: -1,
    });

    assert.equal(result.priceCents, 0);
    assert.equal(result.downPaymentCents, 0);
    assert.equal(result.interestRateBp, 0);
    assert.equal(result.balloonCents, 0);
    assert.ok(result.termMonths >= 1);
  });
});

describe("estimateMonthlyPaymentCents", () => {
  it("entspricht der vollständigen Berechnung mit denselben Vorgaben", () => {
    const config = {
      defaultInterestRateBp: 599,
      defaultTermMonths: 60,
      defaultDownPaymentBp: 2000,
      defaultBalloonBp: 0,
    };

    const estimate = estimateMonthlyPaymentCents(3_490_000, config);

    const full = calculateFinancing({
      priceCents: 3_490_000,
      downPaymentCents: Math.round((3_490_000 * 2000) / 10_000),
      termMonths: 60,
      interestRateBp: 599,
      balloonCents: 0,
    });

    assert.equal(estimate, full.monthlyPaymentCents);
  });
});
