import { ReferralPopup } from "@/components/marketing/referral-popup";
import { SiteFooter } from "@/components/site/site-footer";
import { StructuredData } from "@/components/site/structured-data";
import { SiteHeader } from "@/components/site/site-header";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCompany } from "@/modules/company/repository";

/**
 * Rahmen aller öffentlichen Seiten: Kopfzeile, Inhalt, Fußzeile.
 *
 * Die Unternehmensdaten werden hier einmal geladen; `getCompany()` ist mit
 * React `cache()` umhüllt, sodass Seiten dieselben Daten ohne zweite Abfrage
 * mitbenutzen können.
 */
export default async function PublicLayout({
  children,
}: LayoutProps<"/">) {
  const company = await getCompany();

  // Eigene Nachricht für die Empfehlungsaktion, damit AutoTal beim Eingang
  // sofort erkennt, worum es geht.
  const referralWhatsAppHref = buildWhatsAppUrl(
    company.whatsappNumber,
    `Guten Tag! Ich möchte jemanden für den ${company.displayName}-Empfehlungsbonus empfehlen.`,
  );

  return (
    <>
      {/* Strukturierte Daten – gelten für alle öffentlichen Seiten. */}
      <StructuredData company={company} />

      {/* Sprungmarke für Tastatur- und Screenreader-Nutzung. */}
      <a
        href="#inhalt"
        className="bg-brand text-brand-foreground sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium"
      >
        Zum Inhalt springen
      </a>

      <SiteHeader
        companyName={company.displayName}
        phone={company.phone}
        phoneHref={company.phoneHref}
      />

      <main id="inhalt" className="flex-1">
        {children}
      </main>

      <SiteFooter company={company} />

      <WhatsAppFab
        whatsappNumber={company.whatsappNumber}
        companyName={company.displayName}
      />

      {/* Marketing-Popup – bewusst nur im öffentlichen Bereich. */}
      <ReferralPopup whatsappHref={referralWhatsAppHref} />
    </>
  );
}
