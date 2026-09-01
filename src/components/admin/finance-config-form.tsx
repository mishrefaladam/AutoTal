"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Info, Loader2, Save } from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  FormField,
  FormStatus,
  useActionForm,
} from "@/components/forms/form-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveFinanceConfig } from "@/modules/financing/actions";
import {
  financeConfigSchema,
  type FinanceConfigFormValues,
  type FinanceConfigUpdate,
} from "@/modules/financing/schemas";

/**
 * Finanzierungsparameter verwalten (US-17).
 *
 * Alle Prozentangaben werden hier in Prozent eingegeben und intern in
 * Basispunkten gespeichert. Die Standardwerte sind das, was der Rechner beim
 * Laden anzeigt; Mindest- und Höchstwerte begrenzen die Regler.
 */
export function FinanceConfigForm({
  defaultValues,
}: {
  defaultValues: FinanceConfigFormValues;
}) {
  const form = useForm<FinanceConfigFormValues, unknown, FinanceConfigUpdate>({
    resolver: zodResolver(financeConfigSchema),
    defaultValues,
  });

  const { state, onSubmit } = useActionForm(form, saveFinanceConfig);
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;

  const triples = [
    {
      title: "Sollzinssatz p. a.",
      unit: "%",
      fields: [
        { key: "minInterestRateBp", label: "Minimum" },
        { key: "defaultInterestRateBp", label: "Standard" },
        { key: "maxInterestRateBp", label: "Maximum" },
      ],
    },
    {
      title: "Laufzeit",
      unit: "Monate",
      fields: [
        { key: "minTermMonths", label: "Minimum" },
        { key: "defaultTermMonths", label: "Standard" },
        { key: "maxTermMonths", label: "Maximum" },
      ],
    },
    {
      title: "Anzahlung",
      unit: "% des Kaufpreises",
      fields: [
        { key: "minDownPaymentBp", label: "Minimum" },
        { key: "defaultDownPaymentBp", label: "Standard" },
        { key: "maxDownPaymentBp", label: "Maximum" },
      ],
    },
    {
      title: "Schlussrate",
      unit: "% des Kaufpreises",
      fields: [
        { key: "minBalloonBp", label: "Minimum" },
        { key: "defaultBalloonBp", label: "Standard" },
        { key: "maxBalloonBp", label: "Maximum" },
      ],
    },
  ] as const;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus state={state} />

      <AdminCard
        title="Rechnerparameter"
        description="Der Standardwert ist voreingestellt, wenn jemand den Rechner öffnet. Minimum und Maximum begrenzen, wie weit die Regler bewegt werden können."
      >
        <div className="space-y-7">
          {triples.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-3 text-sm font-semibold">
                {group.title}{" "}
                <span className="text-muted-foreground font-normal">
                  ({group.unit})
                </span>
              </legend>

              <div className="grid gap-4 sm:grid-cols-3">
                {group.fields.map((field) => (
                  <FormField
                    key={field.key}
                    label={field.label}
                    htmlFor={`fin-${field.key}`}
                    required
                    error={errors[field.key]?.message}
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        className="tabular"
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        {...form.register(field.key)}
                      />
                    )}
                  </FormField>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title="Rechtshinweis"
        description="Dieser Text steht unter jedem Rechner. Er stellt klar, dass es sich um eine unverbindliche Beispielrechnung handelt und nicht um eine Kreditzusage."
      >
        <FormField
          label="Hinweistext"
          htmlFor="fin-disclaimer"
          required
          error={errors.disclaimer?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={5}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...form.register("disclaimer")}
            />
          )}
        </FormField>

        <p className="text-muted-foreground bg-muted/60 mt-4 flex gap-2.5 rounded-lg p-3.5 text-xs leading-relaxed">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Dieser Hinweis ist rechtlich erforderlich und lässt sich nicht
            leeren. Der Rechner darf zu keinem Zeitpunkt wie ein verbindliches
            Kreditangebot wirken.
          </span>
        </p>
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
        {submitting ? "Wird gespeichert …" : "Parameter speichern"}
      </Button>
    </form>
  );
}
