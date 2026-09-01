"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  FormField,
  FormStatus,
  useActionForm,
} from "@/components/forms/form-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveFinanceProviders } from "@/modules/financing/actions";
import {
  financeProvidersSchema,
  type FinanceProvidersFormValues,
  type FinanceProvidersUpdate,
} from "@/modules/financing/schemas";

/**
 * Finanzierungspartner verwalten (US-13).
 *
 * Die Reihenfolge im Formular ist die Reihenfolge auf der Website. Deaktivierte
 * Partner bleiben erhalten, erscheinen aber nicht öffentlich – praktisch, wenn
 * eine Zusammenarbeit nur pausiert.
 */
export function FinanceProvidersForm({
  defaultValues,
}: {
  defaultValues: FinanceProvidersFormValues;
}) {
  const form = useForm<
    FinanceProvidersFormValues,
    unknown,
    FinanceProvidersUpdate
  >({
    resolver: zodResolver(financeProvidersSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "providers",
  });

  const { state, onSubmit } = useActionForm(form, saveFinanceProviders);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus state={state} />

      <AdminCard
        title="Finanzierungspartner"
        description="Diese Partner erscheinen auf der Finanzierungsseite. Die Reihenfolge hier bestimmt die Reihenfolge auf der Website."
        action={
          <Button
            type="button"
            variant="outline"
            size="xl"
            onClick={() =>
              append({
                name: "",
                description: "",
                logoUrl: "",
                websiteUrl: "",
                interestRateBp: "",
                active: true,
              })
            }
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Partner hinzufügen
          </Button>
        }
      >
        {fields.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-lg border border-dashed py-10 text-center text-sm">
            Noch keine Partner angelegt. Ohne Partner blendet die
            Finanzierungsseite den Abschnitt aus.
          </p>
        ) : (
          <div className="space-y-6">
            {fields.map((field, index) => {
              const providerErrors = errors.providers?.[index];

              return (
                <div
                  key={field.id}
                  className="border-border bg-muted/30 rounded-lg border p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Partner {index + 1}
                    </p>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2.5">
                        <Controller
                          control={form.control}
                          name={`providers.${index}.active`}
                          render={({ field: switchField }) => (
                            <Switch
                              id={`provider-active-${index}`}
                              checked={Boolean(switchField.value)}
                              onCheckedChange={switchField.onChange}
                            />
                          )}
                        />
                        <Label
                          htmlFor={`provider-active-${index}`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          sichtbar
                        </Label>
                      </div>

                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label={`Partner ${index + 1} entfernen`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {/* Bestehende Partner behalten ihre ID, damit sie nicht bei
                      jedem Speichern neu angelegt werden. */}
                  <input type="hidden" {...form.register(`providers.${index}.id`)} />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      label="Name"
                      htmlFor={`provider-name-${index}`}
                      required
                      error={providerErrors?.name?.message}
                    >
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          {...form.register(`providers.${index}.name`)}
                        />
                      )}
                    </FormField>

                    <FormField
                      label="Sollzinssatz p. a. (%)"
                      htmlFor={`provider-rate-${index}`}
                      error={providerErrors?.interestRateBp?.message}
                      description="Leer lassen, wenn kein Zinssatz genannt werden soll."
                    >
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          inputMode="decimal"
                          className="tabular"
                          placeholder="5,99"
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          {...form.register(`providers.${index}.interestRateBp`)}
                        />
                      )}
                    </FormField>

                    <FormField
                      label="Website"
                      htmlFor={`provider-url-${index}`}
                      error={providerErrors?.websiteUrl?.message}
                    >
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          type="url"
                          placeholder="https://…"
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          {...form.register(`providers.${index}.websiteUrl`)}
                        />
                      )}
                    </FormField>

                    <FormField
                      label="Logo-Adresse"
                      htmlFor={`provider-logo-${index}`}
                      error={providerErrors?.logoUrl?.message}
                      description="Der Hostname muss zusätzlich in next.config.ts freigegeben sein."
                    >
                      {({ id, describedBy, invalid }) => (
                        <Input
                          id={id}
                          type="url"
                          placeholder="https://…"
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          {...form.register(`providers.${index}.logoUrl`)}
                        />
                      )}
                    </FormField>
                  </div>

                  <div className="mt-5">
                    <FormField
                      label="Beschreibung"
                      htmlFor={`provider-desc-${index}`}
                      error={providerErrors?.description?.message}
                    >
                      {({ id, describedBy, invalid }) => (
                        <Textarea
                          id={id}
                          rows={3}
                          aria-invalid={invalid}
                          aria-describedby={describedBy}
                          {...form.register(`providers.${index}.description`)}
                        />
                      )}
                    </FormField>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

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
        {submitting ? "Wird gespeichert …" : "Partner speichern"}
      </Button>
    </form>
  );
}
