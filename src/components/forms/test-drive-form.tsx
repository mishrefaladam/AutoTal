"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { CalendarClock, Loader2 } from "lucide-react";

import {
  FormField,
  FormFootnote,
  FormStatus,
  HoneypotField,
  useActionForm,
} from "@/components/forms/form-primitives";
import { PrivacyConsentField } from "@/components/forms/privacy-consent-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitTestDriveRequest } from "@/modules/forms/actions";
import {
  testDriveSchema,
  type TestDriveFormValues,
  type TestDriveInput,
} from "@/modules/forms/schemas";

/** Probefahrtanfrage zu einem konkreten Fahrzeug (US-09). */
export function TestDriveForm({ vehicleSlug }: { vehicleSlug: string }) {
  const form = useForm<TestDriveFormValues, unknown, TestDriveInput>({
    resolver: zodResolver(testDriveSchema),
    defaultValues: {
      vehicleSlug,
      name: "",
      email: "",
      phone: "",
      preferredDate: "",
      preferredTime: "egal",
      message: "",
      hasDrivingLicence: false,
      privacyConsent: false,
      website: "",
    },
  });

  const { state, onSubmit } = useActionForm(form, submitTestDriveRequest);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  // Termine in der Vergangenheit gar nicht erst anbieten.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5">
      <HoneypotField register={form.register("website")} />
      <input type="hidden" {...form.register("vehicleSlug")} />

      <FormStatus state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Name"
          htmlFor="drive-name"
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
          htmlFor="drive-email"
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
        htmlFor="drive-phone"
        required
        error={errors.phone?.message}
        description="Für die Terminbestätigung rufen wir Sie kurz an."
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

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Wunschtermin"
          htmlFor="drive-date"
          error={errors.preferredDate?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              min={today}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("preferredDate")}
            />
          )}
        </FormField>

        <FormField
          label="Tageszeit"
          htmlFor="drive-time"
          error={errors.preferredTime?.message}
        >
          {({ id }) => (
            <Controller
              control={form.control}
              name="preferredTime"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="egal">Zeit egal</SelectItem>
                    <SelectItem value="vormittag">Vormittag</SelectItem>
                    <SelectItem value="nachmittag">Nachmittag</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      </div>

      <FormField
        label="Anmerkung"
        htmlFor="drive-message"
        error={errors.message?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={3}
            placeholder="Gibt es etwas, das wir vorbereiten sollen?"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...form.register("message")}
          />
        )}
      </FormField>

      {/* Führerschein: rechtlich Voraussetzung für die Probefahrt. */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="hasDrivingLicence"
            render={({ field }) => (
              <Checkbox
                id="drive-licence"
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                aria-invalid={Boolean(errors.hasDrivingLicence)}
                className="mt-0.5"
              />
            )}
          />
          <label
            htmlFor="drive-licence"
            className="cursor-pointer text-sm leading-relaxed"
          >
            Ich besitze einen gültigen Führerschein und bringe ihn zum Termin mit.
            <span className="text-destructive ml-0.5">*</span>
          </label>
        </div>

        {errors.hasDrivingLicence && (
          <p className="text-destructive text-xs" role="alert">
            {errors.hasDrivingLicence.message}
          </p>
        )}
      </div>

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
          <CalendarClock data-icon="inline-start" aria-hidden="true" />
        )}
        {submitting ? "Wird gesendet …" : "Probefahrt anfragen"}
      </Button>

      <FormFootnote />
    </form>
  );
}
