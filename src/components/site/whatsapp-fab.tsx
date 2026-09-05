"use client";

import { usePathname } from "next/navigation";

import { buildWhatsAppUrl, generalWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Schwebender WhatsApp-Knopf (US-10).
 *
 * Sitzt unten rechts und bleibt beim Scrollen sichtbar.
 *
 * Rendert nichts, wenn:
 *   - im Admin keine WhatsApp-Nummer hinterlegt ist (ein toter Kontaktweg ist
 *     schlimmer als gar keiner), oder
 *   - man auf einer Fahrzeugdetailseite ist. Dort gibt es bereits einen
 *     eigenen WhatsApp-Knopf, dessen Nachricht das konkrete Fahrzeug enthält.
 *     Der schwebende Knopf wäre dort nicht nur doppelt, sondern schlechter –
 *     und er überdeckte auf dem Smartphone den primären CTA.
 */
export function WhatsAppFab({
  whatsappNumber,
  companyName,
}: {
  whatsappNumber: string | null;
  companyName: string;
}) {
  const pathname = usePathname();

  const href = buildWhatsAppUrl(
    whatsappNumber,
    generalWhatsAppMessage(companyName),
  );

  if (!href) return null;

  // /fahrzeuge/<slug> – die Übersicht /fahrzeuge behält den Knopf.
  const isVehicleDetail = /^\/fahrzeuge\/[^/]+$/.test(pathname);
  if (isVehicleDetail) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${companyName} über WhatsApp kontaktieren (öffnet in neuem Tab)`}
      className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-[#25D366]/50 focus-visible:outline-none sm:right-6 sm:bottom-6"
    >
      {/* Offizielle WhatsApp-Glyphe – in lucide nicht enthalten. */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="size-7"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.548 4.142 1.588 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.9 11.9 0 0 0-3.497-8.4" />
      </svg>
    </a>
  );
}
