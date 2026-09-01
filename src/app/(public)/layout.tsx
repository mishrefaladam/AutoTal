import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
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

  return (
    <>
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
    </>
  );
}
