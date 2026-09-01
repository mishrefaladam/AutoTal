"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitSellCarRequest } from "@/modules/forms/actions";
import {
  SELL_CAR_FUEL_OPTIONS,
  SELL_CAR_TRANSMISSION_OPTIONS,
  sellCarSchema,
  type SellCarFormValues,
  type SellCarInput,
} from "@/modules/forms/schemas";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/modules/vehicles/labels";

/**
 * Ankaufformular (US-11).
 *
 * Bewusst kurz gehalten: Wer sein Auto verkaufen will, soll nicht zwanzig
 * Felder ausfüllen müssen. Die Details klärt der Verkauf im Rückruf.
 */

export function SellCarForm() {
  const form = useForm<SellCarFormValues, unknown, SellCarInput>({
    resolver: zodResolver(sellCarSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      make: "",
      model: "",
      firstRegistrationYear: "",
      mileageKm: "",
      fuel: undefined,
      transmission: undefined,
      vin: "",
      priceExpectationEuro: "",
      condition: "",
      privacyConsent: false,
      website: "",
    },
  });

  const { state, onSubmit } = useActionForm(form, submitSellCarRequest);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-8">
      <HoneypotField register={form.register("website")} />
      <FormStatus state={state} />

      {/* --- Fahrzeug --------------------------------------------------- */}
      <fieldset className="space-y-5">
        <legend className="font-display mb-4 text-lg font-bold">
          Ihr Fahrzeug
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Marke"
            htmlFor="sell-make"
            required
            error={errors.make?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="z. B. Volkswagen"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("make")}
              />
            )}
          </FormField>

          <FormField
            label="Modell"
            htmlFor="sell-model"
            required
            error={errors.model?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="z. B. Passat Variant 2.0 TDI"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("model")}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Erstzulassung (Jahr)"
            htmlFor="sell-year"
            required
            error={errors.firstRegistrationYear?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                placeholder="z. B. 2019"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("firstRegistrationYear")}
              />
            )}
          </FormField>

          <FormField
            label="Kilometerstand"
            htmlFor="sell-mileage"
            required
            error={errors.mileageKm?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                placeholder="z. B. 120000"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("mileageKm")}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Kraftstoff"
            htmlFor="sell-fuel"
            required
            error={errors.fuel?.message}
          >
            {({ id, invalid }) => (
              <Controller
                control={form.control}
                name="fuel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                      <SelectValue placeholder="Bitte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {SELL_CAR_FUEL_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FUEL_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>

          <FormField
            label="Getriebe"
            htmlFor="sell-transmission"
            required
            error={errors.transmission?.message}
          >
            {({ id, invalid }) => (
              <Controller
                control={form.control}
                name="transmission"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                      <SelectValue placeholder="Bitte wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {SELL_CAR_TRANSMISSION_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TRANSMISSION_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Fahrgestellnummer"
            htmlFor="sell-vin"
            error={errors.vin?.message}
            description="Steht im Zulassungsschein unter E. Hilft uns bei der genauen Bewertung."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                autoComplete="off"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("vin")}
              />
            )}
          </FormField>

          <FormField
            label="Preisvorstellung (€)"
            htmlFor="sell-price"
            error={errors.priceExpectationEuro?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                placeholder="z. B. 12000"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("priceExpectationEuro")}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Zustand und Anmerkungen"
          htmlFor="sell-condition"
          error={errors.condition?.message}
          description="Unfallschäden, Reparaturbedarf, Sonderausstattung, Reifen, Serviceheft – je ehrlicher, desto verbindlicher unser Angebot."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={5}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("condition")}
            />
          )}
        </FormField>
      </fieldset>

      {/* --- Kontakt ---------------------------------------------------- */}
      <fieldset className="space-y-5">
        <legend className="font-display mb-4 text-lg font-bold">
          Ihre Kontaktdaten
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Name"
            htmlFor="sell-name"
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
            htmlFor="sell-email"
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
          htmlFor="sell-phone"
          required
          error={errors.phone?.message}
          description="Für ein Ankaufangebot rufen wir Sie an – das geht schneller als E-Mail."
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
      </fieldset>

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
        {submitting ? "Wird gesendet …" : "Fahrzeug anbieten"}
      </Button>

      <FormFootnote />
    </form>
  );
}
