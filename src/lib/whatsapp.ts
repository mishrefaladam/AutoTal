import { formatEuro, formatKilometers } from "./money";

/**
 * WhatsApp-Deeplinks (US-10).
 *
 * Über wa.me wird eine vorformulierte Nachricht geöffnet, die der Nutzer vor
 * dem Senden noch ändern kann. Bei einer Fahrzeuganfrage enthält die Nachricht
 * das Fahrzeug eindeutig – inklusive Direktlink, damit im Verkauf sofort klar
 * ist, worum es geht.
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

export type WhatsAppVehicleContext = {
  title: string;
  priceCents: number;
  mileageKm: number;
  slug: string;
};

/** Nachricht zu einem konkreten Fahrzeug – inklusive eindeutigem Link. */
export function vehicleWhatsAppMessage(
  vehicle: WhatsAppVehicleContext,
  siteUrl: string,
): string {
  const url = `${siteUrl.replace(/\/$/, "")}/fahrzeuge/${vehicle.slug}`;

  return (
    `Guten Tag! Ich interessiere mich für dieses Fahrzeug:\n\n` +
    `${vehicle.title}\n` +
    `${formatEuro(vehicle.priceCents)} · ${formatKilometers(vehicle.mileageKm)}\n` +
    `${url}\n\n` +
    `Ist es noch verfügbar?`
  );
}

export function testDriveWhatsAppMessage(
  vehicle: WhatsAppVehicleContext,
  siteUrl: string,
): string {
  const url = `${siteUrl.replace(/\/$/, "")}/fahrzeuge/${vehicle.slug}`;

  return (
    `Guten Tag! Ich möchte gerne eine Probefahrt vereinbaren:\n\n` +
    `${vehicle.title}\n` +
    `${url}\n\n` +
    `Wann wäre das bei Ihnen möglich?`
  );
}
