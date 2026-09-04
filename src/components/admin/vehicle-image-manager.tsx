"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
 * Sortiert wird über Pfeiltasten statt per Drag & Drop: Das funktioniert auf
 * dem Touchscreen, mit der Tastatur und mit Screenreadern gleichermaßen.
 */

export type VehicleImageItem = {
  id: string;
  url: string;
  alt: string | null;
};

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);

    const body = new FormData();
    for (const file of Array.from(files)) body.append("files", file);

    try {
      const response = await fetch(`/api/admin/vehicles/${vehicleId}/images`, {
        method: "POST",
        body,
      });

      const result = (await response.json()) as {
        error?: string;
        skipped?: string[];
        images?: VehicleImageItem[];
      };

      if (!response.ok) {
        setError(result.error ?? "Der Upload ist fehlgeschlagen.");
        return;
      }

      if (result.skipped?.length) {
        setError(
          `Nicht übernommen: ${result.skipped.join(" · ")}`,
        );
      }

      if (result.images?.length) {
        setImages((current) => [
          ...current,
          ...result.images!.map((image) => ({ ...image, alt: null })),
        ]);
        // Server-Komponenten neu laden, damit die öffentliche Seite den
        // neuen Stand zeigt.
        router.refresh();
      }
    } catch {
      setError(
        "Die Verbindung ist abgebrochen. Bitte prüfen Sie das Netzwerk und " +
          "versuchen Sie es erneut.",
      );
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

  return (
    <AdminCard
      title="Bilder"
      description="Das erste Bild ist das Titelbild – es erscheint auf der Fahrzeugkarte und in Social-Media-Beiträgen."
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
        onChange={(event) => handleFiles(event.target.files)}
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

      {images.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-border hover:border-brand/50 hover:bg-muted/40 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-14 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ImagePlus className="text-muted-foreground size-7" aria-hidden="true" />
          <span className="text-sm font-medium">Bilder auswählen</span>
          <span className="text-muted-foreground text-xs">
            JPEG, PNG oder WebP · bis 8 MB je Bild
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
            <li key={image.id} className="group relative">
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
    </AdminCard>
  );
}
