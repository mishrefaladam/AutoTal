"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  Check,
  CircleCheck,
  ExternalLink,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatEuro } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  approveDraft,
  deleteDraft,
  generateCaption,
  publishDraft,
  retryPublish,
  revokeApproval,
  updateDraft,
} from "@/modules/social/actions";
import type { SocialDraftListItem } from "@/modules/social/repository";
import { formatDateTime } from "@/modules/vehicles/labels";

/**
 * Beitragsassistent (EPIC 7, EPIC 8).
 *
 * Der Ablauf ist bewusst als Kette sichtbarer Schritte gebaut – Fahrzeug
 * wählen, generieren, bearbeiten, freigeben, veröffentlichen. Nichts davon
 * passiert automatisch: Der Freigabeknopf ist ein eigener, ausdrücklicher
 * Klick, und erst danach erscheint der Veröffentlichen-Knopf.
 */

type VehicleOption = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string | null;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

const STATUS_STYLES: Record<
  SocialDraftListItem["status"],
  { label: string; className: string }
> = {
  DRAFT: { label: "Entwurf", className: "bg-muted text-muted-foreground" },
  APPROVED: {
    label: "Freigegeben",
    className: "bg-brand-subtle text-brand-strong",
  },
  PUBLISHED: {
    label: "Veröffentlicht",
    className: "bg-success/12 text-success",
  },
  FAILED: {
    label: "Fehlgeschlagen",
    className: "bg-destructive/12 text-destructive",
  },
};

export function SocialMediaManager({
  vehicles,
  drafts,
  openAiConfigured,
  instagramConnected,
}: {
  vehicles: VehicleOption[];
  drafts: SocialDraftListItem[];
  openAiConfigured: boolean;
  instagramConnected: boolean;
}) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    vehicles[0]?.id ?? "",
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  function handleGenerate() {
    if (!selectedVehicleId) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await generateCaption({ vehicleId: selectedVehicleId });
      setFeedback(
        result.ok
          ? { kind: "success", message: result.data.message }
          : { kind: "error", message: result.error },
      );
    });
  }

  return (
    <div className="space-y-8">
      {feedback && <FeedbackBanner feedback={feedback} />}

      {/* --- Schritt 1: Fahrzeug wählen und generieren ------------------- */}
      <AdminCard
        title="Neuen Beitrag erstellen"
        description="Wählen Sie ein Fahrzeug aus dem Bestand. Die KI erstellt daraus einen Textvorschlag – veröffentlicht wird nichts automatisch."
      >
        {!openAiConfigured && (
          <div className="border-border bg-muted/60 mb-5 flex gap-3 rounded-lg border p-4 text-sm">
            <TriangleAlert
              className="text-warning mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Die KI-Funktion ist nicht eingerichtet. Hinterlegen Sie{" "}
              <code className="bg-background rounded px-1 py-0.5 text-xs">
                OPENAI_API_KEY
              </code>{" "}
              in den Umgebungsvariablen, um Textvorschläge zu erzeugen.
            </p>
          </div>
        )}

        {vehicles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Es sind keine aktiven Fahrzeuge im Bestand. Führen Sie zuerst eine
            Fahrzeugsynchronisierung durch.
          </p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="social-vehicle">Fahrzeug</Label>
              <Select
                value={selectedVehicleId}
                onValueChange={setSelectedVehicleId}
              >
                <SelectTrigger id="social-vehicle" className="w-full">
                  <SelectValue placeholder="Fahrzeug wählen" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.title} · {formatEuro(vehicle.priceCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="brand"
              size="2xl"
              onClick={handleGenerate}
              disabled={pending || !openAiConfigured || !selectedVehicleId}
            >
              {pending ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles data-icon="inline-start" aria-hidden="true" />
              )}
              {pending ? "Wird erstellt …" : "Text erstellen"}
            </Button>
          </div>
        )}

        {selectedVehicle?.imageUrl && (
          <div className="mt-5 flex items-center gap-4">
            <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={selectedVehicle.imageUrl}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
            <div className="text-sm">
              <p className="font-medium">{selectedVehicle.title}</p>
              <p className="text-muted-foreground tabular">
                {formatEuro(selectedVehicle.priceCents)}
              </p>
            </div>
          </div>
        )}
      </AdminCard>

      {/* --- Entwürfe ---------------------------------------------------- */}
      <section>
        <h2 className="font-display mb-4 text-lg font-bold tracking-tight">
          Beiträge
        </h2>

        {drafts.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed py-14 text-center text-sm">
            Noch keine Beiträge. Erstellen Sie oben Ihren ersten Textvorschlag.
          </p>
        ) : (
          <ul className="space-y-5">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <DraftCard
                  draft={draft}
                  instagramConnected={instagramConnected}
                  onFeedback={setFeedback}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: NonNullable<Feedback> }) {
  const success = feedback.kind === "success";

  return (
    <div
      role={success ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm leading-relaxed",
        success
          ? "border-success/30 bg-success/8"
          : "border-destructive/30 bg-destructive/8",
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
      <p>{feedback.message}</p>
    </div>
  );
}

function DraftCard({
  draft,
  instagramConnected,
  onFeedback,
}: {
  draft: SocialDraftListItem;
  instagramConnected: boolean;
  onFeedback: (feedback: Feedback) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(draft.caption);
  const [hashtags, setHashtags] = useState(draft.hashtags.join(" "));
  const [pending, startTransition] = useTransition();

  const status = STATUS_STYLES[draft.status];
  const published = draft.status === "PUBLISHED";

  function run(
    action: () => Promise<
      { ok: true; data: { message: string } } | { ok: false; error: string }
    >,
    onSuccess?: () => void,
  ) {
    onFeedback(null);
    startTransition(async () => {
      const result = await action();

      if (result.ok) {
        onFeedback({ kind: "success", message: result.data.message });
        onSuccess?.();
      } else {
        onFeedback({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <article className="border-border bg-background rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-4">
          {draft.vehicle.primaryImageUrl && (
            <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={draft.vehicle.primaryImageUrl}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
          )}

          <div className="min-w-0">
            <h3 className="truncate font-semibold">{draft.vehicle.title}</h3>
            <p className="text-muted-foreground tabular mt-0.5 text-sm">
              {formatEuro(draft.vehicle.priceCents)}
              {!draft.vehicle.active && (
                <span className="text-warning ml-2">
                  · Fahrzeug nicht mehr im Bestand
                </span>
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Erstellt {formatDateTime(draft.createdAt)}
              {draft.generatedByModel && ` · ${draft.generatedByModel}`}
            </p>
          </div>
        </div>

        <Badge className={cn("shrink-0 border-transparent", status.className)}>
          {status.label}
        </Badge>
      </div>

      {/* Fehlermeldung (US-24) */}
      {draft.status === "FAILED" && draft.errorMessage && (
        <div className="border-destructive/30 bg-destructive/8 mt-4 flex gap-3 rounded-lg border p-3.5 text-sm">
          <TriangleAlert
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="leading-relaxed">{draft.errorMessage}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {draft.retryCount === 1
                ? "1 Versuch"
                : `${draft.retryCount} Versuche`}
              {draft.lastAttemptAt &&
                ` · zuletzt ${formatDateTime(draft.lastAttemptAt)}`}
            </p>
          </div>
        </div>
      )}

      {/* Text */}
      <div className="mt-4">
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`caption-${draft.id}`}>Beitragstext</Label>
              <Textarea
                id={`caption-${draft.id}`}
                rows={8}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {caption.length} von 2.000 Zeichen
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`hashtags-${draft.id}`}>Hashtags</Label>
              <Textarea
                id={`hashtags-${draft.id}`}
                rows={2}
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="gebrauchtwagen autohaus wels"
              />
              <p className="text-muted-foreground text-xs">
                Durch Leerzeichen getrennt, ohne Rautezeichen.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="brand"
                size="xl"
                disabled={pending}
                onClick={() =>
                  run(
                    () => updateDraft({ draftId: draft.id, caption, hashtags }),
                    () => setEditing(false),
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
                  <Check data-icon="inline-start" aria-hidden="true" />
                )}
                Änderungen übernehmen
              </Button>

              <Button
                variant="ghost"
                size="xl"
                disabled={pending}
                onClick={() => {
                  setCaption(draft.caption);
                  setHashtags(draft.hashtags.join(" "));
                  setEditing(false);
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="bg-muted/40 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {draft.caption}
            </p>

            {draft.hashtags.length > 0 && (
              <p className="text-brand-strong mt-2.5 text-sm">
                {draft.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            )}
          </>
        )}
      </div>

      {/* Aktionen */}
      {!editing && (
        <div className="border-border mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          {!published && (
            <Button
              variant="outline"
              size="xl"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <Pencil data-icon="inline-start" aria-hidden="true" />
              Bearbeiten
            </Button>
          )}

          {/* US-21: Freigabe ist ein eigener, ausdrücklicher Schritt. */}
          {draft.status === "DRAFT" && (
            <Button
              variant="brand"
              size="xl"
              disabled={pending}
              onClick={() => run(() => approveDraft(draft.id))}
            >
              <Check data-icon="inline-start" aria-hidden="true" />
              Text freigeben
            </Button>
          )}

          {draft.status === "APPROVED" && (
            <>
              <Button
                variant="brand"
                size="xl"
                disabled={pending || !instagramConnected}
                title={
                  instagramConnected
                    ? undefined
                    : "Bitte zuerst unter „Integrationen“ ein Instagram-Konto verbinden."
                }
                onClick={() => run(() => publishDraft(draft.id))}
              >
                {pending ? (
                  <Loader2
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send data-icon="inline-start" aria-hidden="true" />
                )}
                Auf Instagram veröffentlichen
              </Button>

              <Button
                variant="ghost"
                size="xl"
                disabled={pending}
                onClick={() => run(() => revokeApproval(draft.id))}
              >
                <Undo2 data-icon="inline-start" aria-hidden="true" />
                Freigabe zurücknehmen
              </Button>
            </>
          )}

          {/* US-24: erneuter Versuch nach Fehlschlag */}
          {draft.status === "FAILED" && (
            <Button
              variant="brand"
              size="xl"
              disabled={pending || !instagramConnected}
              onClick={() => run(() => retryPublish(draft.id))}
            >
              {pending ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
              )}
              Erneut versuchen
            </Button>
          )}

          {published && draft.externalPermalink && (
            <Button asChild variant="outline" size="xl">
              <a
                href={draft.externalPermalink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                Auf Instagram ansehen
              </a>
            </Button>
          )}

          <Button
            variant="destructive"
            size="xl"
            className="ml-auto"
            disabled={pending}
            onClick={() => run(() => deleteDraft(draft.id))}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Löschen
          </Button>
        </div>
      )}

      {published && draft.publishedAt && (
        <p className="text-muted-foreground mt-3 text-xs">
          Veröffentlicht am {formatDateTime(draft.publishedAt)}
          {draft.approvedByUser && ` · freigegeben von ${draft.approvedByUser}`}
        </p>
      )}
    </article>
  );
}
