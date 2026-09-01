"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VehicleImageDto } from "@/modules/vehicles/types";

/**
 * Bildergalerie der Fahrzeugdetailseite (US-05).
 *
 * Hauptbild mit Vorschaustreifen; ein Klick öffnet die Vollbildansicht.
 * Bedienbar per Tastatur (Pfeiltasten, Escape) und per Wischgeste.
 *
 * Nur das erste Bild wird priorisiert geladen – es ist auf der Detailseite
 * das LCP-Element. Alle weiteren laden verzögert (US-30).
 */
export function VehicleGallery({
  images,
  title,
}: {
  images: VehicleImageDto[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const count = images.length;

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  // Tastatursteuerung nur, solange die Vollbildansicht offen ist – sonst
  // würden die Pfeiltasten das Scrollen der Seite kapern.
  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };

    document.addEventListener("keydown", onKeyDown);
    // Hintergrund nicht mitscrollen lassen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen, go]);

  if (count === 0) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl">
        <ImageOff className="size-8" aria-hidden="true" />
        <p className="text-sm">Für dieses Fahrzeug liegen keine Bilder vor.</p>
      </div>
    );
  }

  const current = images[index];

  return (
    <div>
      {/* Hauptbild */}
      <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-xl">
        <Image
          key={current.id}
          src={current.url}
          alt={current.alt}
          fill
          priority={index === 0}
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />

        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute inset-0 flex cursor-zoom-in items-center justify-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
          aria-label="Bild in Vollbildansicht öffnen"
        >
          <span className="rounded-full bg-black/55 p-3 text-white backdrop-blur-sm">
            <Expand className="size-5" aria-hidden="true" />
          </span>
        </button>

        {count > 1 && (
          <>
            <GalleryArrow
              direction="prev"
              onClick={() => go(-1)}
              className="left-3"
            />
            <GalleryArrow
              direction="next"
              onClick={() => go(1)}
              className="right-3"
            />

            <p className="tabular pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {/* Vorschaustreifen */}
      {count > 1 && (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((image, imageIndex) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(imageIndex)}
                aria-label={`Bild ${imageIndex + 1} von ${count} anzeigen`}
                aria-current={imageIndex === index ? "true" : undefined}
                className={cn(
                  "bg-muted relative block aspect-[4/3] w-full overflow-hidden rounded-lg transition-all focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  imageIndex === index
                    ? "ring-brand ring-2 ring-offset-2 ring-offset-background"
                    : "opacity-65 hover:opacity-100",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="(min-width: 640px) 12vw, 22vw"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Vollbildansicht */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} – Bildergalerie`}
          className="fixed inset-0 z-[70] flex flex-col bg-black/95"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <p className="tabular text-sm">
              {index + 1} / {count}
            </p>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Vollbildansicht schließen"
              className="rounded-lg p-2 transition-colors hover:bg-white/12 focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
          </div>

          <div
            className="relative flex-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={current.url}
              alt={current.alt}
              fill
              sizes="100vw"
              className="object-contain"
            />

            {count > 1 && (
              <>
                <GalleryArrow
                  direction="prev"
                  onClick={() => go(-1)}
                  className="left-4"
                  variant="lightbox"
                />
                <GalleryArrow
                  direction="next"
                  onClick={() => go(1)}
                  className="right-4"
                  variant="lightbox"
                />
              </>
            )}
          </div>

          <p className="px-4 py-5 text-center text-sm text-white/70">
            {current.alt}
          </p>
        </div>
      )}
    </div>
  );
}

function GalleryArrow({
  direction,
  onClick,
  className,
  variant = "inline",
}: {
  direction: "prev" | "next";
  onClick: () => void;
  className?: string;
  variant?: "inline" | "lightbox";
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={direction === "prev" ? "Vorheriges Bild" : "Nächstes Bild"}
      className={cn(
        "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur-sm transition-colors focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none",
        variant === "lightbox"
          ? "bg-white/12 hover:bg-white/22"
          : "bg-black/45 hover:bg-black/65",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
