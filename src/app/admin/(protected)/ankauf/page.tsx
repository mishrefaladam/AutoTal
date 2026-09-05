import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { PurchaseInquiryRow } from "@/components/admin/purchase-inquiry-row";
import {
  PURCHASE_INQUIRY_CLOSED_STATUSES,
} from "@/modules/purchase-inquiries/labels";
import { listPurchaseInquiriesForAdmin } from "@/modules/purchase-inquiries/repository";
import { formatDateTime } from "@/modules/vehicles/labels";

export const metadata: Metadata = { title: "Ankaufanfragen" };

/**
 * Kunden-Ankaufanfragen (US-11).
 *
 * Bewusst getrennt von /admin/fahrzeuge: Dort steht der eigene Bestand, hier
 * stehen Fahrzeuge, die jemand AutoTal anbietet. Die Angaben sind ungeprüfte
 * Kundenangaben und gehören nicht in denselben Topf.
 *
 * Die Trennung offen/abgeschlossen ersetzt eine Filterleiste: Bei dieser
 * Menge ist eine zweite Liste übersichtlicher als ein Filter, den man erst
 * bedienen muss.
 */
export default async function AdminPurchaseInquiriesPage() {
  const inquiries = await listPurchaseInquiriesForAdmin();

  const open = inquiries.filter(
    (inquiry) => !PURCHASE_INQUIRY_CLOSED_STATUSES.includes(inquiry.status),
  );
  const closed = inquiries.filter((inquiry) =>
    PURCHASE_INQUIRY_CLOSED_STATUSES.includes(inquiry.status),
  );

  // Datum serverseitig formatieren: So sehen alle dieselbe Schreibweise,
  // unabhängig von der Spracheinstellung des Browsers.
  const toRow = (inquiry: (typeof inquiries)[number]) => ({
    ...inquiry,
    createdAt: formatDateTime(inquiry.createdAt),
  });

  return (
    <>
      <AdminPageHeader
        title="Ankaufanfragen"
        description={
          inquiries.length === 0
            ? "Fahrzeuge, die Kundinnen und Kunden AutoTal anbieten."
            : `${open.length} offen, ${closed.length} abgeschlossen.`
        }
      />

      {inquiries.length === 0 ? (
        <AdminCard>
          <div className="py-12 text-center">
            <Inbox className="text-muted-foreground mx-auto size-9" aria-hidden="true" />
            <h2 className="font-display mt-4 text-lg font-bold">
              Noch keine Anfragen
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
              Sobald jemand das Formular unter „Auto verkaufen“ ausfüllt,
              erscheint die Anfrage hier – auch dann, wenn der E-Mail-Versand
              gerade nicht eingerichtet ist.
            </p>
          </div>
        </AdminCard>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section aria-labelledby="offene-anfragen">
              <h2
                id="offene-anfragen"
                className="font-display mb-4 text-lg font-bold tracking-tight"
              >
                Offen
              </h2>
              <div className="space-y-4">
                {open.map((inquiry) => (
                  <PurchaseInquiryRow key={inquiry.id} inquiry={toRow(inquiry)} />
                ))}
              </div>
            </section>
          )}

          {closed.length > 0 && (
            <section aria-labelledby="abgeschlossene-anfragen">
              <h2
                id="abgeschlossene-anfragen"
                className="font-display mb-4 text-lg font-bold tracking-tight"
              >
                Abgeschlossen
              </h2>
              <div className="space-y-4">
                {closed.map((inquiry) => (
                  <PurchaseInquiryRow key={inquiry.id} inquiry={toRow(inquiry)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
