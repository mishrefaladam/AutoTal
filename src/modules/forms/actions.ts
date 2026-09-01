"use server";

import { z } from "zod";

import { renderNotificationMail } from "@/integrations/resend/templates";
import { sendMail } from "@/integrations/resend";
import { siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatEuro, formatKilometers } from "@/lib/money";
import {
  RATE_LIMITS,
  type RateLimitRule,
  checkRateLimitForRequest,
  rateLimitMessage,
} from "@/lib/rate-limit";
import {
  type ActionResult,
  UserFacingError,
  fail,
  ok,
  toActionResult,
} from "@/lib/result";
import { prisma } from "@/lib/prisma";
import {
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  formatRegistration,
} from "@/modules/vehicles/labels";

import {
  contactSchema,
  sellCarSchema,
  testDriveSchema,
  toFieldErrors,
  vehicleInquirySchema,
} from "./schemas";

/**
 * Server Actions der öffentlichen Formulare.
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

/** Lädt das Fahrzeug serverseitig – Titel und Preis kommen nie aus dem Formular. */
async function loadVehicleForForm(slug: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { slug, active: true },
    select: {
      slug: true,
      make: true,
      model: true,
      variant: true,
      priceCents: true,
      mileageKm: true,
      firstRegistration: true,
      externalId: true,
    },
  });

  if (!vehicle) {
    throw new UserFacingError(
      "Dieses Fahrzeug ist nicht mehr verfügbar. Bitte sehen Sie sich unseren " +
        "aktuellen Bestand an – oder rufen Sie uns an, wir suchen gerne mit.",
      "NOT_FOUND",
    );
  }

  return {
    ...vehicle,
    title: [vehicle.make, vehicle.model, vehicle.variant]
      .filter(Boolean)
      .join(" "),
    url: `${siteUrl()}/fahrzeuge/${vehicle.slug}`,
  };
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
// Fahrzeuganfrage (US-08)
// ---------------------------------------------------------------------------

export async function submitVehicleInquiry(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  return handleSubmission(
    {
      schema: vehicleInquirySchema,
      rule: RATE_LIMITS.vehicleInquiry,
      formName: "fahrzeuganfrage",
    },
    raw,
    async (data) => {
      const vehicle = await loadVehicleForForm(data.vehicleSlug);

      // Das Fahrzeug muss eindeutig identifizierbar sein: Titel, Preis,
      // Anbieter-Nummer und Direktlink stehen alle in der Mail.
      const mail = renderNotificationMail({
        heading: `Anfrage zu: ${vehicle.title}`,
        intro: `${data.name} interessiert sich für ein Fahrzeug aus dem Bestand.`,
        fields: [
          { label: "Fahrzeug", value: vehicle.title },
          { label: "Preis", value: formatEuro(vehicle.priceCents) },
          { label: "Kilometerstand", value: formatKilometers(vehicle.mileageKm) },
          {
            label: "Erstzulassung",
            value: formatRegistration(vehicle.firstRegistration),
          },
          { label: "Fahrzeug-Nr.", value: vehicle.externalId },
          { label: "Name", value: data.name },
          { label: "E-Mail", value: data.email },
          { label: "Telefon", value: data.phone },
          { label: "Nachricht", value: data.message, block: true },
        ],
        footerNote: `Fahrzeug ansehen: ${vehicle.url}`,
      });

      await sendMail({
        subject: `Fahrzeuganfrage: ${vehicle.title} (${vehicle.externalId})`,
        html: mail.html,
        text: mail.text,
        replyTo: data.email,
        formName: "fahrzeuganfrage",
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Probefahrt (US-09)
// ---------------------------------------------------------------------------

const TIME_LABELS = {
  vormittag: "Vormittag",
  nachmittag: "Nachmittag",
  egal: "Zeit egal",
} as const;

export async function submitTestDriveRequest(
  raw: unknown,
): Promise<ActionResult<{ message: string }>> {
  return handleSubmission(
    {
      schema: testDriveSchema,
      rule: RATE_LIMITS.testDrive,
      formName: "probefahrt",
    },
    raw,
    async (data) => {
      const vehicle = await loadVehicleForForm(data.vehicleSlug);

      const mail = renderNotificationMail({
        heading: `Probefahrt: ${vehicle.title}`,
        intro: `${data.name} möchte eine Probefahrt vereinbaren.`,
        fields: [
          { label: "Fahrzeug", value: vehicle.title },
          { label: "Fahrzeug-Nr.", value: vehicle.externalId },
          { label: "Name", value: data.name },
          { label: "E-Mail", value: data.email },
          { label: "Telefon", value: data.phone },
          { label: "Wunschtermin", value: data.preferredDate ?? "keine Angabe" },
          { label: "Tageszeit", value: TIME_LABELS[data.preferredTime] },
          { label: "Führerschein", value: "bestätigt" },
          { label: "Anmerkung", value: data.message, block: true },
        ],
        footerNote: `Fahrzeug ansehen: ${vehicle.url}`,
      });

      await sendMail({
        subject: `Probefahrt-Anfrage: ${vehicle.title} (${vehicle.externalId})`,
        html: mail.html,
        text: mail.text,
        replyTo: data.email,
        formName: "probefahrt",
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
