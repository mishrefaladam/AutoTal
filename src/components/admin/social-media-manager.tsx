"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Check,
  CircleCheck,
  ExternalLink,
  ImageOff,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { VehicleFilterBar } from "@/components/admin/vehicle-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEuro, formatKilometers } from "@/lib/money";
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
import type { VehicleFilterOptions } from "@/modules/vehicles/admin-repository";
import {
  hasActiveVehicleFilters,
  type VehicleFilters,
} from "@/modules/vehicles/filters";
import {
  VEHICLE_STATUS_LABELS,
  formatDateTime,
  formatMonthYear,
} from "@/modules/vehicles/labels";
import type { VehicleStatus } from "@/generated/prisma/enums";

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
  /** null = kein Preis hinterlegt. Es wird dann keiner angezeigt, keine 0. */
  priceCents: number | null;
  imageUrl: string | null;
  active: boolean;
  status: VehicleStatus;
  firstRegistration: Date | null;
  mileageKm: number;
  stockNumber: string | null;
};

/**
 * Ein Fahrzeug ohne Bild ist kein Fehler, sondern ein Zwischenstand: Der Text
 * lässt sich erzeugen und freigeben, nur die Veröffentlichung wartet auf das
 * Bild. Der Satz steht deshalb wörtlich an jeder Stelle gleich – beim
 * ausgewählten Fahrzeug und am fertigen Entwurf.
 */
const MISSING_IMAGE_NOTICE =
  "Bild fehlt – Text kann erstellt werden, Veröffentlichung auf Instagram " +
  "erst nach Bild-Upload möglich.";

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
  totalVehicleCount,
  filters,
  filterOptions,
  defaultStatus,
  drafts,
  openAiConfigured,
  deploymentEnvironment,
  instagramConnected,
}: {
  /** Fahrzeuge nach den aktuellen Filtern – Auswahl für den Textentwurf. */
  vehicles: VehicleOption[];
  /** Alle erfassten Fahrzeuge, auch verkaufte. Nur für den leeren Zustand. */
  totalVehicleCount: number;
  /** Aktive Filter, aus der Adresse gelesen – siehe modules/vehicles/filters. */
  filters: VehicleFilters;
  filterOptions: VehicleFilterOptions;
  defaultStatus: VehicleStatus;
  drafts: SocialDraftListItem[];
  openAiConfigured: boolean;
  deploymentEnvironment: string | null;
  instagramConnected: boolean;
}) {
  const [chosenVehicleId, setChosenVehicleId] = useState<string>(
    vehicles[0]?.id ?? "",
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  // Ändert ein Filter die Liste, bleibt die Wahl nur bestehen, wenn das
  // Fahrzeug noch dabei ist; sonst rückt das erste der neuen Liste nach.
  const selectedVehicleId = vehicles.some((v) => v.id === chosenVehicleId)
    ? chosenVehicleId
    : (vehicles[0]?.id ?? "");
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const filtered = hasActiveVehicleFilters(filters) || filters.status !== defaultStatus;
  const vehiclesWithImage = vehicles.filter(
    (vehicle) => vehicle.imageUrl !== null,
  ).length;

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
            {/*
             * Nur die Textvorschläge hängen am Schlüssel. Der Hinweis sagt das
             * ausdrücklich, damit niemand die ganze Seite für kaputt hält.
             */}
            <p className="leading-relaxed">
              Die KI-Textvorschläge sind nicht eingerichtet. Hinterlegen Sie{" "}
              <code className="bg-background rounded px-1 py-0.5 text-xs">
                OPENAI_API_KEY
              </code>{" "}
              in den Umgebungsvariablen, um Texte erzeugen zu lassen.
              {/*
               * Die Umgebung wird ausdrücklich genannt: Ein nur für Production
               * hinterlegter Schlüssel greift auf einer Preview-Bereitstellung
               * nicht – ohne diese Angabe sieht der Hinweis dort wie ein Fehler
               * der Anwendung aus.
               */}
              {deploymentEnvironment && (
                <>
                  {" "}
                  Diese Instanz läuft in der Umgebung{" "}
                  <code className="bg-background rounded px-1 py-0.5 text-xs">
                    {deploymentEnvironment}
                  </code>
                  ; dort muss die Variable gesetzt und danach neu bereitgestellt
                  sein.
                </>
              )}{" "}
              Bestehende Beiträge können Sie weiterhin bearbeiten, freigeben und
              veröffentlichen.
            </p>
          </div>
        )}

        {/*
          * Dieselbe Filterleiste wie in der Fahrzeugverwaltung, mit eigenem
          * Statusfeld: Vorgabe "Im Bestand", auf Wunsch auch reservierte,
          * verkaufte oder alle. Jede Änderung wird zur Adresse und lädt die
          * Liste serverseitig neu.
          */}
        {(totalVehicleCount > 0 || filtered) && (
          <VehicleFilterBar
            basePath="/admin/social-media"
            filters={filters}
            makes={filterOptions.makes}
            models={filterOptions.models}
            defaultStatus={defaultStatus}
            showStatus
          />
        )}

        {vehicles.length === 0 ? (
          filtered ? (
            <div className="border-border rounded-xl border border-dashed py-10 text-center">
              <p className="text-sm font-medium">
                Keine Fahrzeuge mit diesen Filtern gefunden.
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Ändern Sie Suche, Marke, Modell oder Status.
              </p>
            </div>
          ) : (
            <NoVehiclesState totalVehicleCount={totalVehicleCount} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Fahrzeug</legend>
              {/*
                * Liste statt Aufklappfeld: Mit Bild, Erstzulassung, Kilometer
                * und GW-Nr sind zwei gleich benannte Fahrzeuge auseinander-
                * zuhalten. Die Filter darüber halten die Liste kurz.
                */}
              <div
                role="radiogroup"
                aria-label="Fahrzeug für den Beitrag"
                className="border-border max-h-96 divide-y overflow-y-auto rounded-lg border"
              >
                {vehicles.map((vehicle) => {
                  const selected = vehicle.id === selectedVehicleId;

                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChosenVehicleId(vehicle.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected ? "bg-brand-subtle" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md">
                        {vehicle.imageUrl ? (
                          <Image
                            src={vehicle.imageUrl}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <ImageOff
                            className="text-muted-foreground absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {vehicle.title}
                          {vehicle.status !== "IN_STOCK" && (
                            <span className="text-muted-foreground font-normal">
                              {" "}· {VEHICLE_STATUS_LABELS[vehicle.status]}
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground tabular truncate text-xs">
                          {[
                            formatMonthYear(vehicle.firstRegistration),
                            formatKilometers(vehicle.mileageKm),
                            // Ohne Preis steht hier nichts – keine "0 €".
                            vehicle.priceCents !== null
                              ? formatEuro(vehicle.priceCents)
                              : null,
                            vehicle.stockNumber
                              ? `GW-Nr. ${vehicle.stockNumber}`
                              : null,
                            !vehicle.active ? "ausgeblendet" : null,
                            vehicle.imageUrl === null ? "ohne Bild" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Button
              variant="brand"
              size="2xl"
              className="self-start"
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

        {/*
          * Sammelhinweis, solange KEIN Fahrzeug im Bestand ein Bild hat. Ohne
          * ihn sähe man erst nach der Auswahl, dass noch nichts
          * veröffentlichbar ist.
          */}
        {vehicles.length > 0 && vehiclesWithImage === 0 && (
          <div className="border-border bg-muted/60 mt-5 flex gap-3 rounded-lg border p-4 text-sm">
            <ImageOff
              className="text-warning mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Keines der Fahrzeuge im Bestand hat bisher ein Bild. Texte lassen
              sich trotzdem erstellen und freigeben – für die Veröffentlichung
              auf Instagram braucht es je Fahrzeug mindestens ein Bild.
            </p>
          </div>
        )}

        {selectedVehicle && (
          <div className="mt-5 flex items-start gap-4">
            <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
              {selectedVehicle.imageUrl ? (
                <Image
                  src={selectedVehicle.imageUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <ImageOff
                  className="text-muted-foreground absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{selectedVehicle.title}</p>
              <p className="text-muted-foreground tabular">
                {[
                  formatMonthYear(selectedVehicle.firstRegistration),
                  formatKilometers(selectedVehicle.mileageKm),
                  selectedVehicle.priceCents !== null
                    ? formatEuro(selectedVehicle.priceCents)
                    : "kein Preis hinterlegt",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {selectedVehicle.imageUrl === null && (
                <p className="text-warning mt-1.5 leading-relaxed">
                  {MISSING_IMAGE_NOTICE}{" "}
                  <Link
                    href={`/admin/fahrzeuge/${selectedVehicle.id}`}
                    className="underline underline-offset-2"
                  >
                    Bild hochladen
                  </Link>
                </p>
              )}
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

/**
 * Leerer Zustand der Fahrzeugauswahl (US-18).
 *
 * Die beiden Fälle brauchen unterschiedliche nächste Schritte und dürfen
 * deshalb nicht denselben Satz zeigen: Einmal fehlt der Datensatz überhaupt,
 * einmal steht er nur nicht mehr im Bestand. Die frühere Sammelmeldung
 * („noch keine Fahrzeuge hinterlegt“) schickte in beiden Fällen zum Anlegen –
 * im zweiten Fall in die Irre.
 *
 * Was hier NICHT steht: ein Hinweis auf den öffentlichen Bestand. Der kommt
 * aus dem willhaben-Widget, wird nicht ausgelesen und speist diese Auswahl
 * nicht.
 */
function NoVehiclesState({ totalVehicleCount }: { totalVehicleCount: number }) {
  const nothingCreatedYet = totalVehicleCount === 0;

  return (
    <div className="border-border rounded-xl border border-dashed py-12 text-center">
      <p className="text-sm leading-relaxed font-medium">
        {nothingCreatedYet
          ? "Es sind noch keine Fahrzeuge angelegt."
          : "Kein Fahrzeug steht derzeit im Bestand."}
      </p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
        {nothingCreatedYet ? (
          <>
            Legen Sie zuerst ein Fahrzeug im Adminbereich an. Ein Bild ist dafür
            nicht nötig – der Text lässt sich auch ohne erstellen.
          </>
        ) : (
          <>
            {totalVehicleCount === 1
              ? "Das erfasste Fahrzeug ist"
              : `Alle ${totalVehicleCount} erfassten Fahrzeuge sind`}{" "}
            als reserviert oder verkauft vermerkt. Für Beiträge stehen nur
            Fahrzeuge im Bestand zur Verfügung.
          </>
        )}
      </p>
      <Button asChild variant="brand" size="xl" className="mt-6">
        <Link href={nothingCreatedYet ? "/admin/fahrzeuge/neu" : "/admin/fahrzeuge"}>
          {nothingCreatedYet ? (
            <>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Fahrzeug anlegen
            </>
          ) : (
            "Zur Fahrzeugverwaltung"
          )}
        </Link>
      </Button>
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

  /*
   * Der Entwurf hält den Bildstand vom Zeitpunkt der Generierung fest. Wurde
   * das Bild erst danach hochgeladen, ist der Beitrag trotzdem
   * veröffentlichbar – `publishDraft` greift dann auf das aktuelle
   * Fahrzeugbild zurück. Beide Quellen zählen deshalb auch hier.
   */
  const hasImage =
    draft.imageUrls.length > 0 || draft.vehicle.primaryImageUrl !== null;

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
              {/*
               * Zwei verschiedene Sachverhalte, die sich nicht ausschließen:
               * `status` sagt, ob das Fahrzeug noch im Bestand ist, `active`
               * nur, ob es in der Fahrzeugverwaltung eingeblendet wird. Sie
               * hier zusammenzufassen hieße, „ausgeblendet“ als „verkauft“ zu
               * melden.
               */}
              {draft.vehicle.status !== "IN_STOCK" && (
                <span className="text-warning ml-2">
                  · {VEHICLE_STATUS_LABELS[draft.vehicle.status]}
                </span>
              )}
              {!draft.vehicle.active && (
                <span className="text-muted-foreground ml-2">
                  · ausgeblendet
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

      {/* Ohne Bild bleibt der Beitrag ein Textentwurf. */}
      {!hasImage && !published && (
        <div className="border-border bg-muted/60 mt-4 flex gap-3 rounded-lg border p-3.5 text-sm">
          <ImageOff
            className="text-warning mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="leading-relaxed">
            {MISSING_IMAGE_NOTICE}{" "}
            <Link
              href={`/admin/fahrzeuge/${draft.vehicle.id}`}
              className="underline underline-offset-2"
            >
              Bild hochladen
            </Link>
          </p>
        </div>
      )}

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
              {/*
                * Zwei getrennte Voraussetzungen, zwei getrennte Begründungen.
                * Die verbindliche Prüfung sitzt in `publishDraft` – hier steht
                * sie nur, damit niemand auf eine Schaltfläche drückt, die
                * ohnehin abweist.
                */}
              <Button
                variant="brand"
                size="xl"
                disabled={pending || !instagramConnected || !hasImage}
                title={
                  !hasImage
                    ? MISSING_IMAGE_NOTICE
                    : instagramConnected
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
              disabled={pending || !instagramConnected || !hasImage}
              title={hasImage ? undefined : MISSING_IMAGE_NOTICE}
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
