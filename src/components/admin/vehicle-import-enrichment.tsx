"use client";

import { CircleCheck, FileText, Image as ImageIcon, TriangleAlert } from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  EnrichmentEntryDto,
  EnrichmentOptionDto,
  ImportEnrichmentDto,
} from "@/modules/vehicles/import-dto";
import type {
  EnrichmentDecision,
  EnrichmentField,
} from "@/modules/vehicles/import-enrichment";

/**
 * Review der Fahrzeuglisten-PDF: Was ergänzt sie, und bei welchem Fahrzeug?
 *
 * Je Karte aus der PDF eine Entscheidung: welches Fahrzeug, welche Felder,
 * ob das Foto. Sichere Treffer sind vorbelegt und eingeklappt – sie
 * brauchen nur einen Blick. Unsichere Treffer stehen offen und oben: Ohne
 * ausdrückliche Zuordnung passiert dort nichts.
 *
 * Konflikte (Bestand und PDF verschieden) sind eine Wahl mit Vorgabe
 * "Aktuell behalten". Nichts davon wird still überschrieben.
 */

const NONE = "__none__";

/** Vorgabe je Karte: sicherer Treffer mit Vorauswahl, sonst "nicht übernehmen". */
export function defaultDecisions(data: ImportEnrichmentDto): Record<string, EnrichmentDecision> {
  const decisions: Record<string, EnrichmentDecision> = {};
  for (const entry of data.entries) {
    const option = entry.options.find((o) => o.key === entry.defaultKey) ?? null;
    decisions[entry.cardKey] = option
      ? {
          cardKey: entry.cardKey,
          target: option.ref,
          acceptedFields: option.changes.filter((c) => c.preselected).map((c) => c.field),
          useImage: entry.hasImage && option.imagePreselected,
        }
      : { cardKey: entry.cardKey, target: null, acceptedFields: [], useImage: false };
  }
  return decisions;
}

/** Stimmt, wenn irgendeine Entscheidung etwas schreiben würde. */
export function hasEnrichmentWork(decisions: Record<string, EnrichmentDecision>): boolean {
  return Object.values(decisions).some(
    (d) => d.target !== null && (d.acceptedFields.length > 0 || d.useImage),
  );
}

export function EnrichmentReview({
  data,
  decisions,
  onChange,
}: {
  data: ImportEnrichmentDto;
  decisions: Record<string, EnrichmentDecision>;
  onChange: (cardKey: string, decision: EnrichmentDecision) => void;
}) {
  const needsChoice = data.entries.filter((e) => e.matchKind !== "safe" && e.options.length > 0);
  const safe = data.entries.filter((e) => e.matchKind === "safe");
  const nowhere = data.entries.filter((e) => e.matchKind !== "safe" && e.options.length === 0);

  return (
    <AdminCard
      title="Fahrzeugliste (PDF) ergänzt"
      description={`${data.counts.cards} Fahrzeuge in „${data.fileName}“${data.listedAt ? ` vom ${data.listedAt}` : ""}. Die PDF ergänzt technische Daten und Fotos – sie legt keine Fahrzeuge an und löscht nichts.`}
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Sicher zugeordnet" value={data.counts.safe} tone="success" />
        <Stat
          label="Zuordnung nötig"
          value={data.counts.ambiguous + needsChoice.filter((e) => e.matchKind === "unmatched").length}
          tone={data.counts.ambiguous > 0 ? "warning" : undefined}
        />
        <Stat label="Nicht im Bestand" value={nowhere.length} />
      </dl>

      {data.warnings.length > 0 && (
        <ul className="text-muted-foreground mt-4 space-y-1 text-sm">
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {needsChoice.length > 0 && (
        <section className="mt-6">
          <h3 className="font-display mb-3 flex items-center gap-2 text-base font-bold">
            <TriangleAlert className="text-warning size-4" aria-hidden="true" />
            Bitte zuordnen
          </h3>
          <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
            Für diese Fahrzeuge aus der PDF gibt es keinen eindeutigen Treffer im
            Bestand. Ohne Ihre Zuordnung wird nichts übernommen.
          </p>
          <ul className="space-y-3">
            {needsChoice.map((entry) => (
              <li key={entry.cardKey}>
                <EntryCard
                  entry={entry}
                  decision={decisions[entry.cardKey]}
                  onChange={onChange}
                  open
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {safe.length > 0 && (
        <section className="mt-6">
          <h3 className="font-display mb-3 flex items-center gap-2 text-base font-bold">
            <CircleCheck className="text-success size-4" aria-hidden="true" />
            Sicher zugeordnet
          </h3>
          <ul className="space-y-2">
            {safe.map((entry) => (
              <li key={entry.cardKey}>
                <EntryCard
                  entry={entry}
                  decision={decisions[entry.cardKey]}
                  onChange={onChange}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {nowhere.length > 0 && (
        <section className="mt-6">
          <h3 className="font-display mb-2 text-base font-bold">Nicht im Bestand</h3>
          <p className="text-muted-foreground mb-2 text-sm leading-relaxed">
            Diese Fahrzeuge stehen in der PDF, aber weder in der CSV noch im
            Bestand. Sie werden übersprungen – die PDF legt keine Fahrzeuge an.
          </p>
          <ul className="text-muted-foreground space-y-1 text-sm">
            {nowhere.map((entry) => (
              <li key={entry.cardKey}>
                {entry.title}
                {entry.variant ? ` ${entry.variant}` : ""} · {entry.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// Eine Karte
// ---------------------------------------------------------------------------

function EntryCard({
  entry,
  decision,
  onChange,
  open = false,
}: {
  entry: EnrichmentEntryDto;
  decision: EnrichmentDecision | undefined;
  onChange: (cardKey: string, decision: EnrichmentDecision) => void;
  open?: boolean;
}) {
  const current = decision ?? {
    cardKey: entry.cardKey,
    target: null,
    acceptedFields: [],
    useImage: false,
  };
  const selectedKey = current.target ? refKey(current.target) : NONE;
  const option = entry.options.find((o) => o.key === selectedKey) ?? null;

  function selectOption(key: string) {
    const next = entry.options.find((o) => o.key === key) ?? null;
    onChange(entry.cardKey, {
      cardKey: entry.cardKey,
      target: next?.ref ?? null,
      // Beim Wechsel des Ziels gilt wieder die Vorauswahl des neuen Ziels.
      acceptedFields: next ? next.changes.filter((c) => c.preselected).map((c) => c.field) : [],
      useImage: next ? entry.hasImage && next.imagePreselected : false,
    });
  }

  function toggleField(field: EnrichmentField, accepted: boolean) {
    const set = new Set(current.acceptedFields);
    if (accepted) set.add(field);
    else set.delete(field);
    onChange(entry.cardKey, { ...current, acceptedFields: [...set] });
  }

  const summary = summarize(option, current);

  return (
    <details
      open={open}
      className="border-border group rounded-lg border"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">
          {entry.title}
          {entry.variant && (
            <span className="text-muted-foreground font-normal"> {entry.variant}</span>
          )}
        </span>
        <span className="text-muted-foreground tabular">{entry.detail}</span>
        <span
          className={cn(
            "ml-auto text-xs",
            summary.tone === "success" && "text-success",
            summary.tone === "muted" && "text-muted-foreground",
          )}
        >
          {summary.text}
        </span>
      </summary>

      <div className="border-border space-y-4 border-t px-4 py-4 text-sm">
        <div className="space-y-1.5">
          <Label htmlFor={`target-${entry.cardKey}`} className="text-xs">
            Fahrzeug im Bestand
          </Label>
          <Select value={selectedKey} onValueChange={selectOption}>
            <SelectTrigger id={`target-${entry.cardKey}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nicht übernehmen</SelectItem>
              {entry.options.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.title}
                  {o.detail ? ` · ${o.detail}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {entry.warnings.length > 0 && (
          <ul className="text-warning space-y-0.5 text-xs">
            {entry.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {option && (
          <ChangeList
            entryKey={entry.cardKey}
            option={option}
            hasImage={entry.hasImage}
            decision={current}
            onToggleField={toggleField}
            onToggleImage={(useImage) => onChange(entry.cardKey, { ...current, useImage })}
          />
        )}
      </div>
    </details>
  );
}

function refKey(ref: NonNullable<EnrichmentDecision["target"]>): string {
  return ref.kind === "existing" ? `existing:${ref.id}` : `create:${ref.line}`;
}

function summarize(
  option: EnrichmentOptionDto | null,
  decision: EnrichmentDecision,
): { text: string; tone: "success" | "muted" } {
  if (!option || !decision.target) return { text: "wird übersprungen", tone: "muted" };

  const accepted = option.changes.filter(
    (c) => c.kind !== "same" && decision.acceptedFields.includes(c.field),
  );
  const parts = accepted.map((c) => `+ ${c.label}`);
  if (decision.useImage) parts.push("+ Foto");
  if (parts.length === 0) return { text: "keine Änderung", tone: "muted" };
  return { text: parts.join(" · "), tone: "success" };
}

// ---------------------------------------------------------------------------
// Änderungen eines Ziels
// ---------------------------------------------------------------------------

function ChangeList({
  entryKey,
  option,
  hasImage,
  decision,
  onToggleField,
  onToggleImage,
}: {
  entryKey: string;
  option: EnrichmentOptionDto;
  hasImage: boolean;
  decision: EnrichmentDecision;
  onToggleField: (field: EnrichmentField, accepted: boolean) => void;
  onToggleImage: (useImage: boolean) => void;
}) {
  const fills = option.changes.filter((c) => c.kind === "fill" || c.kind === "suggest");
  const conflicts = option.changes.filter((c) => c.kind === "conflict");
  const same = option.changes.filter((c) => c.kind === "same");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-medium">PDF ergänzt</p>
        {fills.length === 0 && !hasImage && (
          <p className="text-muted-foreground text-xs">Nichts zu ergänzen.</p>
        )}
        {fills.map((c) => {
          const id = `${entryKey}-${c.field}`;
          return (
            <label key={c.field} htmlFor={id} className="flex items-start gap-2">
              <input
                id={id}
                type="checkbox"
                className="accent-current mt-0.5 size-4 shrink-0"
                checked={decision.acceptedFields.includes(c.field)}
                onChange={(e) => onToggleField(c.field, e.target.checked)}
              />
              <span>
                {c.label}: <span className="font-medium">{c.proposed}</span>
                {c.kind === "suggest" && (
                  <span className="text-muted-foreground"> · in der PDF gekürzt</span>
                )}
              </span>
            </label>
          );
        })}
        {hasImage && (
          <label htmlFor={`${entryKey}-image`} className="flex items-start gap-2">
            <input
              id={`${entryKey}-image`}
              type="checkbox"
              className="accent-current mt-0.5 size-4 shrink-0"
              checked={decision.useImage}
              onChange={(e) => onToggleImage(e.target.checked)}
            />
            <span className="flex items-center gap-1.5">
              <ImageIcon className="size-3.5" aria-hidden="true" />
              Foto aus der PDF
              <span className="text-muted-foreground">
                {option.imagePreselected ? "· wird Titelbild" : "· wird hinten angefügt"}
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="space-y-3">
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <p className="text-warning text-xs font-medium">Unterschiedlich – bitte wählen</p>
            {conflicts.map((c) => {
              const takePdf = decision.acceptedFields.includes(c.field);
              const name = `${entryKey}-${c.field}`;
              return (
                <fieldset key={c.field} className="border-warning/40 rounded-md border p-2">
                  <legend className="px-1 text-xs font-medium">{c.label}</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={name}
                      className="accent-current size-4"
                      checked={!takePdf}
                      onChange={() => onToggleField(c.field, false)}
                    />
                    <span>
                      Aktuell behalten: <span className="font-medium">{c.current}</span>
                    </span>
                  </label>
                  <label className="mt-1 flex items-center gap-2">
                    <input
                      type="radio"
                      name={name}
                      className="accent-current size-4"
                      checked={takePdf}
                      onChange={() => onToggleField(c.field, true)}
                    />
                    <span>
                      PDF übernehmen: <span className="font-medium">{c.proposed}</span>
                    </span>
                  </label>
                </fieldset>
              );
            })}
          </div>
        )}

        {same.length > 0 && (
          <div>
            <p className="text-muted-foreground text-xs font-medium">Keine Änderung</p>
            <p className="text-muted-foreground tabular text-xs">
              {same.map((c) => `${c.label}: ${c.proposed}`).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  return (
    <div className="border-border rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "font-display tabular mt-0.5 text-xl font-bold",
          tone === "success" && value > 0 && "text-success",
          tone === "warning" && value > 0 && "text-warning-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
