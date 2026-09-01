import Link from "next/link";
import { ArrowRight, Car } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 404-Seite.
 *
 * Häufigster Fall in diesem Projekt: ein Fahrzeug wurde verkauft und ist
 * deshalb nicht mehr aktiv (US-07). Der Text nimmt genau das auf, statt nur
 * "Seite nicht gefunden" zu melden (US-29).
 */
export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-2xl">
        <Car className="size-8" aria-hidden="true" />
      </span>

      <h1 className="font-display mt-7 text-3xl font-bold tracking-tight sm:text-4xl">
        Diese Seite gibt es nicht mehr
      </h1>

      <p className="text-muted-foreground mt-4 max-w-md leading-relaxed text-pretty">
        Möglicherweise wurde das Fahrzeug bereits verkauft oder die Adresse hat
        sich geändert. In unserem aktuellen Bestand werden Sie sicher fündig.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="brand" size="2xl">
          <Link href="/fahrzeuge">
            Zum Fahrzeugbestand
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>

        <Button asChild variant="outline" size="2xl">
          <Link href="/kontakt">Kontakt aufnehmen</Link>
        </Button>
      </div>
    </div>
  );
}
