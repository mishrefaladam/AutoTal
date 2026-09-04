"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteVehicle } from "@/modules/vehicles/admin-actions";

/**
 * Endgültiges Löschen eines Fahrzeugs.
 *
 * Bewusst mit Tippbestätigung: Löschen entfernt auch die Bilder aus dem
 * Speicher und ist nicht rückgängig zu machen. Für den Regelfall
 * „verkauft“ gibt es im Formular den Schalter „Auf der Website anzeigen“ –
 * damit bleibt der Datensatz erhalten.
 */
export function VehicleDangerZone({
  vehicleId,
  title,
}: {
  vehicleId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const CONFIRM_WORD = "LÖSCHEN";
  const canDelete = confirmation.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <section className="border-destructive/30 bg-destructive/5 rounded-xl border p-6">
      <h2 className="font-display flex items-center gap-2.5 text-lg font-bold tracking-tight">
        <TriangleAlert className="text-destructive size-5" aria-hidden="true" />
        Fahrzeug löschen
      </h2>

      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Entfernt <strong>{title}</strong> samt aller Bilder endgültig. Wenn das
        Fahrzeug nur verkauft ist, nehmen Sie es stattdessen oben über „Auf der
        Website anzeigen“ offline – dann bleiben Daten und Links erhalten.
      </p>

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="delete-confirm">
            Zum Bestätigen {CONFIRM_WORD} eingeben
          </Label>
          <Input
            id="delete-confirm"
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
              const result = await deleteVehicle(vehicleId);
              if (result.ok) {
                router.push("/admin/fahrzeuge");
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
