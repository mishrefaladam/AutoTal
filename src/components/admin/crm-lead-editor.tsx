"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCrmLead } from "@/modules/crm/admin-actions";
import {
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_STATUS_ORDER,
} from "@/modules/crm/labels";
import type { CrmLeadStatus } from "@/generated/prisma/enums";

/**
 * Bearbeitung eines Leads: Status, interne Notiz, Kontakt dokumentieren.
 *
 * Die Kundenangaben sind bewusst nicht editierbar – sie sind das, was der
 * Kunde geschrieben hat.
 */
export function CrmLeadEditor({
  lead,
}: {
  lead: {
    id: string;
    status: CrmLeadStatus;
    internalNotes: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CrmLeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.internalNotes);
  const [markContacted, setMarkContacted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    status !== lead.status || notes !== lead.internalNotes || markContacted;

  const save = () => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await updateCrmLead({
        id: lead.id,
        status,
        internalNotes: notes,
        markContacted,
      });

      if (result.ok) {
        setFeedback(result.data.message);
        setMarkContacted(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="crm-status">Status</Label>
          <select
            id="crm-status"
            value={status}
            disabled={pending}
            onChange={(event) =>
              setStatus(event.target.value as CrmLeadStatus)
            }
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
          >
            {CRM_LEAD_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {CRM_LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="crm-notes">Interne Notiz</Label>
          <Textarea
            id="crm-notes"
            value={notes}
            rows={4}
            disabled={pending}
            placeholder="Nur für das Team sichtbar"
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={markContacted}
          disabled={pending}
          onChange={(event) => setMarkContacted(event.target.checked)}
          className="border-input size-4 rounded"
        />
        Kontakt jetzt dokumentieren
      </label>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {feedback && !dirty && (
        <p role="status" className="text-success text-sm">
          {feedback}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="brand"
          size="xl"
          disabled={!dirty || pending}
          onClick={save}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
