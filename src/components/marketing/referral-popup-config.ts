/**
 * Einstellungen des Empfehlungsbonus-Popups.
 *
 * Bewusst eine eigene Datei ohne "use client": So kann auch serverseitiger
 * Code (und der Test) die Werte lesen, ohne die Client-Komponente zu ziehen.
 */

/** Verzögerung, bevor das Popup erscheint. Kurz genug, um gesehen zu werden,
 *  lang genug, um den ersten Seitenaufbau nicht zu stören. */
export const REFERRAL_POPUP_DELAY_MS = 1500;

/** Wie lange nach dem Schließen Ruhe ist. */
export const REFERRAL_POPUP_SNOOZE_DAYS = 7;

/** Schlüssel im localStorage. Versioniert, damit eine spätere Kampagne
 *  wieder bei allen erscheint, ohne alte Einträge löschen zu müssen. */
export const REFERRAL_POPUP_STORAGE_KEY = "autotal.referral-popup.v1";

/** Das fertige Kampagnenmotiv (1080 × 1920). */
export const REFERRAL_POPUP_IMAGE = {
  src: "/marketing/empfehlungsbonus.jpg",
  width: 1080,
  height: 1920,
  alt: "250 € Empfehlungsprämie: Wer jemanden empfiehlt, der ein Auto kauft, bekommt 250 € bar.",
} as const;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Soll das Popup angezeigt werden?
 *
 * `storedValue` ist der Rohwert aus dem localStorage (oder null). Als reine
 * Funktion gehalten, damit sich das Verhalten ohne Browser testen lässt.
 *
 * Unlesbare oder veraltete Werte führen zum Anzeigen – im Zweifel lieber
 * einmal zu viel zeigen als die Kampagne wegen eines kaputten Eintrags
 * dauerhaft zu verschlucken.
 */
export function shouldShowReferralPopup(
  storedValue: string | null,
  now: number = Date.now(),
  snoozeDays: number = REFERRAL_POPUP_SNOOZE_DAYS,
): boolean {
  if (storedValue === null) return true;

  const dismissedAt = Number(storedValue);
  if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return true;

  // Ein Zeitstempel aus der Zukunft deutet auf eine verstellte Systemuhr hin.
  // Ihn zu akzeptieren würde das Popup womöglich für Jahre stummschalten.
  if (dismissedAt > now) return true;

  return now - dismissedAt >= snoozeDays * DAY_IN_MS;
}
