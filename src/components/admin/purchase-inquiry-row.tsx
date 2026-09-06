"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEuro, formatKilometers } from "@/lib/money";
import type { PurchaseInquiryStatus } from "@/generated/prisma/enums";
import { updatePurchaseInquiry } from "@/modules/purchase-inquiries/admin-actions";
import {
  PURCHASE_INQUIRY_CLOSED_STATUSES,
  PURCHASE_INQUIRY_STATUS_LABELS,
  PURCHASE_INQUIRY_STATUS_ORDER,
  purchaseInquirySourceLabel,
} from "@/modules/purchase-inquiries/labels";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/modules/vehicles/labels";
import type { FuelType, TransmissionType } from "@/modules/vehicles/types";

/**
 * Eine Ankaufanfrage im Admin: Kundenangaben lesen, Status setzen, Notiz
 * führen.
 *
 * Die Kundenangaben sind bewusst nicht editierbar – sie sind das, was der
 * Kunde geschrieben hat. Änderbar ist nur, wie AutoTal damit umgeht.
 */
export function PurchaseInquiryRow({
  inquiry,
}: {
  inquiry: {
    id: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    make: string;
    model: string;
    firstRegistrationYear: number;
    mileageKm: number;
    fuel: FuelType;
    transmission: TransmissionType;
    vin: string | null;
    priceExpectationCents: number | null;
    message: string;
    status: PurchaseInquiryStatus;
    source: string;
    internalNotes: string;
    createdAt: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PurchaseInquiryStatus>(inquiry.status);
  const [notes, setNotes] = useState(inquiry.internalNotes);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closed = PURCHASE_INQUIRY_CLOSED_STATUSES.includes(inquiry.status);
  const sourceLabel = purchaseInquirySourceLabel(inquiry.source);
  const dirty = status !== inquiry.status || notes !== inquiry.internalNotes;

  const save = () => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await updatePurchaseInquiry({
        id: inquiry.id,
        status,
        internalNotes: notes,
      });

      if (result.ok) {
        setFeedback(result.data.message);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <article
      className={`border-border bg-card rounded-xl border p-5 ${closed ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">
            {inquiry.make} {inquiry.model}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Erstzulassung {inquiry.firstRegistrationYear} ·{" "}
            {formatKilometers(inquiry.mileageKm)} ·{" "}
            {FUEL_LABELS[inquiry.fuel]} ·{" "}
            {TRANSMISSION_LABELS[inquiry.transmission]}
          </p>
        </div>

        <Badge variant={closed ? "secondary" : "default"}>
          {PURCHASE_INQUIRY_STATUS_LABELS[inquiry.status]}
        </Badge>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Kunde</dt>
          <dd className="mt-0.5 font-medium">{inquiry.customerName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefon</dt>
          <dd className="mt-0.5">
            <a
              href={`tel:${inquiry.customerPhone.replace(/[^\d+]/g, "")}`}
              className="tabular font-medium hover:underline"
            >
              {inquiry.customerPhone}
            </a>
          </dd>
        </div>
        {inquiry.customerEmail && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">E-Mail</dt>
            <dd className="mt-0.5">
              <a
                href={`mailto:${inquiry.customerEmail}`}
                className="font-medium break-all hover:underline"
              >
                {inquiry.customerEmail}
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Preisvorstellung</dt>
          <dd className="tabular mt-0.5 font-medium">
            {inquiry.priceExpectationCents !== null
              ? formatEuro(inquiry.priceExpectationCents)
              : "keine Angabe"}
          </dd>
        </div>
        {inquiry.vin && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Fahrgestellnummer</dt>
            <dd className="tabular mt-0.5 font-medium break-all">{inquiry.vin}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Eingegangen</dt>
          <dd className="tabular mt-0.5">{inquiry.createdAt}</dd>
        </div>
        {sourceLabel && (
          <div>
            <dt className="text-muted-foreground">Herkunft</dt>
            <dd className="mt-0.5">{sourceLabel}</dd>
          </div>
        )}
      </dl>

      {inquiry.message && (
        <div className="bg-muted/50 mt-4 rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-medium">
            Anmerkungen des Kunden
          </p>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">
            {inquiry.message}
          </p>
        </div>
      )}

      <div className="border-border mt-5 grid gap-4 border-t pt-5 sm:grid-cols-[13rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor={`status-${inquiry.id}`}>Bearbeitungsstand</Label>
          <select
            id={`status-${inquiry.id}`}
            value={status}
            disabled={pending}
            onChange={(event) =>
              setStatus(event.target.value as PurchaseInquiryStatus)
            }
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
          >
            {PURCHASE_INQUIRY_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {PURCHASE_INQUIRY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`notes-${inquiry.id}`}>Interne Notiz</Label>
          <Textarea
            id={`notes-${inquiry.id}`}
            value={notes}
            rows={2}
            disabled={pending}
            placeholder="Nur für das Team sichtbar"
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}
      {feedback && !dirty && (
        <p role="status" className="text-success mt-3 text-sm">
          {feedback}
        </p>
      )}

      <div className="mt-4 flex justify-end">
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
    </article>
  );
}
