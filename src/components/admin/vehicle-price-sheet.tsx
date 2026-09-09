"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CircleCheck,
  FileText,
  ImageOff,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  ApplyResult,
  PriceSheetAnalysis,
} from "@/modules/vehicles/price-sheet-service";

/**
 * Preisblatt-PDF für genau dieses Fahrzeug einlesen.
 *
 * Zweistufig und ohne Zwischenspeicher: Die Analyse zeigt Feld für Feld, was
 * im Blatt steht und was am Fahrzeug schon gepflegt ist. Erst ein zweiter,
 * ausdrücklicher Klick übernimmt – und nur das, was angehakt ist.
 *
 * Vorausgewählt sind ausschließlich leere Felder. Ein abweichender
 * bestehender Wert wird nie automatisch überschrieben; er ist als Konflikt
 * markiert und braucht eine bewusste Entscheidung.
 *
 * Alle Werte aus dem PDF werden als Text ausgegeben – React maskiert sie.
 * Nichts aus der Datei wird als HTML oder Skript interpretiert.
 */

type State =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "review"; data: PriceSheetAnalysis }
  | { step: "applying"; data: PriceSheetAnalysis }
  | { step: "done"; data: ApplyResult };

export function VehiclePriceSheet({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [imageChoice, setImageChoice] = useState<number | null>(null);
  const [conflictsAcknowledged, setConflictsAcknowledged] = useState(false);

  async function send(
    selected: File,
    mode: "analyse" | "apply",
  ): Promise<PriceSheetAnalysis | ApplyResult | null> {
    const body = new FormData();
    body.append("file", selected);
    body.append("mode", mode);

    if (mode === "apply") {
      body.append("fields", [...accepted].join(","));
      if (imageChoice !== null) {
        body.append("imageObjectNumber", String(imageChoice));
      }
    }

    const response = await fetch(`/api/admin/vehicles/${vehicleId}/price-sheet`, {
      method: "POST",
      body,
    });

    const result = (await response.json()) as
      | PriceSheetAnalysis
      | ApplyResult
      | { error: string };

    if (!response.ok || "error" in result) {
      setError(
        "error" in result
          ? result.error
          : "Die Datei konnte nicht als Preisblatt verarbeitet werden.",
      );
      return null;
    }

    return result;
  }

  async function handleSelect(selected: File | null) {
    setError(null);
    setFile(selected);
    setConflictsAcknowledged(false);

    if (!selected) {
      setState({ step: "idle" });
      return;
    }

    setState({ step: "loading" });
    const result = await send(selected, "analyse");

    if (result && "entries" in result) {
      // Vorauswahl kommt vom Server: nur leere Felder.
      setAccepted(
        new Set(result.entries.filter((entry) => entry.preselected).map((e) => e.field)),
      );
      setImageChoice(result.images[0]?.objectNumber ?? null);
      setState({ step: "review", data: result });
    } else {
      setState({ step: "idle" });
    }
  }

  async function handleApply() {
    if (!file || state.step !== "review") return;

    setError(null);
    setState({ step: "applying", data: state.data });

    const result = await send(file, "apply");

    if (result && "appliedFields" in result) {
      setState({ step: "done", data: result });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } else {
      setState({ step: "review", data: state.data });
    }
  }

  function toggle(field: string) {
    setAccepted((previous) => {
      const next = new Set(previous);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  const busy = state.step === "loading" || state.step === "applying";

  return (
    <AdminCard
      title="Preisblatt-PDF importieren"
      description="Das Preisblatt aus dem Händlersystem. Fehlende Fahrzeugdaten und ein enthaltenes Fahrzeugbild werden vorgeschlagen – übernommen wird erst nach Ihrer Bestätigung."
    >
      <div className="space-y-5">
        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/8 flex gap-3 rounded-lg border p-4 text-sm leading-relaxed"
          >
            <TriangleAlert
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p>{error}</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => void handleSelect(event.target.files?.[0] ?? null)}
          className={cn(
            "border-border w-full rounded-lg border border-dashed p-4 text-sm",
            "file:border-border file:bg-muted file:mr-4 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium",
            busy && "opacity-60",
          )}
          aria-label="Preisblatt als PDF"
        />

        {state.step === "loading" && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Preisblatt wird gelesen …
          </p>
        )}

        {(state.step === "review" || state.step === "applying") && (
          <Review
            data={state.data}
            accepted={accepted}
            onToggle={toggle}
            imageChoice={imageChoice}
            onImageChoice={setImageChoice}
            conflictsAcknowledged={conflictsAcknowledged}
            onAcknowledge={setConflictsAcknowledged}
            busy={state.step === "applying"}
            onApply={() => void handleApply()}
          />
        )}

        {state.step === "done" && <Result data={state.data} />}
      </div>
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// Prüfansicht
// ---------------------------------------------------------------------------

function Review({
  data,
  accepted,
  onToggle,
  imageChoice,
  onImageChoice,
  conflictsAcknowledged,
  onAcknowledge,
  busy,
  onApply,
}: {
  data: PriceSheetAnalysis;
  accepted: Set<string>;
  onToggle: (field: string) => void;
  imageChoice: number | null;
  onImageChoice: (value: number | null) => void;
  conflictsAcknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  busy: boolean;
  onApply: () => void;
}) {
  const hasWarnings = data.plausibilityWarnings.length > 0;
  const nothingSelected = accepted.size === 0 && imageChoice === null;
  const blocked = hasWarnings && !conflictsAcknowledged;

  return (
    <div className="space-y-5">
      {/* Verwechslungsschutz: nicht sperrend, aber bewusst zu bestätigen. */}
      {hasWarnings && (
        <div className="border-warning/40 bg-warning/8 rounded-lg border p-4 text-sm">
          <div className="flex gap-3">
            <TriangleAlert
              className="text-warning mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-2">
              {data.plausibilityWarnings.map((warning) => (
                <p key={warning} className="leading-relaxed">
                  {warning}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-3 pl-7">
            <Checkbox
              id="ps-ack"
              checked={conflictsAcknowledged}
              onCheckedChange={(checked) => onAcknowledge(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="ps-ack" className="cursor-pointer text-sm font-normal">
              Ich habe geprüft, dass das Preisblatt zu diesem Fahrzeug gehört.
            </Label>
          </div>
        </div>
      )}

      {data.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm leading-relaxed">
          Das Preisblatt enthält keine Angaben, die von diesem Fahrzeug
          abweichen. Es gibt nichts zu übernehmen.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left">
                <th className="w-10 py-2 pr-3 font-medium">
                  <span className="sr-only">Übernehmen</span>
                </th>
                <th className="py-2 pr-4 font-medium">Feld</th>
                <th className="py-2 pr-4 font-medium">Aktuell</th>
                <th className="py-2 font-medium">Aus dem Preisblatt</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.field} className="border-border/60 border-b align-top">
                  <td className="py-3 pr-3">
                    <Checkbox
                      id={`ps-${entry.field}`}
                      checked={accepted.has(entry.field)}
                      onCheckedChange={() => onToggle(entry.field)}
                      aria-label={`${entry.label} übernehmen`}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Label
                      htmlFor={`ps-${entry.field}`}
                      className="cursor-pointer font-medium"
                    >
                      {entry.label}
                    </Label>
                    {entry.conflict && (
                      <Badge className="bg-warning/15 text-warning-foreground ml-2 border-transparent">
                        weicht ab
                      </Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground py-3 pr-4 whitespace-pre-wrap">
                    {entry.current ?? "leer"}
                  </td>
                  <td className="py-3 whitespace-pre-wrap">{entry.proposed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImageChoice
        data={data}
        imageChoice={imageChoice}
        onImageChoice={onImageChoice}
      />

      {data.droppedDealerParagraphs > 0 && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {data.droppedDealerParagraphs}{" "}
          {data.droppedDealerParagraphs === 1 ? "Absatz" : "Absätze"} des
          Preisblatts wurden als Händlertext ausgeschieden – Begrüßung,
          Finanzierung, Inzahlungnahme und Kontaktdaten beschreiben kein
          Fahrzeug und werden nicht als Beschreibung vorgeschlagen.
        </p>
      )}

      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-5">
        <Button
          variant="brand"
          size="2xl"
          disabled={busy || nothingSelected || blocked}
          title={
            blocked
              ? "Bitte bestätigen Sie zuerst, dass das Preisblatt zu diesem Fahrzeug gehört."
              : nothingSelected
                ? "Es ist nichts zur Übernahme ausgewählt."
                : undefined
          }
          onClick={onApply}
        >
          {busy ? (
            <Loader2
              data-icon="inline-start"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Upload data-icon="inline-start" aria-hidden="true" />
          )}
          {busy ? "Wird übernommen …" : "Ausgewähltes übernehmen"}
        </Button>

        <p className="text-muted-foreground text-sm">
          Bis hierher wurde nichts gespeichert.
        </p>
      </div>
    </div>
  );
}

function ImageChoice({
  data,
  imageChoice,
  onImageChoice,
}: {
  data: PriceSheetAnalysis;
  imageChoice: number | null;
  onImageChoice: (value: number | null) => void;
}) {
  if (data.images.length === 0) {
    return (
      <div className="border-border bg-muted/60 flex gap-3 rounded-lg border p-4 text-sm">
        <ImageOff
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="leading-relaxed">
            Kein geeignetes Fahrzeugbild im Preisblatt erkannt. Sie können
            weiterhin manuell ein Bild hochladen.
          </p>
          {data.imageRejections.length > 0 && (
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
              {data.imageRejections.map((reason) => (
                <li key={reason}>Verworfen: {reason}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <fieldset className="border-border rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Fahrzeugbild</legend>

      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        Wird als erstes Bild übernommen und damit zum Titelbild – das
        Social-Media-Entwürfe verwenden. Bestehende Bilder bleiben erhalten und
        rücken nach hinten.
      </p>

      {/*
        * Preisblätter enthalten regelmäßig fertige Werbegrafiken mit
        * eingebrannter Rate, Laufzeit und Kontaktdaten. Was auf dem Bild steht,
        * lässt sich hier nicht auslesen – dafür bräuchte es eine Texterkennung
        * im Bild, und die wäre für einen Hinweis unverhältnismäßig. Der Hinweis
        * ist deshalb neutral formuliert und steht bei jedem Vorschlag.
        */}
      <div className="border-border bg-muted/60 mb-4 flex gap-3 rounded-lg border p-3 text-xs">
        <TriangleAlert
          className="text-warning mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <p className="leading-relaxed">
          Das erkannte Bild wird als Social-Media-Titelbild verwendet. Bitte
          prüfen Sie eingeblendete Preis-, Finanzierungs- und
          Kontaktinformationen vor der Übernahme.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {data.images.map((image) => {
          const selected = imageChoice === image.objectNumber;

          return (
            <button
              key={image.objectNumber}
              type="button"
              onClick={() => onImageChoice(selected ? null : image.objectNumber)}
              aria-pressed={selected}
              className={cn(
                "rounded-lg border p-2 text-left",
                selected ? "border-brand ring-brand/30 ring-2" : "border-border",
              )}
            >
              <div className="bg-muted relative h-24 w-36 overflow-hidden rounded">
                <Image
                  src={image.previewDataUrl}
                  alt=""
                  fill
                  sizes="144px"
                  unoptimized
                  className="object-contain"
                />
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {image.widthPx} × {image.heightPx} px
                {image.pageWidthPercent !== null &&
                  ` · ${image.pageWidthPercent} % Seitenbreite`}
              </p>
            </button>
          );
        })}
      </div>

      {imageChoice === null && (
        <p className="text-muted-foreground mt-3 text-xs">
          Kein Bild ausgewählt – es wird keines übernommen.
        </p>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

function Result({ data }: { data: ApplyResult }) {
  const nothing = data.appliedFields.length === 0 && !data.imageStored;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex gap-3 rounded-lg border p-4 text-sm",
          nothing ? "border-border bg-muted/60" : "border-success/30 bg-success/8",
        )}
      >
        {nothing ? (
          <FileText
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <CircleCheck
            className="text-success mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
        )}
        <div className="leading-relaxed">
          {nothing ? (
            <p>Es wurde nichts übernommen.</p>
          ) : (
            <>
              {data.appliedFields.length > 0 && (
                <p>Übernommen: {data.appliedFields.join(", ")}.</p>
              )}
              {data.imageStored && (
                <p>Das Fahrzeugbild wurde als Titelbild gespeichert.</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">
                Die Angaben im Formular unten zeigen den neuen Stand nach dem
                Neuladen der Seite.
              </p>
            </>
          )}
        </div>
      </div>

      {data.imageError && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/8 flex gap-3 rounded-lg border p-4 text-sm"
        >
          <TriangleAlert
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="leading-relaxed">
            {data.imageError} Sie können das Bild weiterhin manuell hochladen.
          </p>
        </div>
      )}
    </div>
  );
}
