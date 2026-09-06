import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/modules/admin/auth";
import { getCompany } from "@/modules/company/repository";
import { countNewCrmLeads } from "@/modules/crm/repository";
import { countOpenPurchaseInquiries } from "@/modules/purchase-inquiries/repository";

/**
 * Layout aller geschützten Adminseiten (US-14).
 *
 * `requireAdmin()` prüft bei JEDEM Aufruf gegen die Datenbank und leitet
 * andernfalls zur Anmeldung um. Die Anmeldeseite selbst liegt bewusst
 * außerhalb dieser Route-Gruppe – sonst entstünde eine Umleitungsschleife.
 */

export const metadata: Metadata = {
  title: { default: "Verwaltung", template: "%s · Verwaltung" },
  robots: { index: false, follow: false },
};

/** Adminseiten zeigen immer den aktuellen Stand, nie eine zwischengespeicherte Version. */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  // requireAdmin() zuerst und allein: Erst wenn die Anmeldung steht, wird
  // überhaupt etwas aus der Datenbank gelesen.
  const session = await requireAdmin();

  const [company, openInquiries, newLeads] = await Promise.all([
    getCompany(),
    countOpenPurchaseInquiries(),
    countNewCrmLeads(),
  ]);

  return (
    <AdminShell
      session={session}
      companyName={company.displayName}
      openInquiries={openInquiries}
      newLeads={newLeads}
    >
      {children}
    </AdminShell>
  );
}
