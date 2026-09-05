"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  REFERRAL_POPUP_DELAY_MS,
  REFERRAL_POPUP_IMAGE,
  REFERRAL_POPUP_STORAGE_KEY,
  shouldShowReferralPopup,
} from "./referral-popup-config";

/**
 * Marketing-Popup „250 € Empfehlungsbonus“.
 *
 * Zeigt das fertige Kampagnenmotiv aus /public/marketing. Der Text steht im
 * Bild – hier wird bewusst nichts davon in HTML nachgebaut, damit Grafik und
 * Anzeige nicht auseinanderlaufen. Wird das Motiv ausgetauscht, genügt der
 * Austausch der Datei (Maße in referral-popup-config.ts anpassen).
 *
 * ZUGÄNGLICHKEIT: Umgesetzt mit dem nativen <dialog> und `showModal()`. Das
 * bringt Fokusfang, Escape und die Inertisierung des Hintergrunds vom Browser
 * mit – zuverlässiger als eine selbstgebaute Lösung. Der Bild-Alternativtext
 * gibt den Inhalt des Motivs wieder, damit die Aktion auch ohne Bild verständlich ist.
 *
 * SPEICHER: Nach dem Schließen wird ein Zeitstempel im localStorage abgelegt.
 * Steht der nicht zur Verfügung (privater Modus, gesperrte Website-Daten),
 * läuft alles weiter – dann erscheint das Popup eben erneut. Ein Marketing-
 * Popup darf niemals die Seite lahmlegen.
 */
export function ReferralPopup({
  whatsappHref,
  contactHref = "/kontakt",
}: {
  /** Fertiger wa.me-Link oder null, wenn keine Nummer gepflegt ist. */
  whatsappHref: string | null;
  contactHref?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(REFERRAL_POPUP_STORAGE_KEY);
    } catch {
      // Zugriff gesperrt – dann gilt "noch nicht gesehen".
      stored = null;
    }

    if (!shouldShowReferralPopup(stored)) return;

    const timer = window.setTimeout(() => {
      // Zwischen Planung und Ablauf kann die Seite gewechselt worden sein.
      if (dialog.isConnected && !dialog.open) dialog.showModal();
    }, REFERRAL_POPUP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  /**
   * Merkt sich das Schließen. Läuft auch beim Schließen per Escape, weil
   * <dialog> dafür dasselbe close-Ereignis auslöst.
   */
  const remember = () => {
    try {
      window.localStorage.setItem(
        REFERRAL_POPUP_STORAGE_KEY,
        String(Date.now()),
      );
    } catch {
      // Nicht speicherbar ist kein Fehler, der jemanden interessieren muss.
    }
  };

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      onClose={remember}
      aria-labelledby="referral-popup-title"
      // Klick auf die Fläche außerhalb des Inhalts schließt. Das <dialog>
      // selbst füllt den Bildschirm; nur ein Treffer auf ihm – nicht auf
      // einem Kind – ist ein Klick daneben.
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      // "hidden open:flex" statt nur "flex": Ein Display-Wert würde das
      // display:none des Browsers für geschlossene Dialoge aushebeln – das
      // Popup wäre dauerhaft sichtbar. Die volle Fläche brauchen wir, damit
      // ein Klick daneben überhaupt den Dialog trifft; zentriert wird per
      // Flexbox, weil Tailwinds Preflight das margin:auto des Browsers
      // entfernt.
      className="fixed inset-0 m-0 hidden h-full max-h-none w-full max-w-none items-center justify-center bg-transparent p-4 backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex"
    >
      <div className="relative flex max-h-[92dvh] w-[min(92vw,26rem)] flex-col overflow-hidden rounded-2xl bg-black shadow-2xl">
        <h2 id="referral-popup-title" className="sr-only">
          250 € Empfehlungsbonus
        </h2>

        <button
          type="button"
          onClick={close}
          aria-label="Hinweis schließen"
          className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:ring-3 focus-visible:ring-white/50 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="min-h-0 overflow-y-auto">
          <Image
            src={REFERRAL_POPUP_IMAGE.src}
            alt={REFERRAL_POPUP_IMAGE.alt}
            width={REFERRAL_POPUP_IMAGE.width}
            height={REFERRAL_POPUP_IMAGE.height}
            sizes="(max-width: 480px) 92vw, 26rem"
            className="h-auto w-full"
          />
        </div>

        {/* Handlungsaufforderung. WhatsApp nur, wenn eine Nummer gepflegt ist –
            ein Link ins Leere wäre schlechter als keiner. */}
        <div className="flex shrink-0 flex-col gap-2 bg-black p-4 sm:flex-row">
          {whatsappHref ? (
            <>
              <Button
                asChild
                variant="brand"
                size="xl"
                className="w-full sm:flex-1"
              >
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                >
                  Über WhatsApp melden
                </a>
              </Button>
              <Button
                asChild
                variant="onInk"
                size="xl"
                className="w-full sm:w-auto"
              >
                <Link href={contactHref} onClick={close}>
                  Kontakt
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="brand" size="xl" className="w-full">
              <Link href={contactHref} onClick={close}>
                Mehr erfahren
              </Link>
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
