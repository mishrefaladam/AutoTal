import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { IntegrationsPanel } from "@/components/admin/integrations-panel";
import { getInstagramConnection } from "@/integrations/instagram";
import {
  PROVIDER_LABELS,
  VEHICLE_WIDGET_PROVIDER,
} from "@/components/integrations/vehicle-widget";
import { isInstagramConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Integrationen" };

/**
 * Integrationen: Fahrzeugbörse und Instagram (US-22).
 *
 * Das frühere Synchronisierungsprotokoll ist entfallen – es wird nichts mehr
 * synchronisiert. Der Fahrzeugbestand kommt direkt aus dem eingebetteten
 * willhaben-Widget.
 */
export default async function AdminIntegrationsPage({
  searchParams,
}: PageProps<"/admin/integrationen">) {
  const [instagram, params] = await Promise.all([
    getInstagramConnection(),
    searchParams,
  ]);

  const success =
    typeof params.ig_success === "string" ? params.ig_success : null;
  const error = typeof params.ig_error === "string" ? params.ig_error : null;

  return (
    <>
      <AdminPageHeader
        title="Integrationen"
        description="Fahrzeugbörse und die Verbindung zu Instagram."
      />

      <IntegrationsPanel
        widgetProvider={VEHICLE_WIDGET_PROVIDER}
        widgetLabel={PROVIDER_LABELS[VEHICLE_WIDGET_PROVIDER]}
        instagram={instagram}
        instagramConfigured={isInstagramConfigured()}
        initialFeedback={
          success
            ? { kind: "success", message: success }
            : error
              ? { kind: "error", message: error }
              : null
        }
      />
    </>
  );
}
