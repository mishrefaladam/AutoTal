"use server";

import { z } from "zod";

import { renderNotificationMail } from "@/integrations/resend/templates";
import { sendMail } from "@/integrations/resend";
import { logger } from "@/lib/logger";
import { formatEuro, formatKilometers } from "@/lib/money";
import {
  RATE_LIMITS,
  type RateLimitRule,
  checkRateLimitForRequest,
  rateLimitMessage,
} from "@/lib/rate-limit";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/modules/vehicles/labels";

import { contactSchema, sellCarSchema, toFieldErrors } from "./schemas";

/**
 * Server Actions der öffentlichen Formulare.
 *
 * Fahrzeuganfrage und Probefahrt sind entfallen: Der Fahrzeugbestand wird
 * über die eingebettete willhaben-Fahrzeugbörse angezeigt, es gibt auf dieser
 * Website keine eigenen Fahrzeug-Detailseiten mehr, von denen aus solche
 * Anfragen gestellt werden könnten. Interessenten nehmen entweder direkt über
 * willhaben Kontakt auf oder über das allgemeine Kontaktformular.
 *
 * Ablauf für alle: Rate Limit -> Validierung -> Anreicherung aus der
 * Datenbank -> Versand über Resend.
 *
 * DATENSCHUTZ: Formulardaten werden NICHT in der Datenbank gespeichert. Sie
 * gehen ausschließlich per E-Mail an das Autohaus. Wer das ändert, muss die
 * Datenschutzerklärung anpassen und eine Löschfrist definieren.
 *
 * Es wird nie eine rohe Exception zum Client durchgereicht – Fehler kommen als
 * `ActionResult` mit einer für Nutzer verständlichen Meldung zurück (US-29).
 */

const SUCCESS_MESSAGE =
  "Vielen Dank! Ihre Nachricht ist bei uns eingegangen. " +
  "Wir melden uns so rasch wie möglich bei Ihnen.";

/**
 * Gemeinsamer Rahmen: Rate Limit prüfen, Eingabe validieren, Fehler
 * einheitlich übersetzen.
 */
async function handleSubmission<Schema extends z.ZodType>(
  options: { schema: Schema; rule: RateLimitRule; formName: string },
  raw: unknown,
  send: (data: z.infer<Schema>) => Promise<void>,
): Promise<ActionResult<{ message: string }>> {
  const limit = await checkRateLimitForRequest(options.rule);

  if (!limit.allowed) {
    logger.warn("Formular durch Rate Limit abgewiesen", {
      formName: options.formName,
    });
    return fail(rateLimitMessage(limit), { code: "RATE_LIMITED" });
  }

  const parsed = options.schema.safeParse(raw);

  if (!parsed.success) {
    return fail("Bitte prüfen Sie die markierten Felder.", {
      code: "VALIDATION",
      fieldErrors: toFieldErrors(parsed.error),
    });
  }

  try {
    await send(parsed.data);
    return ok({ message: SUCCESS_MESSAGE });
  } catch (error) {
    return toActionResult(error);
  }
}

// ---------------------------------------------------------------------------
// Kontaktformular
// ---------------------------------------------------------------------------

export async function submitContactForm(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  return handleSubmission(
    { schema: contactSchema, rule: RATE_LIMITS.contact, formName: "kontakt" },
    raw,
    async (data) => {
      const mail = renderNotificationMail({
        heading: data.subject,
        intro: `${data.name} hat das Kontaktformular ausgefüllt.`,
        fields: [
          { label: "Name", value: data.name },
          { label: "E-Mail", value: data.email },
          { label: "Telefon", value: data.phone },
          { label: "Nachricht", value: data.message, block: true },
        ],
      });

      await sendMail({
        subject: `Kontaktanfrage: ${data.subject}`,
        html: mail.html,
        text: mail.text,
        replyTo: data.email,
        formName: "kontakt",
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Fahrzeugankauf (US-11)
// ---------------------------------------------------------------------------

export async function submitSellCarRequest(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  return handleSubmission(
    { schema: sellCarSchema, rule: RATE_LIMITS.sellCar, formName: "ankauf" },
    raw,
    async (data) => {
      const vehicleLabel = `${data.make} ${data.model}`;

      const mail = renderNotificationMail({
        heading: `Ankaufangebot: ${vehicleLabel}`,
        intro: `${data.name} möchte ein Fahrzeug verkaufen.`,
        fields: [
          { label: "Fahrzeug", value: vehicleLabel },
          { label: "Erstzulassung", value: String(data.firstRegistrationYear) },
          { label: "Kilometerstand", value: formatKilometers(data.mileageKm) },
          { label: "Kraftstoff", value: FUEL_LABELS[data.fuel] },
          { label: "Getriebe", value: TRANSMISSION_LABELS[data.transmission] },
          { label: "Fahrgestellnummer", value: data.vin },
          {
            label: "Preisvorstellung",
            value:
              data.priceExpectationEuro !== undefined
                ? formatEuro(data.priceExpectationEuro * 100)
                : "keine Angabe",
          },
          { label: "Name", value: data.name },
          { label: "E-Mail", value: data.email },
          { label: "Telefon", value: data.phone },
          { label: "Zustand / Anmerkungen", value: data.condition, block: true },
        ],
      });

      await sendMail({
        subject: `Ankauf-Anfrage: ${vehicleLabel} (EZ ${data.firstRegistrationYear})`,
        html: mail.html,
        text: mail.text,
        replyTo: data.email,
        formName: "ankauf",
      });
    },
  );
}
