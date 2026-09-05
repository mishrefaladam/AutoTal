"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { requireAdminForAction } from "@/modules/admin/auth";
import { toFieldErrors } from "@/modules/forms/schemas";

import { FINANCE_CONFIG_ID } from "./repository";
import { financeConfigSchema, financeProvidersSchema } from "./schemas";

/**
 * Verwaltung der Finanzierungsparameter und -partner (US-13, US-17).
 *
 * Nach einer Änderung wird die Finanzierungsseite neu validiert.
 */

/**
 * Einzige öffentliche Seite, die Finanzierungsdaten anzeigt.
 *
 * /fahrzeuge zeigt die eingebettete willhaben-Börse und die Startseite
 * verlinkt nur auf den Rechner – beide lesen keine Finanzierungsdaten.
 */
function revalidateFinancePages() {
  revalidatePath("/finanzierung");
}

export async function saveFinanceConfig(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = financeConfigSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    await prisma.financeConfig.upsert({
      where: { id: FINANCE_CONFIG_ID },
      create: { id: FINANCE_CONFIG_ID, ...parsed.data },
      update: parsed.data,
    });

    logger.info("Finanzierungskonfiguration aktualisiert", { userId: admin.id });
    revalidateFinancePages();

    return ok({ message: "Die Finanzierungsparameter wurden gespeichert." });
  } catch (error) {
    logger.error("Finanzierungskonfiguration konnte nicht gespeichert werden", {
      error,
    });
    return toActionResult(error);
  }
}

export async function saveFinanceProviders(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const admin = await requireAdminForAction();

    const parsed = financeProvidersSchema.safeParse(raw);

    if (!parsed.success) {
      return fail("Bitte prüfen Sie die markierten Felder.", {
        code: "VALIDATION",
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const { providers } = parsed.data;
    const keptIds = providers
      .map((provider) => provider.id)
      .filter((id): id is string => Boolean(id));

    await prisma.$transaction(async (tx) => {
      // Entfernte Partner löschen …
      await tx.financeProvider.deleteMany({
        where: keptIds.length > 0 ? { id: { notIn: keptIds } } : {},
      });

      // … bestehende aktualisieren, neue anlegen.
      for (const [index, provider] of providers.entries()) {
        const data = {
          name: provider.name,
          description: provider.description,
          logoUrl: provider.logoUrl,
          websiteUrl: provider.websiteUrl,
          interestRateBp: provider.interestRateBp,
          active: provider.active,
          position: index,
        };

        if (provider.id) {
          await tx.financeProvider.update({ where: { id: provider.id }, data });
        } else {
          await tx.financeProvider.create({ data });
        }
      }
    });

    logger.info("Finanzierungspartner aktualisiert", {
      userId: admin.id,
      count: providers.length,
    });
    revalidateFinancePages();

    return ok({ message: "Die Finanzierungspartner wurden gespeichert." });
  } catch (error) {
    logger.error("Finanzierungspartner konnten nicht gespeichert werden", { error });
    return toActionResult(error);
  }
}
