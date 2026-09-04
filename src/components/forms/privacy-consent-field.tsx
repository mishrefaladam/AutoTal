"use client";

import Link from "next/link";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * Einwilligung in die Datenschutzerklärung.
 *
 * In Österreich/EU braucht es für die Verarbeitung der Kontaktdaten eine
 * aktive Zustimmung – ein vorangekreuztes Kästchen wäre unzulässig, deshalb
 * ist der Standardwert `false` und das Feld Pflicht.
 */
export function PrivacyConsentField<
  TFieldValues extends FieldValues,
  TContext = unknown,
  // Die Schemata transformieren einzelne Felder, deshalb unterscheiden sich
  // Formular- und Ergebnistyp. `Control` trägt beide – wird die dritte
  // Typvariable weggelassen, passt der übergebene Control nicht mehr.
  TTransformed extends FieldValues = TFieldValues,
>({
  control,
  name,
  error,
}: {
  control: Control<TFieldValues, TContext, TTransformed>;
  name: FieldPath<TFieldValues>;
  error?: string;
}) {
  const id = "privacy-consent";
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Checkbox
              id={id}
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="mt-0.5"
            />
          )}
        />

        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed">
          Ich stimme zu, dass meine Angaben zur Bearbeitung meiner Anfrage
          verarbeitet werden. Details in der{" "}
          <Link
            href="/datenschutz"
            className="text-brand-strong underline underline-offset-2"
          >
            Datenschutzerklärung
          </Link>
          .<span className="text-destructive ml-0.5">*</span>
        </label>
      </div>

      {error && (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
