"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleX,
  GripVertical,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { batchFiles } from "@/lib/upload-batches";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_REQUEST_BYTES } from "@/integrations/storage/types";
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
 * HOCHLADEN: Mehrere Dateien auf einmal, per Auswahl oder Ablegen. Der
 * Server nimmt je Anfrage 4 MB und 20 Dateien an; größere Auswahlen werden
 * hier in Stapel geteilt und nacheinander geschickt – für den Händler ist es
 * ein Vorgang. Jede Datei bekommt ihr eigenes Ergebnis: übernommen oder mit
 * Grund abgelehnt. Ein Fehler bei einer Datei hält die anderen nicht auf.
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
  name: string;
  state: "pending" | "uploading" | "done" | "failed";
  message?: string;
};

const MAX_FILES_PER_REQUEST = 20;

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
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;

    setError(null);
    const selected = Array.from(files);
    setOutcomes(selected.map((file) => ({ name: file.name, state: "pending" })));
    setUploading(true);

    try {
      for (const batch of batchFiles(selected, MAX_UPLOAD_REQUEST_BYTES, MAX_FILES_PER_REQUEST)) {
        const names = new Set(batch.map((file) => file.name));
        setOutcomes((current) =>
          current.map((o) => (names.has(o.name) && o.state === "pending" ? { ...o, state: "uploading" } : o)),
        );

        const body = new FormData();
        for (const file of batch) body.append("files", file);

        let result: { error?: string; skipped?: string[]; images?: VehicleImageItem[] };
        try {
          const response = await fetch(`/api/admin/vehicles/${vehicleId}/images`, {
            method: "POST",
            body,
          });
          result = (await response.json()) as typeof result;
          if (!response.ok) {
            result = { error: result.error ?? "Der Upload ist fehlgeschlagen." };
          }
        } catch {
          result = { error: "Die Verbindung ist abgebrochen." };
        }

        if (result.error) {
          // Der ganze Stapel scheiterte – jede Datei darin bekommt den Grund.
          const reason = result.error;
          setOutcomes((current) =>
            current.map((o) =>
              names.has(o.name) && o.state === "uploading"
                ? { ...o, state: "failed", message: reason }
                : o,
            ),
          );
          continue;
        }

        // Abgelehnte Dateien meldet der Server als "name: Grund".
        const failed = new Map<string, string>();
        for (const entry of result.skipped ?? []) {
          const separator = entry.indexOf(": ");
          if (separator > 0) failed.set(entry.slice(0, separator), entry.slice(separator + 2));
        }

        setOutcomes((current) =>
          current.map((o) => {
            if (!names.has(o.name) || o.state !== "uploading") return o;
            const reason = failed.get(o.name);
            return reason ? { ...o, state: "failed", message: reason } : { ...o, state: "done" };
          }),
        );

        if (result.images?.length) {
          setImages((current) => [
            ...current,
            ...result.images!.map((image) => ({ ...image, alt: null })),
          ]);
        }
      }

      // Server-Komponenten neu laden, damit Liste und Beitragsassistent den
      // neuen Stand zeigen.
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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

  const doneCount = outcomes.filter((o) => o.state === "done").length;
  const failedCount = outcomes.filter((o) => o.state === "failed").length;

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
            <li className="text-muted-foreground mb-1 text-xs">
              {uploading
                ? `${doneCount} von ${outcomes.length} hochgeladen …`
                : `${doneCount} übernommen${failedCount > 0 ? `, ${failedCount} abgelehnt` : ""}`}
            </li>
            {outcomes.map((outcome) => (
              <li key={outcome.name} className="flex items-start gap-2">
                {outcome.state === "done" ? (
                  <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : outcome.state === "failed" ? (
                  <CircleX className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Loader2
                    className={cn(
                      "text-muted-foreground mt-0.5 size-4 shrink-0",
                      outcome.state === "uploading" && "animate-spin",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 break-words">
                  {outcome.name}
                  {outcome.message && (
                    <span className="text-muted-foreground"> – {outcome.message}</span>
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
              JPEG, PNG oder WebP · mehrere auf einmal · bis 4 MB je Datei
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
