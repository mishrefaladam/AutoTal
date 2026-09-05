/**
 * Laufzeitgrenze abhängig vom Fahrzeugalter.
 *
 * WICHTIG: "Maximal 11 Jahre am Laufzeitende" ist keine gesetzliche
 * Bankenregel und keine Vorgabe der Finanzierungspartner – es ist eine
 * unternehmerische Entscheidung von AutoTal für den eigenen Rechner
 * (AutoTal financing policy). Ändert sich diese Vorgabe, genügt es, die
 * Konstante unten anzupassen.
 */

/** Konfigurierte Altersgrenze: So alt darf ein Fahrzeug am Laufzeitende höchstens sein. */
export const AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS = 11;

/** Laufzeiten sind ausschließlich in diesen Schritten wählbar (US-Kundenvorgabe). */
export const FINANCING_TERM_STEP_MONTHS = 12;

export const NO_FINANCING_TERM_AVAILABLE_MESSAGE =
  "Für dieses Fahrzeug ist über den Rechner aktuell keine passende " +
  "Laufzeit verfügbar. Bitte kontaktieren Sie uns für eine individuelle " +
  "Finanzierungslösung.";

/**
 * Wie viele Monate darf ein Fahrzeug mit gegebenem Erstzulassungsjahr
 * höchstens finanziert werden, damit es am Laufzeitende die konfigurierte
 * Altersgrenze nicht überschreitet?
 *
 * Beispiel: Baujahr 2019, aktuelles Jahr 2026 -> Fahrzeug ist 7 Jahre alt,
 * es bleiben 11 − 7 = 4 Jahre, also 48 Monate.
 *
 * Das Ergebnis ist immer ein Vielfaches von FINANCING_TERM_STEP_MONTHS und
 * nie negativ. Ist das Fahrzeug bereits so alt oder älter als die
 * Altersgrenze, liefert die Funktion 0 – dann ist über den Rechner keine
 * reguläre Finanzierung mehr vorgesehen.
 *
 * Ein Erstzulassungsjahr in der Zukunft (z. B. Tippfehler) wird wie "0 Jahre
 * alt" behandelt statt eine negative Laufzeit zu erzeugen.
 */
export function getMaxFinancingMonths(
  firstRegistrationYear: number,
  currentYear: number,
): number {
  const ageYears = Math.max(0, currentYear - firstRegistrationYear);
  const remainingYears = AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS - ageYears;

  if (remainingYears <= 0) return 0;

  return remainingYears * FINANCING_TERM_STEP_MONTHS;
}

/**
 * Erlaubte Laufzeiten als Liste voller 12-Monats-Schritte innerhalb der
 * gegebenen Grenzen, z. B. [12, 24, 36, 48] für minMonths=12, maxMonths=48.
 *
 * Grenzen, die selbst kein Vielfaches von FINANCING_TERM_STEP_MONTHS sind,
 * werden nach innen gerundet (die Untergrenze auf-, die Obergrenze
 * abgerundet) – es wird nie eine Laufzeit außerhalb der erlaubten Spanne
 * zurückgegeben.
 *
 * Liefert eine leere Liste, wenn in der Spanne kein gültiger Schritt liegt
 * (z. B. weil das Fahrzeug bereits zu alt für eine reguläre Finanzierung ist).
 */
export function getAllowedTermMonths(
  minMonths: number,
  maxMonths: number,
  stepMonths: number = FINANCING_TERM_STEP_MONTHS,
): number[] {
  const first = Math.ceil(Math.max(minMonths, stepMonths) / stepMonths) * stepMonths;
  const last = Math.floor(maxMonths / stepMonths) * stepMonths;

  if (last < first) return [];

  const months: number[] = [];
  for (let month = first; month <= last; month += stepMonths) {
    months.push(month);
  }
  return months;
}
