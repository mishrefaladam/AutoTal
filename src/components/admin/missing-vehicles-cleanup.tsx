"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleCheck, Loader2, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMissingImportedVehicles } from "@/modules/vehicles/admin-actions";

/**
 * Sammelaktion: vom Import als fehlend markierte Fahrzeuge in einem Schritt
 * löschen.
 *
 * Gedacht für den Fall, dass ein Import zu viel angelegt hat – etwa den
 * gesamten Bestand statt nur der inserierten Fahrzeuge. Der nächste Import
 * mit der richtigen Datei markiert das Zuviel als fehlend; hier wird es dann
 * mit einer Bestätigung statt Dutzenden entfernt.
 *
 * Dieselbe Tippbestätigung wie beim Löschen eines einzelnen Fahrzeugs: Es
 * ist endgültig. Bearbeitete Fahrzeuge (Bilder, Beschreibung, Beiträge)
 * bleiben stehen – das sagt die Beschreibung vorab, und das Ergebnis nennt
 * sie beim Namen.
 */
export function MissingVehiclesCleanup({
  deletable,
  kept,
}: {
  /** Fehlende Fahrzeuge, die ausschließlich aus dem Import stammen. */
  deletable: number;
  /** Fehlende Fahrzeuge, die bearbeitet wurden und deshalb stehen bleiben. */
  kept: number;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; kept: string[] } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const CONFIRM_WORD = "LÖSCHEN";
  const canDelete = confirmation.trim().toUpperCase() === CONFIRM_WORD;

  if (done) {
    return (
      <section className="border-success/30 bg-success/5 rounded-xl border p-6">
        <h2 className="font-display flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <CircleCheck className="text-success size-5" aria-hidden="true" />
          {done.message}
        </h2>
        {done.kept.length > 0 && (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Stehen geblieben, weil sie Bilder, eine Beschreibung oder Beiträge
            haben – bitte einzeln prüfen: {done.kept.join(", ")}
          </p>
        )}
      </section>
    );
  }

  if (deletable === 0) return null;

  return (
    <section className="border-destructive/30 bg-destructive/5 rounded-xl border p-6">
      <h2 className="font-display flex items-center gap-2.5 text-lg font-bold tracking-tight">
        <TriangleAlert className="text-destructive size-5" aria-hidden="true" />
        {deletable === 1
          ? "1 fehlendes Fahrzeug löschen"
          : `${deletable} fehlende Fahrzeuge löschen`}
      </h2>

      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Diese Fahrzeuge waren im letzten Import nicht mehr enthalten und wurden
        seit ihrem Import nicht bearbeitet – keine Bilder, keine Beschreibung,
        keine Beiträge. Sie werden endgültig entfernt.
        {kept > 0 &&
          ` ${kept === 1 ? "1 weiteres fehlendes Fahrzeug bleibt" : `${kept} weitere fehlende Fahrzeuge bleiben`} stehen, weil daran bereits gearbeitet wurde.`}
      </p>

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="cleanup-confirm">
            Zum Bestätigen {CONFIRM_WORD} eingeben
          </Label>
          <Input
            id="cleanup-confirm"
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="destructive"
          size="2xl"
          disabled={!canDelete || pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await deleteMissingImportedVehicles();
              if (result.ok) {
                setDone({ message: result.data.message, kept: result.data.kept });
                router.refresh();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          {pending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 data-icon="inline-start" aria-hidden="true" />
          )}
          Endgültig löschen
        </Button>
      </div>
    </section>
  );
}
