"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  FormField,
  FormStatus,
  useActionForm,
} from "@/components/forms/form-primitives";
import { SocialIcon, SOCIAL_PLATFORM_LABELS } from "@/components/site/social-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCompanySettings } from "@/modules/company/actions";
import { VEHICLE_PLATFORMS } from "@/modules/company/vehicle-platforms";
import {
  companySettingsSchema,
  type CompanySettingsFormValues,
  type CompanySettingsInput,
} from "@/modules/company/schemas";
import { weekdayLabel } from "@/modules/vehicles/labels";

/**
 * Formular für Unternehmensdaten, Öffnungszeiten und Social-Links
 * (US-15, US-16).
 *
 * Öffnungszeiten: pro Wochentag zwei feste Zeitfenster – das deckt den
 * Regelfall "Vormittag / Nachmittag mit Mittagspause" ab, ohne dass eine
 * dynamische Liste mit Hinzufügen und Löschen nötig wäre.
 */

const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
] as const;

const SLOTS_PER_DAY = 2;

export function CompanyForm({
  defaultValues,
}: {
  defaultValues: CompanySettingsFormValues;
}) {
  const form = useForm<
    CompanySettingsFormValues,
    unknown,
    CompanySettingsInput
  >({
    resolver: zodResolver(companySettingsSchema),
    defaultValues,
  });

  const { state, onSubmit } = useActionForm(form, saveCompanySettings);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus state={state} />

      {/* --- Stammdaten -------------------------------------------------- */}
      <AdminCard
        title="Stammdaten"
        description="Firmenwortlaut und Anzeigename erscheinen im Impressum, im Seitenkopf und in der Fußzeile."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Firmenwortlaut"
            htmlFor="c-legalName"
            required
            error={errors.legalName?.message}
            description="Vollständiger Name laut Firmenbuch."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("legalName")}
              />
            )}
          </FormField>

          <FormField
            label="Anzeigename"
            htmlFor="c-displayName"
            required
            error={errors.displayName?.message}
            description="Kurzform für Logo und Navigation."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("displayName")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5 space-y-5">
          <FormField
            label="Kurzbeschreibung"
            htmlFor="c-tagline"
            error={errors.tagline?.message}
            description="Ein Satz, der auf der Startseite und in der Fußzeile erscheint."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("tagline")}
              />
            )}
          </FormField>

          <FormField
            label="Über uns"
            htmlFor="c-aboutText"
            error={errors.aboutText?.message}
            description="Fließtext für die Seite „Über uns“. Absätze durch eine Leerzeile trennen."
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={7}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("aboutText")}
              />
            )}
          </FormField>
        </div>
      </AdminCard>

      {/* --- Adresse und Kontakt ----------------------------------------- */}
      <AdminCard title="Adresse und Kontakt">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Straße und Hausnummer"
            htmlFor="c-street"
            required
            error={errors.street?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("street")}
              />
            )}
          </FormField>

          <div className="grid grid-cols-[8rem_1fr] gap-4">
            <FormField
              label="PLZ"
              htmlFor="c-postalCode"
              required
              error={errors.postalCode?.message}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  {...form.register("postalCode")}
                />
              )}
            </FormField>

            <FormField
              label="Ort"
              htmlFor="c-city"
              required
              error={errors.city?.message}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  {...form.register("city")}
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Land"
            htmlFor="c-country"
            required
            error={errors.country?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("country")}
              />
            )}
          </FormField>

          <FormField
            label="Telefon"
            htmlFor="c-phone"
            required
            error={errors.phone?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="tel"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("phone")}
              />
            )}
          </FormField>

          <FormField
            label="E-Mail"
            htmlFor="c-email"
            required
            error={errors.email?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("email")}
              />
            )}
          </FormField>

          <FormField
            label="WhatsApp-Nummer"
            htmlFor="c-whatsapp"
            error={errors.whatsappNumber?.message}
            description="Nur Ziffern mit Ländervorwahl, z. B. 436641234567. Leer lassen blendet alle WhatsApp-Schaltflächen aus."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("whatsappNumber")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <FormField
            label="Breitengrad"
            htmlFor="c-latitude"
            error={errors.latitude?.message}
            description="Optional, z. B. 48.1575"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("latitude")}
              />
            )}
          </FormField>

          <FormField
            label="Längengrad"
            htmlFor="c-longitude"
            error={errors.longitude?.message}
            description="Optional, z. B. 14.0289"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("longitude")}
              />
            )}
          </FormField>
        </div>
      </AdminCard>

      {/* --- Rechtliche Angaben ------------------------------------------ */}
      <AdminCard
        title="Rechtliche Angaben"
        description="Diese Angaben erscheinen im Impressum. In Österreich sind sie nach § 5 ECG verpflichtend."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="UID-Nummer"
            htmlFor="c-vatId"
            error={errors.vatId?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="ATU12345678"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("vatId")}
              />
            )}
          </FormField>

          <FormField
            label="Firmenbuchnummer"
            htmlFor="c-fn"
            error={errors.commercialRegisterNumber?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="FN 123456a"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("commercialRegisterNumber")}
              />
            )}
          </FormField>

          <FormField
            label="Firmenbuchgericht"
            htmlFor="c-court"
            error={errors.commercialRegisterCourt?.message}
            description="Steht im Firmenbuchauszug."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Landesgericht Korneuburg"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("commercialRegisterCourt")}
              />
            )}
          </FormField>

          <FormField
            label="GISA-Zahl"
            htmlFor="c-gisa"
            error={errors.gisaNumber?.message}
            description="Aus dem Gewerbeschein (GISA-Auszug)."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("gisaNumber")}
              />
            )}
          </FormField>

          <FormField
            label="Aufsichtsbehörde"
            htmlFor="c-authority"
            error={errors.supervisoryAuthority?.message}
            description="Zuständige Bezirkshauptmannschaft bzw. Magistrat."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Bezirkshauptmannschaft …"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("supervisoryAuthority")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5">
          <FormField
            label="Gewerbewortlaut"
            htmlFor="c-purpose"
            error={errors.businessPurpose?.message}
            description="Wortlaut exakt wie im Gewerberegister – nicht sinngemäß umformulieren."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("businessPurpose")}
              />
            )}
          </FormField>
        </div>
      </AdminCard>

      {/* --- Ansprechpartner --------------------------------------------- */}
      <AdminCard title="Ansprechpartner">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Name"
            htmlFor="c-cpName"
            error={errors.contactPersonName?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("contactPersonName")}
              />
            )}
          </FormField>

          <FormField
            label="Funktion"
            htmlFor="c-cpRole"
            error={errors.contactPersonRole?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Verkaufsleitung"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("contactPersonRole")}
              />
            )}
          </FormField>

          <FormField
            label="E-Mail"
            htmlFor="c-cpEmail"
            error={errors.contactPersonEmail?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("contactPersonEmail")}
              />
            )}
          </FormField>

          <FormField
            label="Telefon"
            htmlFor="c-cpPhone"
            error={errors.contactPersonPhone?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="tel"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("contactPersonPhone")}
              />
            )}
          </FormField>
        </div>
      </AdminCard>

      {/* --- Öffnungszeiten ---------------------------------------------- */}
      <AdminCard
        title="Öffnungszeiten"
        description="Zwei Zeitfenster pro Tag – für Betriebe mit Mittagspause. Wird ein Tag als geschlossen markiert, erscheint auf der Website „geschlossen“."
      >
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, dayIndex) => {
            const weekday = dayIndex + 1;
            const firstIndex = dayIndex * SLOTS_PER_DAY;

            return (
              <div
                key={weekday}
                className="border-border grid items-start gap-4 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[8rem_auto_1fr]"
              >
                <p className="pt-2 text-sm font-medium">{weekdayLabel(weekday)}</p>

                <div className="flex items-center gap-2.5 pt-2.5">
                  <Controller
                    control={form.control}
                    name={`openingHours.${firstIndex}.closed`}
                    render={({ field }) => (
                      <Checkbox
                        id={`closed-${weekday}`}
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => {
                          const isClosed = checked === true;
                          field.onChange(isClosed);
                          // Beide Zeitfenster eines Tages teilen sich den
                          // Status – sonst wäre "geschlossen" mehrdeutig.
                          form.setValue(
                            `openingHours.${firstIndex + 1}.closed`,
                            isClosed,
                          );
                        }}
                      />
                    )}
                  />
                  <Label
                    htmlFor={`closed-${weekday}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    geschlossen
                  </Label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: SLOTS_PER_DAY }, (_, slotIndex) => {
                    const index = firstIndex + slotIndex;
                    const slotErrors = errors.openingHours?.[index];

                    return (
                      <div key={slotIndex}>
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`${weekdayLabel(weekday)}, Zeitfenster ${slotIndex + 1}: Öffnung`}
                            placeholder="08:00"
                            className="tabular"
                            {...form.register(`openingHours.${index}.opensAt`)}
                          />
                          <span className="text-muted-foreground" aria-hidden="true">
                            –
                          </span>
                          <Input
                            aria-label={`${weekdayLabel(weekday)}, Zeitfenster ${slotIndex + 1}: Schließung`}
                            placeholder="12:00"
                            className="tabular"
                            {...form.register(`openingHours.${index}.closesAt`)}
                          />
                        </div>

                        {slotErrors?.closesAt?.message && (
                          <p className="text-destructive mt-1 text-xs" role="alert">
                            {slotErrors.closesAt.message}
                          </p>
                        )}
                        {slotErrors?.opensAt?.message && (
                          <p className="text-destructive mt-1 text-xs" role="alert">
                            {slotErrors.opensAt.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </AdminCard>

      {/* --- Social Media ------------------------------------------------- */}
      <AdminCard
        title="Social Media"
        description="Vollständige Adresse inklusive https:// eintragen. Leere Felder werden nicht angezeigt."
      >
        <div className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform, index) => (
            <div key={platform} className="flex items-start gap-3">
              <span className="bg-muted text-muted-foreground mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg">
                <SocialIcon platform={platform} className="size-4" />
              </span>

              <div className="flex-1">
                <Label htmlFor={`social-${platform}`} className="text-sm">
                  {SOCIAL_PLATFORM_LABELS[platform]}
                </Label>
                <Input
                  id={`social-${platform}`}
                  type="url"
                  inputMode="url"
                  placeholder={`https://www.${platform}.com/…`}
                  className="mt-1.5"
                  {...form.register(`socialLinks.${index}.url`)}
                />
                {errors.socialLinks?.[index]?.url?.message && (
                  <p className="text-destructive mt-1 text-xs" role="alert">
                    {errors.socialLinks[index]?.url?.message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title="Fahrzeugplattformen"
        description="Links zu Ihren offiziellen Händlerprofilen auf Fahrzeugbörsen."
      >
        <div className="space-y-4">
          {VEHICLE_PLATFORMS.map(({ field, label }) => (
            <FormField
              key={field}
              label={`${label} Händlerprofil URL`}
              htmlFor={`c-${field}`}
              error={errors[field]?.message}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="url"
                  inputMode="url"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  {...form.register(field)}
                />
              )}
            </FormField>
          ))}
        </div>
      </AdminCard>

      {/* Speichern-Leiste bleibt beim Scrollen erreichbar. */}
      <div className="bg-background/90 border-border sticky bottom-0 -mx-4 border-t px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <Button type="submit" variant="brand" size="2xl" disabled={submitting}>
          {submitting ? (
            <Loader2
              data-icon="inline-start"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Save data-icon="inline-start" aria-hidden="true" />
          )}
          {submitting ? "Wird gespeichert …" : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  );
}
