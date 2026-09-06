import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { CrmLeadEditor } from "@/components/admin/crm-lead-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuro, formatKilometers } from "@/lib/money";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_TYPE_LABELS,
} from "@/modules/crm/labels";
import { getCrmLead } from "@/modules/crm/repository";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  formatDateTime,
} from "@/modules/vehicles/labels";

export const metadata: Metadata = { title: "Lead" };

/**
 * Detailansicht eines Leads.
 *
 * Stammt der Lead aus dem Ankaufformular, werden die Fahrzeugangaben aus der
 * verknüpften VehiclePurchaseInquiry gelesen – sie sind dort gespeichert und
 * werden hier bewusst nicht kopiert.
 */
export default async function AdminCrmLeadPage({
  params,
}: PageProps<"/admin/crm/[id]">) {
  const { id } = await params;
  const lead = await getCrmLead(id);

  if (!lead) notFound();

  const whatsappHref = lead.phone
    ? buildWhatsAppUrl(lead.phone, `Guten Tag ${lead.name},`)
    : null;

  return (
    <>
      <Button asChild variant="ghost" size="xl" className="mb-4 -ml-2">
        <Link href="/admin/crm">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Zurück zum CRM
        </Link>
      </Button>

      <AdminPageHeader
        title={lead.name}
        description={`${CRM_LEAD_TYPE_LABELS[lead.type]} · ${CRM_LEAD_SOURCE_LABELS[lead.source]}`}
      />

      <div className="space-y-6">
        <AdminCard title="Kontakt">
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge variant="secondary">
                  {CRM_LEAD_STATUS_LABELS[lead.status]}
                </Badge>
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">Eingegangen</dt>
              <dd className="tabular mt-1">{formatDateTime(lead.createdAt)}</dd>
            </div>

            {lead.phone && (
              <div>
                <dt className="text-muted-foreground">Telefon</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-3">
                  <a
                    href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                    className="tabular font-medium hover:underline"
                  >
                    {lead.phone}
                  </a>
                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-strong text-xs font-medium hover:underline"
                    >
                      WhatsApp öffnen
                    </a>
                  )}
                </dd>
              </div>
            )}

            {lead.email && (
              <div className="min-w-0">
                <dt className="text-muted-foreground">E-Mail</dt>
                <dd className="mt-1">
                  <a
                    href={`mailto:${lead.email}`}
                    className="font-medium break-all hover:underline"
                  >
                    {lead.email}
                  </a>
                </dd>
              </div>
            )}

            <div>
              <dt className="text-muted-foreground">Letzter Kontakt</dt>
              <dd className="tabular mt-1">
                {lead.lastContactAt
                  ? formatDateTime(lead.lastContactAt)
                  : "noch nicht dokumentiert"}
              </dd>
            </div>
          </dl>

          {lead.message && (
            <div className="bg-muted/50 mt-5 rounded-lg p-4">
              <p className="text-muted-foreground text-xs font-medium">
                Anliegen
              </p>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">
                {lead.message}
              </p>
            </div>
          )}
        </AdminCard>

        {lead.purchaseInquiry && (
          <AdminCard
            title="Angebotenes Fahrzeug"
            description="Angaben des Kunden aus der Ankaufanfrage – ungeprüft."
            action={
              <Button asChild variant="outline" size="xl">
                <Link href="/admin/ankauf">Zu den Ankaufanfragen</Link>
              </Button>
            }
          >
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Fahrzeug</dt>
                <dd className="mt-1 font-medium">
                  {lead.purchaseInquiry.make} {lead.purchaseInquiry.model}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Erstzulassung</dt>
                <dd className="tabular mt-1">
                  {lead.purchaseInquiry.firstRegistrationYear}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Kilometerstand</dt>
                <dd className="tabular mt-1">
                  {formatKilometers(lead.purchaseInquiry.mileageKm)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Antrieb</dt>
                <dd className="mt-1">
                  {FUEL_LABELS[lead.purchaseInquiry.fuel]} ·{" "}
                  {TRANSMISSION_LABELS[lead.purchaseInquiry.transmission]}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Preisvorstellung</dt>
                <dd className="tabular mt-1">
                  {lead.purchaseInquiry.priceExpectationCents !== null
                    ? formatEuro(lead.purchaseInquiry.priceExpectationCents)
                    : "keine Angabe"}
                </dd>
              </div>
              {lead.purchaseInquiry.vin && (
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Fahrgestellnummer</dt>
                  <dd className="tabular mt-1 break-all">
                    {lead.purchaseInquiry.vin}
                  </dd>
                </div>
              )}
            </dl>
          </AdminCard>
        )}

        <AdminCard title="Bearbeitung">
          <CrmLeadEditor
            lead={{
              id: lead.id,
              status: lead.status,
              internalNotes: lead.internalNotes,
            }}
          />
        </AdminCard>
      </div>
    </>
  );
}
