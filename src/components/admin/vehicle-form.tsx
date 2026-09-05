"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  FormField,
  FormStatus,
  useActionForm,
} from "@/components/forms/form-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createVehicle, updateVehicle } from "@/modules/vehicles/admin-actions";
import {
  vehicleFormSchema,
  type VehicleFormInput,
  type VehicleFormValues,
} from "@/modules/vehicles/admin-schemas";
import {
  BODY_TYPE_LABELS,
  BODY_TYPE_ORDER,
  CONDITION_LABELS,
  FUEL_LABELS,
  FUEL_ORDER,
  TRANSMISSION_LABELS,
  TRANSMISSION_ORDER,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_ORDER,
} from "@/modules/vehicles/labels";

/**
 * Formular zum Anlegen und Bearbeiten eines Fahrzeugs.
 *
 * Die Feldreihenfolge folgt dem Zulassungsschein und einem typischen
 * Inserat – so lässt sich beim Abtippen von oben nach unten durcharbeiten.
 */

const CONDITION_ORDER = ["USED", "NEW", "DEMO", "ANNUAL_CAR"] as const;

export function VehicleForm({
  mode,
  vehicleId,
  defaultValues,
}: {
  mode: "create" | "edit";
  vehicleId?: string;
  defaultValues: VehicleFormValues;
}) {
  const router = useRouter();

  const form = useForm<VehicleFormValues, unknown, VehicleFormInput>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues,
  });

  const { state, onSubmit } = useActionForm(form, async (values) => {
    if (mode === "create") {
      const result = await createVehicle(values);
      if (result.ok) {
        // Direkt zur Bearbeitung, damit Bilder ergänzt werden können.
        router.push(`/admin/fahrzeuge/${result.data.id}`);
        router.refresh();
      }
      return result;
    }

    const result = await updateVehicle({ id: vehicleId, values });
    if (result.ok) router.refresh();
    return result;
  });

  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus state={state} />

      {/* --- Fahrzeug ----------------------------------------------------- */}
      <AdminCard title="Fahrzeug">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Marke" htmlFor="v-make" required error={errors.make?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Volkswagen"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("make")}
              />
            )}
          </FormField>

          <FormField label="Modell" htmlFor="v-model" required error={errors.model?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Golf"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("model")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5">
          <FormField
            label="Variante"
            htmlFor="v-variant"
            error={errors.variant?.message}
            description="Motorisierung und Ausstattungslinie, z. B. „2.0 TDI Life DSG“."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("variant")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <FormField
            label="Preis (€)"
            htmlFor="v-price"
            required
            error={errors.priceEuro?.message}
            description="Ganze Euro, ohne Cent."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="tabular"
                placeholder="22900"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("priceEuro")}
              />
            )}
          </FormField>

          <FormField
            label="Kilometerstand"
            htmlFor="v-mileage"
            required
            error={errors.mileageKm?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="tabular"
                placeholder="78500"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("mileageKm")}
              />
            )}
          </FormField>
        </div>

        <div className="mt-5 flex items-start gap-3">
          <Controller
            control={form.control}
            name="vatDeductible"
            render={({ field }) => (
              <Checkbox
                id="v-vat"
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                className="mt-0.5"
              />
            )}
          />
          <Label htmlFor="v-vat" className="cursor-pointer text-sm font-normal">
            Nettopreis, vorsteuerabzugsberechtigt
            <span className="text-muted-foreground block text-xs">
              Auf der Website erscheint dann „netto, zzgl. 20 % USt.“ statt
              „inkl. USt.“.
            </span>
          </Label>
        </div>
      </AdminCard>

      {/* --- Technik ------------------------------------------------------ */}
      <AdminCard title="Technische Daten">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Erstzulassung"
            htmlFor="v-firstreg"
            error={errors.firstRegistration?.message}
            description="Monat und Jahr laut Zulassungsschein."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="month"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("firstRegistration")}
              />
            )}
          </FormField>

          <FormField
            label="§57a-Begutachtung gültig bis"
            htmlFor="v-inspection"
            error={errors.inspectionValidUntil?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="date"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("inspectionValidUntil")}
              />
            )}
          </FormField>

          <SelectField
            label="Kraftstoff"
            id="v-fuel"
            error={errors.fuel?.message}
            control={form.control}
            name="fuel"
            options={FUEL_ORDER.map((value) => ({ value, label: FUEL_LABELS[value] }))}
          />

          <SelectField
            label="Getriebe"
            id="v-transmission"
            error={errors.transmission?.message}
            control={form.control}
            name="transmission"
            options={TRANSMISSION_ORDER.map((value) => ({
              value,
              label: TRANSMISSION_LABELS[value],
            }))}
          />

          <SelectField
            label="Aufbau"
            id="v-body"
            error={errors.bodyType?.message}
            control={form.control}
            name="bodyType"
            options={BODY_TYPE_ORDER.map((value) => ({
              value,
              label: BODY_TYPE_LABELS[value],
            }))}
          />

          <SelectField
            label="Fahrzeugart"
            id="v-condition"
            error={errors.condition?.message}
            control={form.control}
            name="condition"
            options={CONDITION_ORDER.map((value) => ({
              value,
              label: CONDITION_LABELS[value],
            }))}
          />

          <SelectField
            label="Status"
            id="v-status"
            error={errors.status?.message}
            control={form.control}
            name="status"
            options={VEHICLE_STATUS_ORDER.map((value) => ({
              value,
              label: VEHICLE_STATUS_LABELS[value],
            }))}
          />

          <FormField label="Leistung (kW)" htmlFor="v-power" error={errors.powerKw?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="tabular"
                placeholder="110"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("powerKw")}
              />
            )}
          </FormField>

          <FormField
            label="Hubraum (cm³)"
            htmlFor="v-displacement"
            error={errors.displacementCcm?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="tabular"
                placeholder="1968"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("displacementCcm")}
              />
            )}
          </FormField>

          <FormField label="Farbe" htmlFor="v-color" error={errors.color?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                placeholder="Urangrau Metallic"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("color")}
              />
            )}
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Türen" htmlFor="v-doors" error={errors.doors?.message}>
              {({ id, invalid }) => (
                <Input id={id} inputMode="numeric" className="tabular" aria-invalid={invalid} {...form.register("doors")} />
              )}
            </FormField>
            <FormField label="Sitze" htmlFor="v-seats" error={errors.seats?.message}>
              {({ id, invalid }) => (
                <Input id={id} inputMode="numeric" className="tabular" aria-invalid={invalid} {...form.register("seats")} />
              )}
            </FormField>
            <FormField
              label="Vorbesitzer"
              htmlFor="v-owners"
              error={errors.previousOwners?.message}
            >
              {({ id, invalid }) => (
                <Input id={id} inputMode="numeric" className="tabular" aria-invalid={invalid} {...form.register("previousOwners")} />
              )}
            </FormField>
          </div>
        </div>
      </AdminCard>

      {/* --- Text --------------------------------------------------------- */}
      <AdminCard title="Beschreibung und Ausstattung">
        <div className="space-y-5">
          <FormField
            label="Beschreibung"
            htmlFor="v-description"
            error={errors.description?.message}
            description="Fließtext als Grundlage für Social-Media-Texte. Absätze durch eine Leerzeile trennen."
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={8}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("description")}
              />
            )}
          </FormField>

          <FormField
            label="Interne Notiz"
            htmlFor="v-internal-notes"
            error={errors.internalNotes?.message}
            description="Nur im Admin sichtbar – erscheint nirgends auf der Website."
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={3}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("internalNotes")}
              />
            )}
          </FormField>

          <FormField
            label="Ausstattung"
            htmlFor="v-features"
            error={errors.features?.message}
            description="Ein Merkmal pro Zeile – so lässt sich eine Liste aus dem Inserat direkt hineinkopieren."
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={10}
                placeholder={"Navigationssystem\nRückfahrkamera\nSitzheizung vorne"}
                className="font-mono text-sm"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...form.register("features")}
              />
            )}
          </FormField>
        </div>
      </AdminCard>

      {/* --- Sichtbarkeit -------------------------------------------------- */}
      <AdminCard title="Sichtbarkeit">
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Checkbox
                id="v-active"
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                className="mt-0.5"
              />
            )}
          />
          <Label htmlFor="v-active" className="cursor-pointer text-sm font-normal">
            Auf der Website anzeigen
            <span className="text-muted-foreground block text-xs">
              Ausgeschaltet verschwindet das Fahrzeug aus Übersicht und Sitemap,
              der Datensatz bleibt aber erhalten – so lassen sich verkaufte
              Fahrzeuge sauber offline nehmen.
            </span>
          </Label>
        </div>
      </AdminCard>

      <div className="bg-background/90 border-border sticky bottom-0 -mx-4 border-t px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <Button type="submit" variant="brand" size="2xl" disabled={submitting}>
          {submitting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          ) : (
            <Save data-icon="inline-start" aria-hidden="true" />
          )}
          {submitting
            ? "Wird gespeichert …"
            : mode === "create"
              ? "Fahrzeug anlegen"
              : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  );
}

/** Auswahlliste, verdrahtet mit react-hook-form. */
function SelectField({
  label,
  id,
  error,
  control,
  name,
  options,
}: {
  label: string;
  id: string;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Controller ist über alle Feldnamen generisch.
  control: any;
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FormField label={label} htmlFor={id} required error={error}>
      {({ invalid }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
                <SelectValue placeholder="Bitte wählen" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </FormField>
  );
}
