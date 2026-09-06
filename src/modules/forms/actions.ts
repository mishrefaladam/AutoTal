"use server";

import { z } from "zod";

import { renderNotificationMail } from "@/integrations/resend/templates";
import { sendMail } from "@/integrations/resend";
import { logger } from "@/lib/logger";
import { eurosToCents, formatEuro, formatKilometers } from "@/lib/money";
import {
  RATE_LIMITS,
  type RateLimitRule,
  checkRateLimitForRequest,
  rateLimitMessage,
} from "@/lib/rate-limit";
import { type ActionResult, fail, ok, toActionResult } from "@/lib/result";
import { createCrmLead } from "@/modules/crm/repository";
import { createPurchaseInquiry } from "@/modules/purchase-inquiries/repository";
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
 * DATENSCHUTZ: Beide Formulare werden seit der Einführung des CRM
 * gespeichert – jede Anfrage erzeugt einen CrmLead, damit sie im Vertrieb
 * nachverfolgt werden kann und nicht in einem Postfach verloren geht.
 *
 * Die Ankaufanfrage wird zusätzlich als VehiclePurchaseInquiry gespeichert,
 * weil dort die Fahrzeugangaben stehen; der Lead verweist darauf, statt sie
 * zu kopieren.
 *
 * Damit sind Löschfrist und ein Hinweis in der Datenschutzerklärung für BEIDE
 * Formulare erforderlich, nicht mehr nur für den Ankauf. Siehe den Hinweis in
 * src/app/(public)/datenschutz/page.tsx.
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
      // Zuerst der Lead: Er ist die belastbare Zustellung. Schlägt das fehl,
      // war die Anfrage nicht erfolgreich und der Kunde erfährt es.
      await createCrmLead({
        name: data.name,
        phone: data.phone ?? null,
        email: data.email,
        type: "GENERAL",
        source: "WEBSITE",
        message: `${data.subject}\n\n${data.message}`,
      });

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

      // Wie beim Ankauf: Die Benachrichtigung ist Komfort, nicht die
      // Zustellung. Der Lead liegt bereits im CRM.
      try {
        await sendMail({
          subject: `Kontaktanfrage: ${data.subject}`,
          html: mail.html,
          text: mail.text,
          replyTo: data.email,
          formName: "kontakt",
        });
      } catch (error) {
        logger.error(
          "Kontaktanfrage gespeichert, aber E-Mail-Benachrichtigung fehlgeschlagen",
          { error, formName: "kontakt" },
        );
      }
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

      // Zuerst speichern: Der Datensatz im Admin ist die belastbare
      // Zustellung. Schlägt das fehl, war die Anfrage nicht erfolgreich und
      // der Fehler geht an den Kunden.
      const inquiry = await createPurchaseInquiry({
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
        make: data.make,
        model: data.model,
        firstRegistrationYear: data.firstRegistrationYear,
        mileageKm: data.mileageKm,
        fuel: data.fuel,
        transmission: data.transmission,
        vin: data.vin,
        priceExpectationCents:
          data.priceExpectationEuro !== undefined
            ? eurosToCents(data.priceExpectationEuro)
            : undefined,
        message: data.condition ?? "",
      });

      // Der Lead verweist auf die Anfrage, statt die Fahrzeugdaten ein
      // zweites Mal zu speichern.
      await createCrmLead({
        name: data.name,
        phone: data.phone,
        email: data.email,
        type: "SELL",
        source: "WEBSITE",
        message: data.condition ?? "",
        purchaseInquiryId: inquiry.id,
      });

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

      // Die Benachrichtigung ist Komfort, nicht die Zustellung. Ist Resend
      // nicht eingerichtet oder gerade gestört, wäre es falsch, dem Kunden
      // einen Fehler zu zeigen – seine Anfrage liegt bereits im Admin.
      try {
        await sendMail({
          subject: `Ankauf-Anfrage: ${vehicleLabel} (EZ ${data.firstRegistrationYear})`,
          html: mail.html,
          text: mail.text,
          replyTo: data.email,
          formName: "ankauf",
        });
      } catch (error) {
        logger.error(
          "Ankaufanfrage gespeichert, aber E-Mail-Benachrichtigung fehlgeschlagen",
          { error, formName: "ankauf" },
        );
      }
    },
  );
}
