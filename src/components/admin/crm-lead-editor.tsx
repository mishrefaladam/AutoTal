"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveCrmLead,
  deleteCrmLeadAction,
  updateCrmLead,
} from "@/modules/crm/admin-actions";
import {
  CRM_LEAD_STATUS_ORDER,
  crmStatusHint,
  crmStatusLabel,
} from "@/modules/crm/labels";
import type { CrmLeadStatus, CrmLeadType } from "@/generated/prisma/enums";

/**
 * Bearbeitung eines Leads: Status, interne Notiz, Kontakt dokumentieren,
 * archivieren und – aus dem Archiv heraus – endgültig löschen.
 *
 * Die Kundenangaben sind bewusst nicht editierbar – sie sind das, was der
 * Kunde geschrieben hat.
 *
 * Die Statusbezeichnungen richten sich nach dem Anliegen: Bei „Fahrzeug
 * verkaufen“ heißt der Abschluss „Angekauft“, bei „Fahrzeug kaufen“
 * „Verkauft“. „Gewonnen“ und „Verloren“ sagten in einem Autohaus niemandem
 * etwas.
 */
export function CrmLeadEditor({
  lead,
}: {
  lead: {
    id: string;
    status: CrmLeadStatus;
    type: CrmLeadType;
    internalNotes: string;
    archivedAt: Date | null;
    hasPurchaseInquiry: boolean;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CrmLeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.internalNotes);
  const [markContacted, setMarkContacted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const archived = lead.archivedAt !== null;

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

  /** Gemeinsamer Ablauf für Archivieren, Zurückholen und Löschen. */
  const run = (
    action: () => Promise<
      { ok: true; data: { message: string } } | { ok: false; error: string }
    >,
    onSuccess?: () => void,
  ) => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await action();

      if (result.ok) {
        setFeedback(result.data.message);
        onSuccess?.();
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
          <Label htmlFor="crm-status">Bearbeitungsstand</Label>
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
                {crmStatusLabel(value, lead.type)}
              </option>
            ))}
          </select>

          {/* Erklärt den gewählten Stand in einem Halbsatz. Eine Beschriftung
              allein beantwortet nicht, wann man sie setzt. */}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {crmStatusHint(status, lead.type)}
          </p>

          {lead.hasPurchaseInquiry && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              Dieser Stand gilt auch unter „Ankaufsanfragen“ – es ist derselbe
              Vorgang.
            </p>
          )}
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

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        {archived ? (
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={pending}
            onClick={() => run(() => archiveCrmLead(lead.id, false))}
          >
            <ArchiveRestore data-icon="inline-start" aria-hidden="true" />
            Aus dem Archiv holen
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={pending}
            onClick={() => run(() => archiveCrmLead(lead.id, true))}
          >
            <Archive data-icon="inline-start" aria-hidden="true" />
            Erledigt – ins Archiv
          </Button>
        )}

        <Button
          type="button"
          variant="brand"
          size="xl"
          className="ml-auto"
          disabled={!dirty || pending}
          onClick={save}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Speichern
        </Button>
      </div>

      {/*
        * Endgültiges Löschen gibt es nur im Archiv – und nur nach einer
        * Rückfrage, die benennt, was verschwindet. Es steht bewusst abgesetzt
        * unter den übrigen Schaltflächen, damit niemand es neben „Speichern“
        * trifft.
        */}
      {archived && (
        <div className="border-destructive/30 bg-destructive/5 mt-6 rounded-lg border p-4">
          {confirmingDelete ? (
            <>
              <p className="text-sm leading-relaxed font-medium">
                Diesen Eintrag endgültig löschen?
              </p>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                Gelöscht werden Name, Kontaktdaten, Anliegen und alle internen
                Notizen
                {lead.hasPurchaseInquiry
                  ? " – und mit ihnen die zugehörige Ankaufsanfrage samt Fahrzeugangaben."
                  : "."}{" "}
                Das lässt sich nicht rückgängig machen.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="xl"
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteCrmLeadAction(lead.id), () =>
                      router.push("/admin/crm?archiv=1"),
                    )
                  }
                >
                  {pending ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 data-icon="inline-start" aria-hidden="true" />
                  )}
                  Ja, endgültig löschen
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="xl"
                  disabled={pending}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Abbrechen
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Der Eintrag liegt im Archiv und zählt nirgends mehr mit. Wenn
                die Daten auch gelöscht werden sollen:
              </p>
              <Button
                type="button"
                variant="destructive"
                size="xl"
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Endgültig löschen
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
