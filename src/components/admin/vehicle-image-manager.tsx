"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleX,
  GripVertical,
  ImagePlus,
  Loader2,
  RotateCw,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { UploadError, runUploadQueue, type UploadItemState } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/integrations/storage/types";
import {
  deleteVehicleImage,
  reorderVehicleImages,
} from "@/modules/vehicles/admin-actions";

/**
 * Bildergalerie eines Fahrzeugs: hochladen, sortieren, löschen.
 *
 * Das erste Bild ist das Titelbild – es erscheint auf der Fahrzeugkarte und
 * wird für Social-Media-Beiträge verwendet. Deshalb ist die Reihenfolge
 * nicht kosmetisch, sondern inhaltlich.
 *
 * HOCHLADEN: Mehrere Dateien auf einmal, per Auswahl oder Ablegen. Jedes
 * Bild geht einzeln – in Produktion direkt in den Blob-Store, vorbei am
 * 4,5-MB-Limit und an der Laufzeit der Function; lokal ohne Blob-Token über
 * die bisherige Route. Höchstens zwei zugleich: Elf iPhone-Fotos auf einmal
 * über Mobilfunk brachten Safari dazu, einzelne Verbindungen abzubrechen.
 * Ein Netzwerkabbruch wird einmal automatisch wiederholt; eine Ablehnung
 * ("kein JPEG") nicht. Jede Datei bekommt ihr eigenes Ergebnis, ein Fehler
 * hält die anderen nicht auf, und was scheiterte, lässt sich einzeln erneut
 * anstoßen.
 *
 * SORTIEREN: Ziehen mit der Maus – ohne Bibliothek, über die Drag-and-Drop-
 * Schnittstelle des Browsers. Die Pfeile bleiben daneben: Sie funktionieren
 * auf dem Touchscreen, mit der Tastatur und mit Screenreadern. "Als
 * Titelbild verwenden" setzt ein Bild in einem Schritt nach vorne.
 */

export type VehicleImageItem = {
  id: string;
  url: string;
  alt: string | null;
};

/** Ergebnis je Datei, damit der Händler sieht, was mit jeder passiert ist. */
type FileOutcome = {
  key: string;
  name: string;
  file: File;
  state: UploadItemState;
};

/** Zwei zugleich – siehe Kopfkommentar. */
const UPLOAD_CONCURRENCY = 2;
/** Ein automatischer zweiter Versuch bei Netzwerkfehlern, dann der Nutzer. */
const UPLOAD_MAX_ATTEMPTS = 2;
const UPLOAD_BACKOFF_MS = 1500;
/** Direkt nach Blob: Instagrams Obergrenze je Foto. */
const DIRECT_MAX_BYTES = 8 * 1024 * 1024;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Nicht-JSON (413 als Klartext, HTML einer Fehlerseite) sauber einordnen. */
async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wiederholbar oder endgültig? Eine Ablehnung des Servers (4xx) ist ein
 * Urteil über die Datei; 5xx und Netzwerkabbrüche sind vorübergehend.
 */
function toUploadError(status: number, message: string | undefined): UploadError {
  if (status >= 400 && status < 500) {
    return new UploadError(
      message ??
        (status === 413 ? `Datei zu groß (über ${formatMegabytes(MAX_IMAGE_BYTES)})` : "Upload abgelehnt"),
      false,
    );
  }
  return new UploadError(message ?? "Der Server hat nicht geantwortet", true);
}

/** Direkt nach Vercel Blob, danach beim Fahrzeug eintragen. */
async function uploadDirect(vehicleId: string, file: File): Promise<VehicleImageItem> {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  let pathname: string;
  try {
    const result = await upload(`fahrzeuge/${vehicleId}/${crypto.randomUUID()}.${extension}`, file, {
      access: "public",
      handleUploadUrl: `/api/admin/vehicles/${vehicleId}/images/upload`,
      contentType: file.type,
    });
    pathname = result.pathname;
  } catch (cause) {
    // Das SDK meldet Ablehnungen (Typ, Größe) mit Klartext; alles andere ist
    // ein Übertragungsproblem und darf wiederholt werden.
    const message = cause instanceof Error ? cause.message : "";
    const rejected = /content type|size|too large|not allowed|forbidden|Ungültig/i.test(message);
    throw new UploadError(
      rejected ? message : "Die Verbindung ist abgebrochen.",
      !rejected,
    );
  }

  const response = await fetch(`/api/admin/vehicles/${vehicleId}/images/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathname }),
  });
  const result = await readJson<{ image?: VehicleImageItem; error?: string }>(response);
  if (!response.ok || !result?.image) {
    throw toUploadError(response.status, result?.error);
  }
  return { ...result.image, alt: null };
}

/** Rückfall ohne Blob-Token: eine Datei je Anfrage über die bisherige Route. */
async function uploadViaFunction(vehicleId: string, file: File): Promise<VehicleImageItem> {
  const body = new FormData();
  body.append("files", file);
  const response = await fetch(`/api/admin/vehicles/${vehicleId}/images`, {
    method: "POST",
    body,
  });
  const result = await readJson<{ images?: VehicleImageItem[]; skipped?: string[]; error?: string }>(
    response,
  );
  if (!response.ok) throw toUploadError(response.status, result?.error);
  const image = result?.images?.[0];
  if (!image) {
    // Der Server hat die eine Datei benannt abgelehnt: "name: Grund".
    const reason = result?.skipped?.[0]?.split(": ").slice(1).join(": ") ?? "Upload abgelehnt";
    throw new UploadError(reason, false);
  }
  return { ...image, alt: null };
}

export function VehicleImageManager({
  vehicleId,
  images: initialImages,
  storageHint,
}: {
  vehicleId: string;
  images: VehicleImageItem[];
  /** Hinweis, falls der Speicher für die Produktion nicht taugt. */
  storageHint: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const directRef = useRef<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  /** Einmal je Sitzung fragen, ob der direkte Weg nach Blob offen ist. */
  async function isDirect(): Promise<boolean> {
    if (directRef.current !== null) return directRef.current;
    try {
      const response = await fetch(`/api/admin/vehicles/${vehicleId}/images/upload`);
      const info = await readJson<{ directUpload?: boolean }>(response);
      directRef.current = Boolean(info?.directUpload);
    } catch {
      directRef.current = false;
    }
    return directRef.current;
  }

  /**
   * Lädt eine Liste von Dateien hoch – neu gewählte oder die, die beim letzten
   * Mal scheiterten. Was schon übernommen wurde, wird nie noch einmal
   * geschickt.
   */
  async function runUploads(targets: FileOutcome[]) {
    if (targets.length === 0) return;
    setError(null);
    setUploading(true);

    const direct = await isDirect();
    const maxBytes = direct ? DIRECT_MAX_BYTES : MAX_IMAGE_BYTES;
    const keys = targets.map((t) => t.key);
    const setState = (key: string, state: UploadItemState) =>
      setOutcomes((current) => current.map((o) => (o.key === key ? { ...o, state } : o)));

    try {
      await runUploadQueue(
        targets,
        async (target) => {
          // Prüfungen, die kein Netz brauchen – mit endgültigem Urteil.
          if (!ALLOWED_IMAGE_TYPES.includes(target.file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
            throw new UploadError("nur JPEG, PNG oder WebP", false);
          }
          if (target.file.size > maxBytes) {
            throw new UploadError(`über ${formatMegabytes(maxBytes)}`, false);
          }
          const image = direct
            ? await uploadDirect(vehicleId, target.file)
            : await uploadViaFunction(vehicleId, target.file);
          setImages((current) =>
            current.some((i) => i.id === image.id) ? current : [...current, image],
          );
          return image;
        },
        {
          concurrency: UPLOAD_CONCURRENCY,
          maxAttempts: UPLOAD_MAX_ATTEMPTS,
          backoffMs: UPLOAD_BACKOFF_MS,
          onState: (index, state) => setState(keys[index], state),
        },
      );

      // Server-Komponenten neu laden, damit Liste und Beitragsassistent den
      // neuen Stand zeigen.
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      file,
      state: { kind: "pending" } as UploadItemState,
    }));
    setOutcomes(selected);
    void runUploads(selected);
  }

  /** Nur die gescheiterten noch einmal – erfolgreiche bleiben, wie sie sind. */
  function retryFailed() {
    const failed = outcomes.filter((o) => o.state.kind === "failed");
    setOutcomes((current) =>
      current.map((o) => (o.state.kind === "failed" ? { ...o, state: { kind: "pending" } } : o)),
    );
    void runUploads(failed);
  }

  function persistOrder(next: VehicleImageItem[]) {
    setImages(next);
    startTransition(async () => {
      const result = await reorderVehicleImages({
        vehicleId,
        imageIds: next.map((image) => image.id),
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;

    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  }

  /** Ein Bild an eine beliebige Stelle setzen – für Ziehen und "Titelbild". */
  function moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persistOrder(next);
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteVehicleImage(id);
      if (result.ok) {
        setImages((current) => current.filter((image) => image.id !== id));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const doneCount = outcomes.filter((o) => o.state.kind === "done").length;
  const failedCount = outcomes.filter((o) => o.state.kind === "failed").length;

  return (
    <AdminCard
      title="Bilder"
      description="Das erste Bild ist das Titelbild – es erscheint auf der Fahrzeugkarte und in Social-Media-Beiträgen. Bilder lassen sich per Ziehen oder über die Pfeile sortieren."
      action={
        <Button
          type="button"
          variant="brand"
          size="xl"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus data-icon="inline-start" aria-hidden="true" />
          )}
          {uploading ? "Wird hochgeladen …" : "Bilder hinzufügen"}
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {storageHint && (
        <div className="border-warning/40 bg-warning/10 mb-5 flex gap-3 rounded-lg border p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">{storageHint}</p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/8 mb-5 flex gap-3 rounded-lg border p-4 text-sm"
        >
          <TriangleAlert
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      {/* Ablagefläche: Dateien aus dem Finder oder Explorer direkt hierher ziehen. */}
      <div
        onDragOver={(event) => {
          if (uploading) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (uploading) return;
          const dropped = Array.from(event.dataTransfer.files).filter((file) =>
            file.type.startsWith("image/"),
          );
          void handleFiles(dropped);
        }}
        className={cn(
          "rounded-xl transition-colors",
          dragOver && "bg-brand-subtle ring-brand/40 ring-2",
        )}
      >
        {outcomes.length > 0 && (
          <ul
            aria-live="polite"
            className="border-border bg-muted/40 mb-5 space-y-1 rounded-lg border p-3 text-sm"
          >
            <li className="text-muted-foreground mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                {uploading
                  ? `${doneCount} von ${outcomes.length} hochgeladen …`
                  : `${doneCount} von ${outcomes.length} übernommen${failedCount > 0 ? `, ${failedCount} fehlgeschlagen` : ""}`}
              </span>
              {!uploading && failedCount > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={retryFailed}>
                  <RotateCw data-icon="inline-start" aria-hidden="true" />
                  {failedCount === 1 ? "Erneut versuchen" : `${failedCount} erneut versuchen`}
                </Button>
              )}
            </li>
            {outcomes.map((outcome) => (
              <li key={outcome.key} className="flex items-start gap-2">
                {outcome.state.kind === "done" ? (
                  <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : outcome.state.kind === "failed" ? (
                  <CircleX className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : outcome.state.kind === "retrying" ? (
                  <RotateCw className="text-warning mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <Loader2
                    className={cn(
                      "text-muted-foreground mt-0.5 size-4 shrink-0",
                      outcome.state.kind === "uploading" && "animate-spin",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 break-words">
                  {outcome.name}
                  {outcome.state.kind === "retrying" && (
                    <span className="text-muted-foreground"> – neuer Versuch …</span>
                  )}
                  {outcome.state.kind === "failed" && (
                    <span className="text-muted-foreground">
                      {" "}– {outcome.state.retryable ? "Upload fehlgeschlagen: " : ""}
                      {outcome.state.message}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="border-border hover:border-brand/50 hover:bg-muted/40 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-14 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ImagePlus className="text-muted-foreground size-7" aria-hidden="true" />
            <span className="text-sm font-medium">Bilder auswählen oder hierher ziehen</span>
            <span className="text-muted-foreground text-xs">
              JPEG, PNG oder WebP · mehrere auf einmal · bis 8 MB je Bild
            </span>
          </button>
        ) : (
          <ul
            className={cn(
              "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
              pending && "opacity-70",
            )}
          >
            {images.map((image, index) => (
              <li
                key={image.id}
                draggable={!pending}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (dragIndex === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) moveTo(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "group relative rounded-lg",
                  dragIndex === index && "opacity-50",
                )}
              >
                <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, 45vw"
                    className="object-cover"
                  />

                  {index === 0 && (
                    <span className="bg-brand text-brand-foreground absolute top-2 left-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold">
                      <Star className="size-3" aria-hidden="true" />
                      Titelbild
                    </span>
                  )}

                  <span
                    className="bg-background/80 text-muted-foreground absolute top-2 right-2 rounded-md p-1"
                    aria-hidden="true"
                    title="Zum Sortieren ziehen"
                  >
                    <GripVertical className="size-4" />
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={index === 0 || pending}
                      onClick={() => move(index, -1)}
                      aria-label={`Bild ${index + 1} nach vorne`}
                    >
                      <ArrowLeft aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={index === images.length - 1 || pending}
                      onClick={() => move(index, 1)}
                      aria-label={`Bild ${index + 1} nach hinten`}
                    >
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() => moveTo(index, 0)}
                        aria-label={`Bild ${index + 1} als Titelbild verwenden`}
                        title="Als Titelbild verwenden"
                      >
                        <Star aria-hidden="true" />
                      </Button>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    disabled={pending}
                    onClick={() => remove(image.id)}
                    aria-label={`Bild ${index + 1} löschen`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminCard>
  );
}
