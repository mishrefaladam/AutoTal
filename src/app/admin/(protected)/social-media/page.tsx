import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SocialMediaManager } from "@/components/admin/social-media-manager";
import { getInstagramConnection } from "@/integrations/instagram";
import { deploymentEnvironment, isOpenAIConfigured } from "@/lib/env";
import {
  listSocialDrafts,
  listVehiclesForSocial,
} from "@/modules/social/repository";
import { resolveVehicleFilters } from "@/modules/vehicles/admin-repository";
import { parseVehicleFilters } from "@/modules/vehicles/filters";

export const metadata: Metadata = { title: "Social Media" };

/**
 * KI-gestützte Beiträge (EPIC 7, EPIC 8).
 *
 * Die Seite zeigt nur den Verbindungsstatus – Zugangstokens verlassen den
 * Server nie.
 */
/**
 * Beworben wird, was im Bestand steht – deshalb ist "Im Bestand" die Vorgabe.
 * "?status=all" hebt sie auf; reservierte oder verkaufte Fahrzeuge lassen sich
 * so bewusst auswählen.
 */
const DEFAULT_STATUS = "IN_STOCK" as const;

export default async function AdminSocialMediaPage({
  searchParams,
}: PageProps<"/admin/social-media">) {
  // Dieselben Adressparameter und Suchregeln wie unter /admin/fahrzeuge.
  const { filters, options } = await resolveVehicleFilters(
    parseVehicleFilters(await searchParams, { defaultStatus: DEFAULT_STATUS }),
  );

  const [vehicleSelection, drafts, connection] = await Promise.all([
    listVehiclesForSocial(filters),
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
        vehicles={vehicleSelection.vehicles}
        totalVehicleCount={vehicleSelection.totalCount}
        filters={filters}
        filterOptions={options}
        defaultStatus={DEFAULT_STATUS}
        drafts={drafts}
        openAiConfigured={isOpenAIConfigured()}
        deploymentEnvironment={deploymentEnvironment()}
        instagramConnected={connection.connected}
      />
    </>
  );
}
