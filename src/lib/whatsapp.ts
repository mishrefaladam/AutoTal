/**
 * WhatsApp-Deeplinks (US-10).
 *
 * Über wa.me wird eine vorformulierte Nachricht geöffnet, die der Nutzer vor
 * dem Senden noch ändern kann.
 *
 * Fahrzeugbezogene Nachrichten gibt es hier nicht mehr: Der Bestand liegt in
 * der eingebetteten willhaben-Fahrzeugbörse, die Website kennt die einzelnen
 * Fahrzeuge nicht. Anfragen zu einem konkreten Fahrzeug laufen über willhaben
 * selbst.
 *
 * Frei von Server-Abhängigkeiten, damit auch Client-Komponenten den Link bauen
 * können.
 */

/** wa.me akzeptiert ausschließlich Ziffern inklusive Ländervorwahl. */
export function normalizeWhatsAppNumber(input: string | null): string | null {
  if (!input) return null;

  const digits = input.replace(/[^\d]/g, "");
  // Kürzer als eine Ländervorwahl plus Nummer kann nicht stimmen.
  return digits.length >= 8 ? digits : null;
}

export function buildWhatsAppUrl(
  number: string | null,
  message: string,
): string | null {
  const normalized = normalizeWhatsAppNumber(number);
  if (!normalized) return null;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function generalWhatsAppMessage(companyName: string): string {
  return `Guten Tag! Ich habe eine Frage an ${companyName}.`;
}
