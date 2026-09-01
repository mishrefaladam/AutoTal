import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

import { FINANCE_DISCLAIMER } from "./calculator";

/**
 * Finanzierungskonfiguration und -partner (US-13, US-17).
 * Beides ist im Admin pflegbar.
 */

export const FINANCE_CONFIG_ID = "default";

export type FinanceConfigDto = {
  defaultInterestRateBp: number;
  minInterestRateBp: number;
  maxInterestRateBp: number;
  minTermMonths: number;
  maxTermMonths: number;
  defaultTermMonths: number;
  minDownPaymentBp: number;
  maxDownPaymentBp: number;
  defaultDownPaymentBp: number;
  minBalloonBp: number;
  maxBalloonBp: number;
  defaultBalloonBp: number;
  disclaimer: string;
};

export type FinanceProviderDto = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  interestRateBp: number | null;
};

/** Greift, solange der Seed nicht gelaufen ist. */
const FALLBACK_CONFIG: FinanceConfigDto = {
  defaultInterestRateBp: 599,
  minInterestRateBp: 0,
  maxInterestRateBp: 1500,
  minTermMonths: 12,
  maxTermMonths: 96,
  defaultTermMonths: 60,
  minDownPaymentBp: 0,
  maxDownPaymentBp: 8000,
  defaultDownPaymentBp: 2000,
  minBalloonBp: 0,
  maxBalloonBp: 5000,
  defaultBalloonBp: 0,
  disclaimer: FINANCE_DISCLAIMER,
};

export const getFinanceConfig = cache(async (): Promise<FinanceConfigDto> => {
  const record = await prisma.financeConfig.findUnique({
    where: { id: FINANCE_CONFIG_ID },
  });

  if (!record) return FALLBACK_CONFIG;

  return {
    defaultInterestRateBp: record.defaultInterestRateBp,
    minInterestRateBp: record.minInterestRateBp,
    maxInterestRateBp: record.maxInterestRateBp,
    minTermMonths: record.minTermMonths,
    maxTermMonths: record.maxTermMonths,
    defaultTermMonths: record.defaultTermMonths,
    minDownPaymentBp: record.minDownPaymentBp,
    maxDownPaymentBp: record.maxDownPaymentBp,
    defaultDownPaymentBp: record.defaultDownPaymentBp,
    minBalloonBp: record.minBalloonBp,
    maxBalloonBp: record.maxBalloonBp,
    defaultBalloonBp: record.defaultBalloonBp,
    disclaimer: record.disclaimer.trim() || FINANCE_DISCLAIMER,
  };
});

export const listFinanceProviders = cache(
  async (): Promise<FinanceProviderDto[]> => {
    const records = await prisma.financeProvider.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    return records.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description,
      logoUrl: record.logoUrl,
      websiteUrl: record.websiteUrl,
      interestRateBp: record.interestRateBp,
    }));
  },
);

/** Für den Admin – inklusive deaktivierter Partner. */
export async function listFinanceProvidersForAdmin() {
  return prisma.financeProvider.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}
