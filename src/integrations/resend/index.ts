import "server-only";

import { Resend } from "resend";

import { env, isResendConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/result";

/**
 * E-Mail-Versand über Resend.
 *
 * Der API-Key bleibt ausschließlich hier – das Modul ist `server-only` und
 * wird nur aus Server Actions aufgerufen. Es gibt keinen Pfad, über den der
 * Key in ein Client-Bundle geraten könnte.
 *
 * Die E-Mail ist eine BENACHRICHTIGUNG, nicht die Zustellung. Kontakt- und
 * Ankaufanfragen werden zuerst in der Datenbank gespeichert (CrmLead, bei
 * Ankauf zusätzlich VehiclePurchaseInquiry) und sind im Admin sichtbar. Erst
 * danach wird versucht, das Postfach zu benachrichtigen.
 *
 * Daraus folgt, wie hier mit Fehlern umzugehen ist:
 *
 *   - Ist Resend nicht eingerichtet oder gerade gestört, wirft `sendMail` einen
 *     UserFacingError. Die aufrufenden Server Actions fangen ihn ab und
 *     protokollieren ihn, statt ihn an den Kunden weiterzureichen.
 *   - Denn eine bereits gespeicherte Anfrage darf dem Kunden NICHT als
 *     fehlgeschlagen dargestellt werden. Er würde sie sonst erneut abschicken,
 *     obwohl sie längst im Admin liegt.
 *   - Umgekehrt gilt: Fehlt die Benachrichtigung, erfährt AutoTal von der
 *     Anfrage nur beim Blick in den Admin. Deshalb wird jeder Fehlschlag
 *     geloggt und der Zustand im Dashboard als "nicht bereit" angezeigt.
 *
 * Geloggt werden dabei nur Formularname und Betreff – der Inhalt enthält
 * personenbezogene Daten und bleibt bewusst außen vor.
 */

let client: Resend | null = null;

function getClient(): Resend {
  const apiKey = env().RESEND_API_KEY;

  if (!apiKey) {
    throw new UserFacingError(
      "Der E-Mail-Versand ist derzeit nicht eingerichtet. " +
        "Bitte rufen Sie uns an – wir helfen Ihnen sofort weiter.",
      "NOT_CONFIGURED",
    );
  }

  client ??= new Resend(apiKey);
  return client;
}

export type SendMailInput = {
  subject: string;
  html: string;
  text: string;
  /** Adresse des Absenders für die Antwort-Funktion im Postfach. */
  replyTo?: string;
  /** Zur Ablage im Log, welches Formular die Mail ausgelöst hat. */
  formName: string;
};

export async function sendMail(input: SendMailInput): Promise<void> {
  const config = env();

  if (!isResendConfigured()) {
    // Betreff und Formularname sind unbedenklich; der Inhalt enthält
    // personenbezogene Daten und wird bewusst NICHT geloggt.
    logger.warn("E-Mail nicht versendet – Resend ist nicht konfiguriert", {
      formName: input.formName,
      subject: input.subject,
    });

    throw new UserFacingError(
      "Der E-Mail-Versand ist derzeit nicht eingerichtet. " +
        "Bitte rufen Sie uns an oder schreiben Sie uns per WhatsApp.",
      "NOT_CONFIGURED",
    );
  }

  try {
    const { error } = await getClient().emails.send({
      from: config.RESEND_FROM_EMAIL!,
      to: [config.CONTACT_INBOX_EMAIL!],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      // Die Resend-Fehlermeldung kann Adressdetails enthalten – sie bleibt
      // im Log und wird nicht an den Browser weitergereicht.
      logger.error("Resend hat den Versand abgelehnt", {
        formName: input.formName,
        resendError: error.message,
      });

      throw new UserFacingError(
        "Ihre Nachricht konnte gerade nicht zugestellt werden. " +
          "Bitte versuchen Sie es in ein paar Minuten erneut oder rufen Sie uns an.",
        "SERVICE_UNAVAILABLE",
      );
    }

    logger.info("Formular-E-Mail versendet", { formName: input.formName });
  } catch (error) {
    if (error instanceof UserFacingError) throw error;

    logger.error("E-Mail-Versand fehlgeschlagen", {
      formName: input.formName,
      error,
    });

    throw new UserFacingError(
      "Ihre Nachricht konnte gerade nicht zugestellt werden. " +
        "Bitte versuchen Sie es in ein paar Minuten erneut oder rufen Sie uns an.",
      "SERVICE_UNAVAILABLE",
    );
  }
}
