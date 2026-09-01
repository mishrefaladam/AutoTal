import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FinanceConfigForm } from "@/components/admin/finance-config-form";
import { FinanceProvidersForm } from "@/components/admin/finance-providers-form";
import { bpToPercent } from "@/lib/money";
import {
  getFinanceConfig,
  listFinanceProvidersForAdmin,
} from "@/modules/financing/repository";
import type {
  FinanceConfigFormValues,
  FinanceProvidersFormValues,
} from "@/modules/financing/schemas";

export const metadata: Metadata = { title: "Finanzierung" };

/** Basispunkte -> Eingabefeld: 599 wird zu "5,99". */
function bpToField(basisPoints: number): string {
  return bpToPercent(basisPoints)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(".", ",");
}

export default async function AdminFinancingPage() {
  const [config, providers] = await Promise.all([
    getFinanceConfig(),
    listFinanceProvidersForAdmin(),
  ]);

  const configValues: FinanceConfigFormValues = {
    defaultInterestRateBp: bpToField(config.defaultInterestRateBp),
    minInterestRateBp: bpToField(config.minInterestRateBp),
    maxInterestRateBp: bpToField(config.maxInterestRateBp),

    minTermMonths: String(config.minTermMonths),
    maxTermMonths: String(config.maxTermMonths),
    defaultTermMonths: String(config.defaultTermMonths),

    minDownPaymentBp: bpToField(config.minDownPaymentBp),
    maxDownPaymentBp: bpToField(config.maxDownPaymentBp),
    defaultDownPaymentBp: bpToField(config.defaultDownPaymentBp),

    minBalloonBp: bpToField(config.minBalloonBp),
    maxBalloonBp: bpToField(config.maxBalloonBp),
    defaultBalloonBp: bpToField(config.defaultBalloonBp),

    disclaimer: config.disclaimer,
  };

  const providerValues: FinanceProvidersFormValues = {
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description ?? "",
      logoUrl: provider.logoUrl ?? "",
      websiteUrl: provider.websiteUrl ?? "",
      interestRateBp:
        provider.interestRateBp !== null ? bpToField(provider.interestRateBp) : "",
      active: provider.active,
    })),
  };

  return (
    <>
      <AdminPageHeader
        title="Finanzierung"
        description="Vorgaben für den Finanzierungsrechner und die Liste der Finanzierungspartner. Der Rechner bleibt in jedem Fall unverbindlich."
      />

      <div className="space-y-10">
        <FinanceConfigForm defaultValues={configValues} />
        <FinanceProvidersForm defaultValues={providerValues} />
      </div>
    </>
  );
}
