"use client";

import { useId, useState } from "react";
import type {
  FieldValues,
  Path,
  UseFormReturn,
} from "react-hook-form";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/result";

/**
 * Schlanke Formularbausteine auf Basis von react-hook-form.
 *
 * Bewusst handgeschrieben statt shadcn/ui-Form: Es werden nur Label,
 * Fehlermeldung und Beschreibung benötigt, dafür aber sauber verdrahtet –
 * `aria-describedby`, `aria-invalid` und die Fokussierung des ersten
 * fehlerhaften Felds.
 */

export function FormField({
  label,
  htmlFor,
  error,
  description,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  const descriptionId = `${htmlFor}-description`;

  const describedBy =
    [error ? errorId : null, description ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
        {!required && (
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            (optional)
          </span>
        )}
      </Label>

      {children({ id: htmlFor, describedBy, invalid: Boolean(error) })}

      {description && (
        <p id={descriptionId} className="text-muted-foreground text-xs">
          {description}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Unsichtbares Honigtopf-Feld gegen Bots.
 *
 * Nicht `display:none` – manche Bots ignorieren solche Felder gezielt.
 * Stattdessen aus dem sichtbaren Bereich geschoben und für Screenreader sowie
 * die Tab-Reihenfolge ausgeblendet.
 */
export function HoneypotField({
  register,
}: {
  register: ReturnType<UseFormReturn<never>["register"]>;
}) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website-hp">Bitte dieses Feld leer lassen</label>
      <input
        id="website-hp"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        {...register}
      />
    </div>
  );
}

export type SubmissionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/**
 * Verbindet ein react-hook-form mit einer Server Action.
 *
 * Feldbezogene Serverfehler landen an den passenden Feldern, alles andere in
 * einer Statusmeldung über dem Formular. Nach Erfolg wird das Formular
 * zurückgesetzt, damit niemand versehentlich zweimal absendet.
 */
export function useActionForm<
  TFieldValues extends FieldValues,
  TTransformed extends FieldValues,
>(
  form: UseFormReturn<TFieldValues, unknown, TTransformed>,
  action: (values: unknown) => Promise<ActionResult<{ message: string }>>,
) {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  const onSubmit = form.handleSubmit(async (_transformed, event) => {
    setState({ status: "idle" });

    // WICHTIG: An die Server Action gehen die ROHWERTE des Formulars, nicht
    // die von Zod bereits transformierten.
    //
    // Die Action validiert mit demselben Schema noch einmal von vorn – sie
    // darf der Prüfung im Browser nicht vertrauen. Bekäme sie die
    // transformierte Fassung, liefe sie ins Leere: Ein Feld wie
    // `priceEuro: z.string().transform(Number)` erwartet beim zweiten
    // Durchlauf wieder einen String, bekäme aber eine Zahl – und die
    // Validierung schlüge stillschweigend fehl.
    const values = form.getValues();

    // Der Honigtopf wird direkt aus dem DOM gelesen, nicht aus dem
    // Formularzustand: Ein Bot, der den Wert per JavaScript setzt, ohne ein
    // Input-Ereignis auszulösen, bliebe react-hook-form sonst verborgen –
    // und der Honigtopf wäre wirkungslos.
    const formElement = event?.target as HTMLFormElement | undefined;
    const honeypot = formElement?.elements.namedItem("website");
    const payload =
      honeypot instanceof HTMLInputElement && honeypot.value
        ? { ...values, website: honeypot.value }
        : values;

    let result: ActionResult<{ message: string }>;

    try {
      result = await action(payload);
    } catch {
      // Netzwerkabbruch oder Serverabsturz – die Action selbst fängt alles
      // andere bereits ab.
      setState({
        status: "error",
        message:
          "Die Verbindung zum Server ist abgebrochen. Bitte prüfen Sie Ihre " +
          "Internetverbindung und versuchen Sie es erneut.",
      });
      return;
    }

    if (result.ok) {
      form.reset();
      setState({ status: "success", message: result.data.message });
      return;
    }

    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (messages[0]) {
          form.setError(field as Path<TFieldValues>, {
            type: "server",
            message: messages[0],
          });
        }
      }
    }

    setState({ status: "error", message: result.error });
  });

  return { state, onSubmit, reset: () => setState({ status: "idle" }) };
}

/** Erfolgs- bzw. Fehlermeldung über dem Formular. */
export function FormStatus({ state }: { state: SubmissionState }) {
  const id = useId();

  if (state.status === "idle") return null;

  const success = state.status === "success";

  return (
    <div
      id={id}
      role={success ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm leading-relaxed",
        success
          ? "border-success/30 bg-success/8 text-foreground"
          : "border-destructive/30 bg-destructive/8 text-foreground",
      )}
    >
      {success ? (
        <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <TriangleAlert
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <p>{state.message}</p>
    </div>
  );
}

/** Pflichtfeld-Hinweis und Datenschutzverweis am Formularende. */
export function FormFootnote() {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      Mit <span className="text-destructive">*</span> gekennzeichnete Felder sind
      Pflichtfelder. Ihre Daten verwenden wir ausschließlich zur Bearbeitung
      Ihrer Anfrage.
    </p>
  );
}
