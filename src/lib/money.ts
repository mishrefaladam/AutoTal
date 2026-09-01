/**
 * Geld- und Prozentrechnung.
 *
 * Grundregel im Projekt: Beträge liegen als ganzzahlige Cent-Werte vor,
 * Prozentsätze als ganzzahlige Basispunkte (1 % = 100 bp). Damit gibt es
 * keine Gleitkomma-Drift in der Datenbank und keine Decimal-Objekte, die
 * über die Server/Client-Grenze serialisiert werden müssten.
 *
 * Dieses Modul ist bewusst frei von Server-Abhängigkeiten und darf auch in
 * Client-Komponenten importiert werden.
 */

export const CENTS_PER_EURO = 100;
export const BASIS_POINTS_PER_PERCENT = 100;

const euroFormatter = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const euroFormatterWithCents = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Reine Zahlen (Kilometerstand, Hubraum, Stückzahlen).
 *
 * Bewusst "de-DE" statt "de-AT": ICU gruppiert de-AT bei reinen Zahlen mit
 * einem geschützten Leerzeichen ("96 200"), bei Währungsbeträgen aber mit
 * einem Punkt ("€ 34.900"). Nebeneinander auf einer Fahrzeugkarte sähe das
 * nach einem Fehler aus. Österreichische Fahrzeuginserate schreiben durchweg
 * "96.200 km" – deshalb wird hier die Gruppierung mit Punkt erzwungen.
 * Dezimaltrennzeichen bleibt in beiden Fällen das Komma.
 */
const numberFormatter = new Intl.NumberFormat("de-DE");

/** 1999900 -> "19.999 €" */
export function formatEuro(cents: number): string {
  return euroFormatter.format(cents / CENTS_PER_EURO);
}

/** 39912 -> "399,12 €" – für Raten und Zinsbeträge. */
export function formatEuroPrecise(cents: number): string {
  return euroFormatterWithCents.format(cents / CENTS_PER_EURO);
}

/** 84500 -> "84.500 km" */
export function formatKilometers(km: number): string {
  return `${numberFormatter.format(km)} km`;
}

/** 599 -> "5,99 %" */
export function formatPercent(basisPoints: number, fractionDigits = 2): string {
  return `${(basisPoints / BASIS_POINTS_PER_PERCENT).toLocaleString("de-AT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} %`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** 599 -> 5.99 */
export function bpToPercent(basisPoints: number): number {
  return basisPoints / BASIS_POINTS_PER_PERCENT;
}

/** 5.99 -> 599 */
export function percentToBp(percent: number): number {
  return Math.round(percent * BASIS_POINTS_PER_PERCENT);
}

/** 19999 -> 1999900 */
export function eurosToCents(euros: number): number {
  return Math.round(euros * CENTS_PER_EURO);
}

/** 1999900 -> 19999 */
export function centsToEuros(cents: number): number {
  return cents / CENTS_PER_EURO;
}

/**
 * Anteil eines Betrags in Basispunkten – z. B. 20 % Anzahlung auf 19.999 €.
 * Rundet auf ganze Cent.
 */
export function applyBasisPoints(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10_000);
}

/** kW -> PS (1 kW = 1,35962 PS) */
export function kwToPs(kw: number): number {
  return Math.round(kw * 1.35962);
}

export function formatPower(kw: number): string {
  return `${numberFormatter.format(kw)} kW (${numberFormatter.format(kwToPs(kw))} PS)`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
