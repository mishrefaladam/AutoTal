import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { IntegrationsPanel } from "@/components/admin/integrations-panel";
import { getInstagramConnection } from "@/integrations/instagram";
import { listVehicleProviders } from "@/integrations/vehicles";
import { isInstagramConfigured } from "@/lib/env";
import { listSyncRuns } from "@/modules/vehicles/sync";

export const metadata: Metadata = { title: "Integrationen" };

/**
 * Integrationen: Fahrzeugquelle, Sync-Protokoll (US-27) und Instagram (US-22).
 *
 * Meldungen aus dem OAuth-Rücksprung kommen als Query-Parameter zurück und
 * werden hier in den Anfangszustand des Panels übernommen.
 */
export default async function AdminIntegrationsPage({
  searchParams,
}: PageProps<"/admin/integrationen">) {
  const [providers, syncRuns, instagram, params] = await Promise.all([
    listVehicleProviders(),
    listSyncRuns(15),
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
        description="Fahrzeugquelle, Synchronisierungsprotokoll und die Verbindung zu Instagram."
      />

      <IntegrationsPanel
        providers={providers}
        syncRuns={syncRuns}
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
