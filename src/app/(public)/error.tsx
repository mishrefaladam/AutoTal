"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Phone, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Auffangseite für unerwartete Fehler auf öffentlichen Seiten (US-29).
 *
 * Zeigt bewusst keine technischen Details – die stehen im Serverlog. Der
 * Besucher bekommt stattdessen einen Weg nach vorn: neu laden oder anrufen.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Der Digest verknüpft diese Anzeige mit dem passenden Servereintrag.
    console.error("Unerwarteter Fehler auf einer öffentlichen Seite", {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="bg-destructive/10 text-destructive flex size-16 items-center justify-center rounded-2xl">
        <TriangleAlert className="size-8" aria-hidden="true" />
      </span>

      <h1 className="font-display mt-7 text-3xl font-bold tracking-tight sm:text-4xl">
        Da ist etwas schiefgelaufen
      </h1>

      <p className="text-muted-foreground mt-4 max-w-md leading-relaxed text-pretty">
        Die Seite konnte gerade nicht geladen werden. Meist hilft es schon, es
        gleich noch einmal zu versuchen. Wenn nicht, rufen Sie uns einfach an –
        wir helfen Ihnen direkt weiter.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="brand" size="2xl" onClick={reset}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Erneut versuchen
        </Button>

        <Button asChild variant="outline" size="2xl">
          <Link href="/kontakt">
            <Phone data-icon="inline-start" aria-hidden="true" />
            Kontakt
          </Link>
        </Button>
      </div>

      {error.digest && (
        <p className="text-muted-foreground mt-8 text-xs">
          Fehlerkennung: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
