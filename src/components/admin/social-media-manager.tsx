"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  CircleCheck,
  CloudOff,
  ExternalLink,
  ImageOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEuro, formatKilometers } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  approveDraft,
  checkInstagramStatus,
  deleteDraft,
  generateCaption,
  revokeApproval,
  updateDraft,
} from "@/modules/social/actions";
import {
  PUBLISH_PHASE_LABELS,
  type PublishMode,
  publishWithProgress,
} from "@/modules/social/publish-client";
import {
  INSTAGRAM_MAX_IMAGES,
  orderSelectedImages,
} from "@/modules/social/publish-images";
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
import type { InstagramPublishPhase } from "@/integrations/instagram/protocol";

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
  DELETED_EXTERNALLY: {
    label: "Auf Instagram gelöscht",
    className: "bg-warning/12 text-warning",
  },
};

export function SocialMediaManager({
  vehicles,
  totalVehicleCount,
  filters,
  filterOptions,
  defaultStatus,
  drafts,
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
        description="Wählen Sie ein Fahrzeug aus dem Bestand. Der Text entsteht nach der AutoTal-Vorlage aus Name, Kilometern, Baujahr und Leistung – veröffentlicht wird nichts automatisch."
      >
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
              disabled={pending || !selectedVehicleId}
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
  const router = useRouter();
  /** null = keine Veröffentlichung im Gang; sonst der zuletzt gemeldete Schritt. */
  const [publishPhase, setPublishPhase] = useState<InstagramPublishPhase | "starting" | null>(null);

  const status = STATUS_STYLES[draft.status];
  const published = draft.status === "PUBLISHED";
  const deletedExternally = draft.status === "DELETED_EXTERNALLY";

  /*
   * Bilder des Beitrags – dieselbe Regel wie in `publishDraft`: Die Galerie
   * gibt die Reihenfolge vor (Titelbild zuerst), der Entwurf die Auswahl.
   * Ohne gespeicherte Auswahl gilt das Titelbild; ein inzwischen gelöschtes
   * Bild fällt weg. Ein erst nach der Generierung hochgeladenes Titelbild
   * zählt deshalb ebenfalls.
   */
  const galleryUrls = draft.vehicle.images.map((image) => image.url);
  const savedSelection = orderSelectedImages(draft.imageUrls, galleryUrls);
  const effectiveSelection =
    savedSelection.length > 0 ? savedSelection : galleryUrls.slice(0, 1);
  const [selectedUrls, setSelectedUrls] = useState<string[]>(effectiveSelection);

  const hasImage = effectiveSelection.length > 0;
  const tooManySelected = selectedUrls.length > INSTAGRAM_MAX_IMAGES;

  function toggleImage(url: string, checked: boolean) {
    setSelectedUrls((current) =>
      checked
        ? galleryUrls.filter((candidate) => candidate === url || current.includes(candidate))
        : current.filter((candidate) => candidate !== url),
    );
  }

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

  /** Alle drei Wege – veröffentlichen, erneut versuchen, neu veröffentlichen. */
  function publish(mode: PublishMode) {
    setPublishPhase("starting");
    run(
      async () => {
        try {
          return await publishWithProgress(draft.id, mode, setPublishPhase);
        } finally {
          setPublishPhase(null);
          // Die Route revalidiert die Seite; der Browser muss sie neu holen.
          router.refresh();
        }
      },
    );
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

      {/*
        * Auf Instagram gelöscht: nicht so tun, als wäre er noch online. Kein
        * Link, kein "Veröffentlicht am" – stattdessen der Weg zurück.
        */}
      {deletedExternally && (
        <div className="border-warning/40 bg-warning/8 mt-4 flex gap-3 rounded-lg border p-3.5 text-sm">
          <CloudOff
            className="text-warning mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="leading-relaxed">
              Der Beitrag wurde auf Instagram nicht mehr gefunden.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {draft.publishedAt && `Veröffentlicht am ${formatDateTime(draft.publishedAt)}`}
              {draft.externalCheckedAt &&
                ` · geprüft ${formatDateTime(draft.externalCheckedAt)}`}
              {" "}· Sie können ihn erneut veröffentlichen oder aus AutoTal entfernen.
            </p>
          </div>
        </div>
      )}

      {/* Ohne Bild bleibt der Beitrag ein Textentwurf. */}
      {!hasImage && !published && !deletedExternally && (
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

            <ImageSelection
              draftId={draft.id}
              galleryUrls={galleryUrls}
              selectedUrls={selectedUrls}
              onToggle={toggleImage}
              vehicleId={draft.vehicle.id}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="brand"
                size="xl"
                disabled={pending || selectedUrls.length === 0 || tooManySelected}
                title={
                  selectedUrls.length === 0
                    ? "Bitte mindestens ein Bild auswählen."
                    : tooManySelected
                      ? `Instagram erlaubt höchstens ${INSTAGRAM_MAX_IMAGES} Bilder je Beitrag.`
                      : undefined
                }
                onClick={() =>
                  run(
                    () =>
                      updateDraft({
                        draftId: draft.id,
                        caption,
                        hashtags,
                        imageUrls: orderSelectedImages(selectedUrls, galleryUrls),
                      }),
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
                  setSelectedUrls(effectiveSelection);
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

            {effectiveSelection.length > 0 && (
              <SelectedImagesSummary
                selectedUrls={effectiveSelection}
                galleryCount={galleryUrls.length}
              />
            )}
          </>
        )}
      </div>

      {/* Aktionen */}
      {/*
        * Zwischenstand während der Veröffentlichung – nur, was der Server
        * tatsächlich gemeldet hat. Keine Prozentwerte, keine Schätzung.
        */}
      {publishPhase && (
        <p
          role="status"
          className="text-muted-foreground mt-4 flex items-center gap-2 text-sm"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {publishPhase === "starting"
            ? "Instagram-Veröffentlichung wird gestartet …"
            : publishPhase === "images" && effectiveSelection.length === 1
              ? "Bild wird vorbereitet …"
              : PUBLISH_PHASE_LABELS[publishPhase]}
        </p>
      )}
      {!editing && (
        <div className="border-border mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          {!published && !deletedExternally && (
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
                onClick={() => publish("publish")}
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
              onClick={() => publish("retry")}
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

          {/*
            * Abgleich auf Knopfdruck – ohne auf die gedrosselte Prüfung beim
            * Seitenaufruf zu warten. Nur ein eindeutiges "nicht gefunden"
            * von Instagram ändert den Status.
            */}
          {published && (
            <Button
              variant="outline"
              size="xl"
              disabled={pending || !instagramConnected}
              title={
                instagramConnected
                  ? undefined
                  : "Bitte zuerst unter „Integrationen“ ein Instagram-Konto verbinden."
              }
              onClick={() => run(() => checkInstagramStatus(draft.id))}
            >
              {pending ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
              )}
              Instagram-Status prüfen
            </Button>
          )}

          {/*
            * Erneut veröffentlichen: Die Action bestätigt die Löschung bei
            * Instagram noch einmal, legt die alte Media-ID ab und geht dann
            * den normalen Veröffentlichungsweg – mit Sperre und neuer ID.
            */}
          {deletedExternally && (
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
              onClick={() => publish("republish")}
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
              Erneut veröffentlichen
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
            {deletedExternally ? "Aus AutoTal entfernen" : "Löschen"}
          </Button>
        </div>
      )}

      {published && draft.publishedAt && (
        <p className="text-muted-foreground mt-3 text-xs">
          Veröffentlicht am {formatDateTime(draft.publishedAt)}
          {draft.approvedByUser && ` · freigegeben von ${draft.approvedByUser}`}
          {draft.externalCheckedAt &&
            ` · auf Instagram bestätigt ${formatDateTime(draft.externalCheckedAt)}`}
        </p>
      )}
    </article>
  );
}

/** Anzeige der gewählten Bilder am fertigen Entwurf – in Beitragsreihenfolge. */
function SelectedImagesSummary({
  selectedUrls,
  galleryCount,
}: {
  selectedUrls: readonly string[];
  galleryCount: number;
}) {
  return (
    <div className="mt-3">
      <p className="text-muted-foreground text-xs">
        Instagram-Bilder: {selectedUrls.length} von {galleryCount}
        {selectedUrls.length > 1 ? " · als Carousel" : " · Einzelbild"}
      </p>
      <ol className="mt-1.5 flex flex-wrap gap-1.5">
        {selectedUrls.map((url, index) => (
          <li
            key={url}
            className="bg-muted relative size-12 overflow-hidden rounded-md"
          >
            <Image src={url} alt="" fill sizes="48px" className="object-cover" />
            <span className="bg-background/85 absolute bottom-0.5 left-0.5 rounded px-1 text-[10px] font-medium tabular-nums">
              {index + 1}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Bildauswahl beim Bearbeiten.
 *
 * Reihenfolge = Galerie des Fahrzeugs; das Titelbild steht vorne und ist
 * vorausgewählt. Die Nummer zeigt die Position im Beitrag, nicht in der
 * Galerie – wer Bild 2 abwählt, sieht Bild 3 als "2" rutschen. Ein Bild
 * wird nur veröffentlicht, wenn es hier gewählt ist; mehr als Instagrams
 * Höchstzahl lässt sich nicht speichern.
 */
function ImageSelection({
  draftId,
  galleryUrls,
  selectedUrls,
  onToggle,
  vehicleId,
}: {
  draftId: string;
  galleryUrls: readonly string[];
  selectedUrls: readonly string[];
  onToggle: (url: string, checked: boolean) => void;
  vehicleId: string;
}) {
  if (galleryUrls.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Instagram-Bilder</Label>
        <p className="text-muted-foreground text-sm">
          {MISSING_IMAGE_NOTICE}{" "}
          <Link
            href={`/admin/fahrzeuge/${vehicleId}`}
            className="underline underline-offset-2"
          >
            Bild hochladen
          </Link>
        </p>
      </div>
    );
  }

  const tooMany = selectedUrls.length > INSTAGRAM_MAX_IMAGES;
  const none = selectedUrls.length === 0;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Instagram-Bilder</legend>
      <p className="text-muted-foreground text-xs">
        {selectedUrls.length} von {galleryUrls.length} ausgewählt
        {selectedUrls.length > 1 && !tooMany && " · wird als Carousel veröffentlicht"}
        {" · "}höchstens {INSTAGRAM_MAX_IMAGES} je Beitrag
      </p>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {galleryUrls.map((url, index) => {
          const position = selectedUrls.indexOf(url);
          const checked = position >= 0;
          const id = `image-${draftId}-${index}`;

          return (
            <li key={url}>
              <label
                htmlFor={id}
                className={cn(
                  "border-border relative block cursor-pointer overflow-hidden rounded-lg border",
                  checked && "ring-brand ring-2",
                )}
              >
                <div className="bg-muted relative aspect-square">
                  <Image
                    src={url}
                    alt={index === 0 ? "Titelbild" : `Bild ${index + 1}`}
                    fill
                    sizes="(min-width: 768px) 160px, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="bg-background/90 absolute top-1 left-1 rounded p-0.5">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) => onToggle(url, value === true)}
                    aria-label={index === 0 ? "Titelbild" : `Bild ${index + 1}`}
                  />
                </div>
                {checked && (
                  <span className="bg-brand text-brand-foreground absolute top-1 right-1 rounded px-1.5 text-xs font-medium tabular-nums">
                    {position + 1}
                  </span>
                )}
                <span className="text-muted-foreground block truncate px-1.5 py-1 text-[11px]">
                  {index === 0 ? "Titelbild" : `Bild ${index + 1}`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {none && (
        <p className="text-warning text-xs">
          Ohne Bild lässt sich der Beitrag nicht veröffentlichen. Bitte
          mindestens ein Bild auswählen.
        </p>
      )}
      {tooMany && (
        <p className="text-destructive text-xs">
          Instagram erlaubt höchstens {INSTAGRAM_MAX_IMAGES} Bilder je Beitrag;
          ausgewählt sind {selectedUrls.length}. Bitte Bilder abwählen.
        </p>
      )}
    </fieldset>
  );
}
