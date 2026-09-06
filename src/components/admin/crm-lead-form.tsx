"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createManualCrmLead } from "@/modules/crm/admin-actions";
import {
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_SOURCE_ORDER,
  CRM_LEAD_TYPE_LABELS,
  CRM_LEAD_TYPE_ORDER,
} from "@/modules/crm/labels";

/**
 * Lead von Hand erfassen – etwa nach einem Telefonat.
 *
 * Quelle ist als MANUAL vorbelegt, Status startet immer bei "Neu" (Vorgabe
 * des Datenmodells). Die Feldfehler kommen aus derselben serverseitigen
 * Prüfung wie bei den öffentlichen Formularen.
 */
const SELECT_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50";

export function CrmLeadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createManualCrmLead({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        type: String(form.get("type") ?? ""),
        source: String(form.get("source") ?? ""),
        message: String(form.get("message") ?? ""),
      });

      if (result.ok) {
        router.push(`/admin/crm/${result.data.id}`);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  };

  const fieldError = (name: string) => fieldErrors[name]?.[0];

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" error={fieldError("name")}>
          <Input id="name" name="name" autoComplete="off" disabled={pending} />
        </Field>

        <Field
          label="Telefon"
          name="phone"
          hint="Telefon oder E-Mail muss angegeben sein"
          error={fieldError("phone")}
        >
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            autoComplete="off"
            disabled={pending}
          />
        </Field>

        <Field label="E-Mail" name="email" error={fieldError("email")}>
          <Input
            id="email"
            name="email"
            inputMode="email"
            autoComplete="off"
            disabled={pending}
          />
        </Field>

        <Field label="Anliegen" name="type" error={fieldError("type")}>
          <select id="type" name="type" className={SELECT_CLASS} disabled={pending}>
            {CRM_LEAD_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {CRM_LEAD_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quelle" name="source" error={fieldError("source")}>
          <select
            id="source"
            name="source"
            defaultValue="MANUAL"
            className={SELECT_CLASS}
            disabled={pending}
          >
            {CRM_LEAD_SOURCE_ORDER.map((value) => (
              <option key={value} value={value}>
                {CRM_LEAD_SOURCE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notiz zum Anliegen" name="message" error={fieldError("message")}>
        <Textarea id="message" name="message" rows={4} disabled={pending} />
      </Field>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="brand" size="xl" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Lead anlegen
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}
