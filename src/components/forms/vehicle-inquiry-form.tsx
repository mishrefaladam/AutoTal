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
import { submitVehicleInquiry } from "@/modules/forms/actions";
import {
  vehicleInquirySchema,
  type VehicleInquiryFormValues,
  type VehicleInquiryInput,
} from "@/modules/forms/schemas";

/**
 * Anfrage zu einem konkreten Fahrzeug (US-08).
 *
 * Übertragen wird nur der Slug – Titel, Preis und Fahrzeugnummer holt der
 * Server aus der Datenbank. So kann niemand eine Anfrage mit manipulierten
 * Fahrzeugdaten absenden.
 */
export function VehicleInquiryForm({
  vehicleSlug,
  vehicleTitle,
}: {
  vehicleSlug: string;
  vehicleTitle: string;
}) {
  const form = useForm<VehicleInquiryFormValues, unknown, VehicleInquiryInput>({
    resolver: zodResolver(vehicleInquirySchema),
    defaultValues: {
      vehicleSlug,
      name: "",
      email: "",
      phone: "",
      message: `Guten Tag, ich interessiere mich für den ${vehicleTitle}. Ist das Fahrzeug noch verfügbar?`,
      privacyConsent: false,
      website: "",
    },
  });

  const { state, onSubmit } = useActionForm(form, submitVehicleInquiry);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5">
      <HoneypotField register={form.register("website")} />
      <input type="hidden" {...form.register("vehicleSlug")} />

      <FormStatus state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Name"
          htmlFor="inquiry-name"
          required
          error={errors.name?.message}
        >
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
          htmlFor="inquiry-email"
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

      <FormField
        label="Telefon"
        htmlFor="inquiry-phone"
        error={errors.phone?.message}
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
        label="Ihre Frage"
        htmlFor="inquiry-message"
        required
        error={errors.message?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={5}
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

      <Button
        type="submit"
        variant="brand"
        size="2xl"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? (
          <Loader2
            data-icon="inline-start"
            className="animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Send data-icon="inline-start" aria-hidden="true" />
        )}
        {submitting ? "Wird gesendet …" : "Anfrage senden"}
      </Button>

      <FormFootnote />
    </form>
  );
}
