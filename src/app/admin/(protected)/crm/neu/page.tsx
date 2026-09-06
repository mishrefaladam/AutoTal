import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import { CrmLeadForm } from "@/components/admin/crm-lead-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Lead anlegen" };

/** Lead von Hand erfassen, etwa nach einem Anruf. */
export default function AdminCrmNewLeadPage() {
  return (
    <>
      <Button asChild variant="ghost" size="xl" className="mb-4 -ml-2">
        <Link href="/admin/crm">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Zurück zum CRM
        </Link>
      </Button>

      <AdminPageHeader
        title="Lead anlegen"
        description="Für Kontakte, die nicht über ein Formular kommen – etwa ein Anruf oder eine Nachricht auf einer Fahrzeugplattform."
      />

      <AdminCard>
        <CrmLeadForm />
      </AdminCard>
    </>
  );
}
