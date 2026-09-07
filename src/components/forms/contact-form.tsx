"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Send } from "lucide-react";

import {
  FormField,
  FormFootnote,
  FormStatus,
  HoneypotField,
  useActionForm,
} from "@/components/forms/form-primitives";
import { PrivacyConsentField } from "@/components/forms/privacy-consent-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitContactForm } from "@/modules/forms/actions";
import {
  CONTACT_INTENTS,
  type ContactIntent,
} from "@/modules/forms/intent";
import {
  contactSchema,
  type ContactFormValues,
  type ContactInput,
} from "@/modules/forms/schemas";

/**
 * Allgemeines Kontaktformular für /kontakt.
 *
 * Ein einziges Formular für alle Anliegen. Kommt der Besucher von einer Seite
 * mit einem konkreten Anliegen (siehe modules/forms/intent.ts), wird dieses
 * hier zweimal sichtbar:
 *
 *   - für den Besucher als vorbelegter Betreff, den er ändern kann,
 *   - für den Server als verstecktes Feld, aus dem der CRM-Typ entsteht.
 *
 * Das versteckte Feld ist bewusst kein zweiter Kanal für den Betreff: Ändert
 * jemand den Betreff, bleibt das Anliegen dasselbe. Die Einordnung im CRM soll
 * nicht davon abhängen, wie jemand seinen Betreff formuliert.
 */
export function ContactForm({ intent }: { intent?: ContactIntent | null }) {
  const form = useForm<ContactFormValues, unknown, ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: intent ? CONTACT_INTENTS[intent].subject : "",
      message: "",
      privacyConsent: false,
      website: "",
      intent: intent ?? undefined,
    },
  });

  const { state, onSubmit } = useActionForm(form, submitContactForm);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5">
      <HoneypotField register={form.register("website")} />

      {/*
       * Das Anliegen reist als verstecktes Feld mit. Ohne Kontext wird nichts
       * gerendert – dann fehlt das Feld schlicht und der Server bleibt bei
       * GENERAL.
       */}
      {intent && <input type="hidden" {...form.register("intent")} />}

      <FormStatus state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Name" htmlFor="contact-name" required error={errors.name?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              autoComplete="name"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("name")}
            />
          )}
        </FormField>

        <FormField
          label="E-Mail"
          htmlFor="contact-email"
          required
          error={errors.email?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("email")}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Telefon"
          htmlFor="contact-phone"
          error={errors.phone?.message}
          description="Damit wir Sie bei Rückfragen schneller erreichen."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("phone")}
            />
          )}
        </FormField>

        <FormField
          label="Betreff"
          htmlFor="contact-subject"
          required
          error={errors.subject?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("subject")}
            />
          )}
        </FormField>
      </div>

      <FormField
        label="Ihre Nachricht"
        htmlFor="contact-message"
        required
        error={errors.message?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={6}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...form.register("message")}
          />
        )}
      </FormField>

      <PrivacyConsentField
        control={form.control}
        name="privacyConsent"
        error={errors.privacyConsent?.message}
      />

      <Button type="submit" variant="brand" size="2xl" disabled={submitting}>
        {submitting ? (
          <Loader2
            data-icon="inline-start"
            className="animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Send data-icon="inline-start" aria-hidden="true" />
        )}
        {submitting ? "Wird gesendet …" : "Nachricht senden"}
      </Button>

      <FormFootnote />
    </form>
  );
}
