import { clamp } from "@/lib/money";

/**
 * Unverbindlicher Finanzierungsrechner (US-12).
 *
 * WICHTIG: Das Ergebnis ist eine überschlägige Beispielrechnung und
 * ausdrücklich KEINE Kreditzusage und kein verbindliches Angebot. Es werden
 * weder Bonität noch Bearbeitungs- oder Kontoführungsentgelte, noch eine
 * Restschuldversicherung berücksichtigt. Die tatsächlichen Konditionen legt
 * der Finanzierungspartner fest.
 *
 * Gerechnet wird eine nachschüssige Annuität mit optionaler Schlussrate
 * (Ballonfinanzierung). Alle Beträge in Cent, alle Zinssätze in Basispunkten.
 * Das Modul ist frei von Abhängigkeiten und läuft im Browser wie am Server.
 */

export type FinanceInput = {
  /** Fahrzeugpreis in Cent */
  priceCents: number;
  /** Anzahlung in Cent */
  downPaymentCents: number;
  /** Laufzeit in Monaten */
  termMonths: number;
  /** Nominalzins p. a. in Basispunkten, z. B. 599 = 5,99 % */
  interestRateBp: number;
  /** Schlussrate in Cent, 0 = klassische Ratenfinanzierung */
  balloonCents: number;
};

export type FinanceResult = {
  /** Zu finanzierender Betrag (Preis abzüglich Anzahlung) */
  financedAmountCents: number;
  /** Monatliche Rate */
  monthlyPaymentCents: number;
  /** Summe aller monatlichen Raten */
  totalPaymentsCents: number;
  /** Gesamtzinsen über die Laufzeit */
  totalInterestCents: number;
  /** Gesamtbetrag inklusive Anzahlung und Schlussrate */
  totalCostCents: number;
  /** Schlussrate (unverändert übernommen) */
  balloonCents: number;
  /** Effektiver Jahreszins in Basispunkten – indikativ, ohne Entgelte */
  effectiveRateBp: number;
};

export const FINANCE_DISCLAIMER =
  "Unverbindliche Beispielrechnung, kein Kreditangebot und keine " +
  "Kreditzusage. Die Berechnung berücksichtigt weder Ihre Bonität noch " +
  "etwaige Bearbeitungs- oder Kontoführungsentgelte. Die verbindlichen " +
  "Konditionen erhalten Sie ausschließlich von unserem Finanzierungspartner " +
  "nach positiver Bonitätsprüfung.";

/**
 * Begrenzt die Eingaben auf sinnvolle Werte.
 * Verhindert Division durch null und negative Finanzierungsbeträge,
 * egal was aus der URL oder einem manipulierten Formular kommt.
 */
export function normalizeFinanceInput(input: FinanceInput): FinanceInput {
  const priceCents = Math.max(0, Math.round(input.priceCents));
  const downPaymentCents = clamp(
    Math.round(input.downPaymentCents),
    0,
    priceCents,
  );
  const termMonths = clamp(Math.round(input.termMonths), 1, 240);
  const interestRateBp = clamp(Math.round(input.interestRateBp), 0, 5000);

  // Die Schlussrate kann den zu finanzierenden Betrag nicht übersteigen –
  // sonst wäre die monatliche Rate negativ.
  const balloonCents = clamp(
    Math.round(input.balloonCents),
    0,
    Math.max(0, priceCents - downPaymentCents),
  );

  return {
    priceCents,
    downPaymentCents,
    termMonths,
    interestRateBp,
    balloonCents,
  };
}

export function calculateFinancing(rawInput: FinanceInput): FinanceResult {
  const input = normalizeFinanceInput(rawInput);

  const financedAmountCents = input.priceCents - input.downPaymentCents;
  const monthlyRate = input.interestRateBp / 10_000 / 12;

  let monthlyPaymentCents: number;

  if (monthlyRate === 0) {
    // Zinsloser Sonderfall: Restbetrag gleichmäßig auf die Laufzeit verteilen.
    monthlyPaymentCents = Math.round(
      (financedAmountCents - input.balloonCents) / input.termMonths,
    );
  } else {
    const growth = (1 + monthlyRate) ** input.termMonths;

    // Barwert der Schlussrate vom Finanzierungsbetrag abziehen, den Rest
    // annuitätisch verteilen.
    const presentValueOfBalloon = input.balloonCents / growth;
    const annuityFactor = (monthlyRate * growth) / (growth - 1);

    monthlyPaymentCents = Math.round(
      (financedAmountCents - presentValueOfBalloon) * annuityFactor,
    );
  }

  monthlyPaymentCents = Math.max(0, monthlyPaymentCents);

  const totalPaymentsCents = monthlyPaymentCents * input.termMonths;
  const totalInterestCents = Math.max(
    0,
    totalPaymentsCents + input.balloonCents - financedAmountCents,
  );

  // Effektivzins ohne Entgelte entspricht der Aufzinsung des Monatszinses.
  const effectiveRateBp = Math.round(
    (((1 + monthlyRate) ** 12 - 1) * 10_000),
  );

  return {
    financedAmountCents,
    monthlyPaymentCents,
    totalPaymentsCents,
    totalInterestCents,
    totalCostCents:
      totalPaymentsCents + input.balloonCents + input.downPaymentCents,
    balloonCents: input.balloonCents,
    effectiveRateBp,
  };
}
