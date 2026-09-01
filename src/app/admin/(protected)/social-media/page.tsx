import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SocialMediaManager } from "@/components/admin/social-media-manager";
import { getInstagramConnection } from "@/integrations/instagram";
import { isOpenAIConfigured } from "@/lib/env";
import {
  listSocialDrafts,
  listVehiclesForSocial,
} from "@/modules/social/repository";

export const metadata: Metadata = { title: "Social Media" };

/**
 * KI-gestützte Beiträge (EPIC 7, EPIC 8).
 *
 * Die Seite zeigt nur den Verbindungsstatus – Zugangstokens verlassen den
 * Server nie.
 */
export default async function AdminSocialMediaPage() {
  const [vehicles, drafts, connection] = await Promise.all([
    listVehiclesForSocial(),
    listSocialDrafts(),
    getInstagramConnection(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Social Media"
        description="Fahrzeug wählen, Text erstellen lassen, prüfen, freigeben und veröffentlichen. Nichts geht ohne Ihre ausdrückliche Freigabe online."
      />

      <SocialMediaManager
        vehicles={vehicles}
        drafts={drafts}
        openAiConfigured={isOpenAIConfigured()}
        instagramConnected={connection.connected}
      />
    </>
  );
}
