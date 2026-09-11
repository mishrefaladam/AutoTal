"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CircleCheck,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuro, formatKilometers } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  IMPORT_ACTION_LABELS,
  type ImportAction,
  type ImportCommitResponse,
  type ImportPreviewResponse,
} from "@/modules/vehicles/import-dto";

/**
 * Bestandsimport aus CSV.
 *
 * Der Ablauf ist absichtlich zweistufig: Erst zeigt der Server, was er tun
 * würde, dann führt ein zweiter, ausdrücklicher Klick es aus. Ein Import, der
 * beim Auswählen der Datei losläuft, wäre bei einer falschen Datei nicht mehr
 * einzufangen.
 *
 * Für den zweiten Schritt wird dieselbe Datei erneut hochgeladen und
 * serverseitig neu eingelesen. Das ist eine Anfrage mehr, spart aber
 * Zwischenspeicher: Es liegt kein Bestandsauszug irgendwo herum, und die
 * Vorschau kann nicht von dem abweichen, was tatsächlich geschrieben wird.
 *
 * Alle Werte werden als Text ausgegeben – React maskiert sie. Nichts aus der
 * Datei wird als HTML interpretiert.
 */

const ACTION_STYLES: Record<ImportAction, string> = {
  create: "bg-success/12 text-success",
  update: "bg-brand-subtle text-brand-strong",
  unchanged: "bg-muted text-muted-foreground",
};

type State =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "preview"; data: ImportPreviewResponse }
  | { step: "importing"; data: ImportPreviewResponse }
  | { step: "done"; data: ImportCommitResponse };

export function VehicleImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function send(
    selected: File,
    mode: "preview" | "commit",
  ): Promise<ImportPreviewResponse | ImportCommitResponse | null> {
    const body = new FormData();
    body.append("file", selected);
    body.append("mode", mode);

    const response = await fetch("/api/admin/vehicles/import", {
      method: "POST",
      body,
    });

    const result = (await response.json()) as
      | ImportPreviewResponse
      | ImportCommitResponse
      | { error: string };

    if (!response.ok || "error" in result) {
      setError(
        "error" in result ? result.error : "Der Import ist fehlgeschlagen.",
      );
      return null;
    }

    return result;
  }

  async function handleSelect(selected: File | null) {
    setError(null);
    setFile(selected);

    if (!selected) {
      setState({ step: "idle" });
      return;
    }

    setState({ step: "loading" });
    const result = await send(selected, "preview");

    setState(
      result && result.mode === "preview"
        ? { step: "preview", data: result }
        : { step: "idle" },
    );
  }

  async function handleImport() {
    if (!file || state.step !== "preview") return;

    setError(null);
    setState({ step: "importing", data: state.data });

    const result = await send(file, "commit");

    if (result && result.mode === "commit") {
      setState({ step: "done", data: result });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      // Fahrzeugliste und Beitragsassistent zeigen sofort den neuen Stand.
      router.refresh();
    } else {
      setState({ step: "preview", data: state.data });
    }
  }

  const busy = state.step === "loading" || state.step === "importing";

  return (
    <div className="space-y-6">
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

      <AdminCard
        title="CSV-Datei auswählen"
        description="Der Export aus Ihrem Fahrzeugverwaltungssystem. Erwartet werden Spalten wie GW-Nr, FIN, Marke, Modell, Farbe, KM-Stand, Baujahr und Preis – Schreibweise und Reihenfolge sind egal."
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(event) => void handleSelect(event.target.files?.[0] ?? null)}
          className={cn(
            "border-border w-full rounded-lg border border-dashed p-4 text-sm",
            "file:border-border file:bg-muted file:mr-4 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium",
            busy && "opacity-60",
          )}
          aria-label="CSV-Datei mit dem Fahrzeugbestand"
        />

        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          Es wird ausschließlich diese Datei gelesen. Der öffentliche
          Fahrzeugbestand auf der Website kommt weiterhin aus dem
          willhaben-Widget und wird davon nicht berührt.
        </p>

        {state.step === "loading" && (
          <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Datei wird gelesen …
          </p>
        )}
      </AdminCard>

      {(state.step === "preview" || state.step === "importing") && (
        <Preview
          data={state.data}
          busy={state.step === "importing"}
          onImport={() => void handleImport()}
        />
      )}

      {state.step === "done" && <Result data={state.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

function Preview({
  data,
  busy,
  onImport,
}: {
  data: ImportPreviewResponse;
  busy: boolean;
  onImport: () => void;
}) {
  const { counts } = data;
  const nothingToDo = counts.create + counts.update === 0;

  return (
    <>
      <AdminCard
        title="Spaltenzuordnung"
        description={`Erkannt in „${data.fileName}“.`}
      >
        {data.columns.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Es konnte keine Spalte zugeordnet werden.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.columns.map((column) => (
              <li
                key={column.header}
                className="border-border rounded-lg border px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">{column.header}</span>
                <span className="text-muted-foreground mx-1.5">→</span>
                <span className="font-medium">{column.label}</span>
              </li>
            ))}
          </ul>
        )}

        {data.ignoredColumns.length > 0 && (
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            Übersprungen: {data.ignoredColumns.join(", ")}
          </p>
        )}
      </AdminCard>

      <AdminCard title="Das würde der Import tun">
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Zeilen" value={counts.dataRows} />
          <Stat label="Neu" value={counts.create} tone="success" />
          <Stat label="Aktualisiert" value={counts.update} />
          <Stat label="Unverändert" value={counts.unchanged} />
          <Stat
            label="Fehlen in der Datei"
            value={counts.missing}
            tone={counts.missing > 0 ? "warning" : undefined}
          />
        </dl>

        {counts.inactive > 0 && (
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {counts.inactive === 1
              ? "1 Fahrzeug ohne Inserat wird nicht importiert"
              : `${counts.inactive} Fahrzeuge ohne Inserat werden nicht importiert`}
            {" "}– in der Spalte „online auf“ steht bei ihnen nichts. Sind
            solche Fahrzeuge bereits im Bestand, werden sie als fehlend
            markiert.
          </p>
        )}

        <Notices data={data} />

        <div className="border-border mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
          <Button
            variant="brand"
            size="2xl"
            disabled={busy || nothingToDo}
            title={
              nothingToDo
                ? "Diese Datei enthält keine anzulegenden oder zu ändernden Fahrzeuge."
                : undefined
            }
            onClick={onImport}
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
            {busy ? "Import läuft …" : "Import jetzt ausführen"}
          </Button>

          <p className="text-muted-foreground text-sm">
            Bis hierher wurde nichts gespeichert.
          </p>
        </div>
      </AdminCard>

      {data.rows.length > 0 && (
        <AdminCard
          title="Vorschau"
          description={
            data.rows.length < counts.dataRows
              ? `Die ersten ${data.rows.length} von ${counts.dataRows} Zeilen.`
              : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Zeile</th>
                  <th className="py-2 pr-4 font-medium">Fahrzeug</th>
                  <th className="py-2 pr-4 font-medium">GW-Nr / FIN</th>
                  <th className="py-2 pr-4 font-medium">Preis</th>
                  <th className="py-2 pr-4 font-medium">KM</th>
                  <th className="py-2 pr-4 font-medium">Baujahr</th>
                  <th className="py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.line} className="border-border/60 border-b">
                    <td className="text-muted-foreground tabular py-2.5 pr-4">
                      {row.line}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">{row.title}</td>
                    <td className="text-muted-foreground tabular py-2.5 pr-4 text-xs">
                      {row.stockNumber ?? "–"}
                      {row.vin && <div className="mt-0.5">{row.vin}</div>}
                    </td>
                    <td className="tabular py-2.5 pr-4">
                      {/*
                        * Bei einer Preisänderung beide Beträge zeigen. Die
                        * Zahl allein verriete nicht, ob sie neu ist.
                        */}
                      {row.previousPriceCents !== null && (
                        <span className="text-muted-foreground line-through">
                          {formatEuro(row.previousPriceCents)}{" "}
                        </span>
                      )}
                      {row.priceCents === null ? "–" : formatEuro(row.priceCents)}
                    </td>
                    <td className="tabular py-2.5 pr-4">
                      {row.mileageKm === null
                        ? "–"
                        : formatKilometers(row.mileageKm)}
                    </td>
                    <td className="tabular py-2.5 pr-4">{row.year ?? "–"}</td>
                    <td className="py-2.5">
                      <Badge
                        className={cn(
                          "border-transparent",
                          ACTION_STYLES[row.action],
                        )}
                      >
                        {IMPORT_ACTION_LABELS[row.action]}
                      </Badge>
                      {row.changed.length > 0 && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {row.changed.join(", ")}
                        </div>
                      )}
                      {row.warnings.map((warning) => (
                        <div key={warning} className="text-warning mt-1 text-xs">
                          {warning}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </>
  );
}

/**
 * Alles, was der Händler wissen muss, bevor er den Import auslöst.
 *
 * Nichts davon wird zusammengefasst oder ausgeblendet: Eine übersprungene
 * Zeile, die niemand zu sehen bekommt, ist ein stiller Fehler.
 */
function Notices({ data }: { data: ImportPreviewResponse }) {
  const hasNotices =
    data.fileWarnings.length > 0 ||
    data.rowErrors.length > 0 ||
    data.skipped.length > 0 ||
    data.missing.length > 0;

  if (!hasNotices) return null;

  return (
    <div className="mt-5 space-y-3">
      {data.fileWarnings.map((warning) => (
        <NoticeBox key={warning} tone="warning">
          {warning}
        </NoticeBox>
      ))}

      {data.rowErrors.length > 0 && (
        <NoticeBox tone="error" title="Zeilen, die kein Fahrzeug ergeben">
          <ul className="mt-1 space-y-1">
            {data.rowErrors.map((entry) => (
              <li key={entry.line}>
                Zeile {entry.line}: {entry.message}
              </li>
            ))}
          </ul>
        </NoticeBox>
      )}

      {data.skipped.length > 0 && (
        <NoticeBox tone="warning" title="Übersprungene Zeilen">
          <ul className="mt-1 space-y-1">
            {data.skipped.map((entry) => (
              <li key={entry.line}>
                Zeile {entry.line}: {entry.reason}
              </li>
            ))}
          </ul>
        </NoticeBox>
      )}

      {data.missing.length > 0 && (
        <NoticeBox
          tone="warning"
          title={`${data.missing.length} ${
            data.missing.length === 1 ? "Fahrzeug ist" : "Fahrzeuge sind"
          } nicht in dieser Datei`}
        >
          <p className="mt-1 leading-relaxed">
            Sie werden nur zum Prüfen markiert – möglicherweise verkauft,
            offline genommen oder aus dem Bestand entfernt. Der Import löscht
            nichts und setzt nichts auf „verkauft“. Das entscheiden Sie in der
            Fahrzeugverwaltung.
          </p>
          <ul className="mt-2 space-y-1">
            {data.missing.map((entry) => (
              <li key={entry.title}>
                {entry.title}
                {entry.alreadyFlagged && " (schon zuvor markiert)"}
              </li>
            ))}
          </ul>
        </NoticeBox>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

function Result({ data }: { data: ImportCommitResponse }) {
  return (
    <AdminCard
      title="Import abgeschlossen"
      description={`Aus „${data.fileName}“.`}
    >
      <div className="border-success/30 bg-success/8 mb-5 flex gap-3 rounded-lg border p-4 text-sm">
        <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">
          {data.created} neu angelegt, {data.updated} aktualisiert,{" "}
          {data.unchanged} unverändert.
          {data.reappeared > 0 &&
            ` ${data.reappeared} zuvor als fehlend markierte Fahrzeuge sind wieder enthalten.`}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Neu" value={data.created} tone="success" />
        <Stat label="Aktualisiert" value={data.updated} />
        <Stat label="Unverändert" value={data.unchanged} />
        <Stat
          label="Als fehlend markiert"
          value={data.markedMissing}
          tone={data.markedMissing > 0 ? "warning" : undefined}
        />
        <Stat
          label="Übersprungen"
          value={data.skipped + data.rowErrors}
          tone={data.skipped + data.rowErrors > 0 ? "warning" : undefined}
        />
      </dl>

      {data.inactive > 0 && (
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {data.inactive === 1
            ? "1 Fahrzeug ohne Inserat wurde nicht importiert."
            : `${data.inactive} Fahrzeuge ohne Inserat wurden nicht importiert.`}
        </p>
      )}

      {data.failures.length > 0 && (
        <div className="mt-5">
          <NoticeBox tone="error" title="Nicht gespeichert">
            <ul className="mt-1 space-y-1">
              {data.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          </NoticeBox>
        </div>
      )}

      <div className="border-border mt-6 flex flex-wrap gap-3 border-t pt-5">
        <Button asChild variant="brand" size="xl">
          <Link href="/admin/fahrzeuge">Zur Fahrzeugverwaltung</Link>
        </Button>
        <Button asChild variant="outline" size="xl">
          <Link href="/admin/social-media">Beitrag erstellen</Link>
        </Button>
      </div>

      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
        Bilder bringt der Import nicht mit – die laden Sie beim jeweiligen
        Fahrzeug hoch. Für KI-Textvorschläge ist das nicht nötig; für die
        Veröffentlichung auf Instagram schon.
      </p>
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

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
          "tabular mt-1 text-xl font-bold",
          tone === "success" && value > 0 && "text-success",
          tone === "warning" && value > 0 && "text-warning",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function NoticeBox({
  tone,
  title,
  children,
}: {
  tone: "warning" | "error";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm leading-relaxed",
        tone === "error"
          ? "border-destructive/30 bg-destructive/8"
          : "border-border bg-muted/60",
      )}
    >
      {tone === "error" ? (
        <TriangleAlert
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <FileSpreadsheet
          className="text-warning mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}
