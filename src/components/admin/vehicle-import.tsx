"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  CircleCheck,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import {
  EnrichmentReview,
  defaultDecisions,
  hasEnrichmentWork,
} from "@/components/admin/vehicle-import-enrichment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuro, formatKilometers } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  IMPORT_ACTION_LABELS,
  MAX_IMPORT_REQUEST_BYTES,
  MAX_LIST_PDF_BYTES,
  MAX_LIST_PDF_DIRECT_BYTES,
  type ImportAction,
  type ListPdfReference,
  type ImportCommitResponse,
  type ImportPreviewResponse,
} from "@/modules/vehicles/import-dto";
import type { EnrichmentDecision } from "@/modules/vehicles/import-enrichment";

/**
 * Fahrzeugbestand aktualisieren: CSV als Basis, PDF als Ergänzung.
 *
 *   1. CSV hochladen – der Bestand aus dem Händlersystem.
 *   2. Optional die Fahrzeuglisten-PDF – technische Daten und Fotos.
 *   3. Prüfen: Was die CSV tut, was die PDF ergänzt, wo eine Zuordnung nötig ist.
 *   4. Bestätigen.
 *
 * Der Ablauf ist absichtlich zweistufig: Erst zeigt der Server, was er tun
 * würde, dann führt ein zweiter, ausdrücklicher Klick es aus. Ein Import, der
 * beim Auswählen der Datei losläuft, wäre bei einer falschen Datei nicht mehr
 * einzufangen.
 *
 * Für den zweiten Schritt werden dieselben Dateien erneut hochgeladen und
 * serverseitig neu eingelesen; die Entscheidungen aus dem Review gehen als
 * JSON mit. Das ist eine Anfrage mehr, spart aber Zwischenspeicher: Es liegt
 * kein Bestandsauszug irgendwo herum, und die Vorschau kann nicht von dem
 * abweichen, was tatsächlich geschrieben wird.
 *
 * Alle Werte werden als Text ausgegeben – React maskiert sie. Nichts aus der
 * Datei wird als HTML interpretiert.
 */

const ACTION_STYLES: Record<ImportAction, string> = {
  create: "bg-success/12 text-success",
  update: "bg-brand-subtle text-brand-strong",
  unchanged: "bg-muted text-muted-foreground",
};

/**
 * Wo eine laufende Anfrage gerade steht.
 *
 * "uploading" trägt echte Zahlen: Der Browser meldet, wie viele Bytes er
 * übertragen hat. "analyzing" beginnt, sobald alles hochgeladen ist und der
 * Server arbeitet – das ist ein Zustand, kein Fortschritt; einen Prozentwert
 * gäbe es dafür nur erfunden.
 */
type Phase =
  | { kind: "uploading"; what: "pdf" | "request"; sent: number; total: number; withPdf: boolean }
  | { kind: "analyzing"; withPdf: boolean };

/**
 * Die gewählte Fahrzeugliste.
 *
 * In Produktion liegt sie nach dem direkten Upload im Blob-Store; die
 * Anwendung kennt nur noch den Pfad. Ohne Blob-Token (lokal) geht die Datei
 * den alten Weg im Request – dann gilt dort das Function-Limit.
 */
type PdfSelection =
  | { kind: "blob"; ref: ListPdfReference }
  | { kind: "file"; file: File };

const UPLOAD_ROUTE = "/api/admin/vehicles/import/upload";

/** Ab dieser Größe lädt das SDK in Teilen – robuster bei wackliger Leitung. */
const MULTIPART_FROM_BYTES = 5 * 1024 * 1024;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

type State =
  | { step: "idle" }
  | { step: "loading"; phase: Phase }
  | { step: "preview"; data: ImportPreviewResponse }
  | { step: "importing"; data: ImportPreviewResponse; phase: Phase }
  | { step: "done"; data: ImportCommitResponse };

/** Ab wann der Hinweis erscheint, dass es noch dauert. */
const SLOW_HINT_AFTER_MS = 15_000;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Was der Server bei der Verarbeitung antwortet – oder eben nicht. */
type ImportResponse = ImportPreviewResponse | ImportCommitResponse | { error: string };

/**
 * Anfrage per XMLHttpRequest statt fetch: Nur so meldet der Browser den
 * Upload-Fortschritt. Für eine mehrere Megabyte große PDF ist das Hochladen
 * der längste Teil – ohne diese Zahl sähe der Nutzer nur einen Spinner.
 *
 * Eine Antwort, die kein JSON ist (etwa ein Plattform-Fehler wie 413 als
 * Klartext), wird zu einer lesbaren Meldung – nie zu einem Hänger.
 */
function sendImportRequest(
  body: FormData,
  onProgress: (sent: number, total: number) => void,
  onUploaded: () => void,
): Promise<{ ok: boolean; status: number; result: ImportResponse }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/vehicles/import");
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.upload.onload = () => onUploaded();

    xhr.onerror = () =>
      resolve({
        ok: false,
        status: 0,
        result: {
          error:
            "Die Verbindung ist abgebrochen. Bitte prüfen Sie das Netzwerk und " +
            "versuchen Sie es erneut.",
        },
      });

    xhr.onload = () => {
      let result: ImportResponse;
      try {
        result = JSON.parse(xhr.responseText) as ImportResponse;
      } catch {
        result = {
          error:
            xhr.status === 413
              ? "Die Dateien sind zusammen zu groß für einen Upload (Grenze 4,5 MB)."
              : xhr.status >= 500
                ? "Der Server hat nicht geantwortet. Bitte versuchen Sie es in einem Moment erneut."
                : `Unerwartete Antwort des Servers (HTTP ${xhr.status}).`,
        };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, result });
    };

    xhr.send(body);
  });
}

export function VehicleImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PdfSelection | null>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  /** Entscheidungen des PDF-Reviews, je Karte. */
  const [decisions, setDecisions] = useState<Record<string, EnrichmentDecision>>({});

  /**
   * Prüft die Größen vor dem Hochladen. Ein 413 der Plattform käme erst nach
   * dem vollständigen Upload – und als Klartext, nicht als Antwort der
   * Anwendung. Besser gar nicht erst losschicken.
   */
  function sizeProblem(selected: File, selection: PdfSelection | null): string | null {
    // Eine direkt hochgeladene PDF ist nicht Teil des Requests – nur der
    // Rückfall ohne Blob-Speicher unterliegt dem Function-Limit.
    const inRequest = selection?.kind === "file" ? selection.file.size : 0;
    if (selection?.kind === "file" && inRequest > MAX_LIST_PDF_BYTES) {
      return (
        `Die Fahrzeugliste ist ${formatMegabytes(inRequest)} groß; ohne Blob-Speicher ` +
        `können höchstens ${formatMegabytes(MAX_LIST_PDF_BYTES)} im Request übertragen werden.`
      );
    }
    if (selected.size + inRequest > MAX_IMPORT_REQUEST_BYTES) {
      return (
        `CSV und PDF sind zusammen ${formatMegabytes(selected.size + inRequest)} ` +
        "groß – mehr als in einem Upload möglich ist (4,5 MB)."
      );
    }
    return null;
  }

  async function send(
    selected: File,
    selection: PdfSelection | null,
    mode: "preview" | "commit",
    setPhase: (phase: Phase) => void,
  ): Promise<ImportPreviewResponse | ImportCommitResponse | null> {
    const problem = sizeProblem(selected, selection);
    if (problem) {
      setError(problem);
      return null;
    }

    // Die PDF geht nie mit: Entweder liegt sie schon im Blob-Store (nur der
    // Pfad wird genannt), oder – ohne Blob-Speicher – als Datei im Request.
    const body = new FormData();
    body.append("file", selected);
    if (selection?.kind === "blob") body.append("pdfRef", selection.ref.pathname);
    if (selection?.kind === "file") body.append("pdf", selection.file);
    if (mode === "commit") {
      body.append("decisions", JSON.stringify(Object.values(decisions)));
    }
    body.append("mode", mode);

    const withPdf = selection !== null;
    const total = selected.size + (selection?.kind === "file" ? selection.file.size : 0);
    setPhase({ kind: "uploading", what: "request", sent: 0, total, withPdf });

    const { ok, result } = await sendImportRequest(
      body,
      (sent, total) => setPhase({ kind: "uploading", what: "request", sent, total, withPdf }),
      () => setPhase({ kind: "analyzing", withPdf }),
    );

    if (!ok || "error" in result) {
      setError("error" in result ? result.error : "Der Import ist fehlgeschlagen.");
      return null;
    }

    return result;
  }

  /** Vorschau neu laden – nach jeder Dateiänderung, CSV wie PDF. */
  async function refreshPreview(selected: File | null, selection: PdfSelection | null) {
    setError(null);

    if (!selected) {
      setState({ step: "idle" });
      setDecisions({});
      return;
    }

    const withPdf = selection !== null;
    setState({
      step: "loading",
      phase: { kind: "uploading", what: "request", sent: 0, total: 0, withPdf },
    });
    const result = await send(selected, selection, "preview", (phase) =>
      setState({ step: "loading", phase }),
    );

    if (result && result.mode === "preview") {
      setState({ step: "preview", data: result });
      setDecisions(result.enrichment ? defaultDecisions(result.enrichment) : {});
    } else {
      setState({ step: "idle" });
      setDecisions({});
    }
  }

  function handleSelect(selected: File | null) {
    setFile(selected);
    void refreshPreview(selected, pdf);
  }

  /**
   * Fahrzeugliste gewählt: prüfen, direkt nach Vercel Blob laden, dann die
   * Vorschau mit dem Pfad neu laden. Scheitert der Upload, endet der
   * Ladezustand mit einer Meldung – nie mit einem ewigen Spinner.
   */
  async function handleSelectPdf(selected: File | null) {
    if (!selected) {
      setPdf(null);
      if (file) void refreshPreview(file, null);
      return;
    }
    if (!file) return;

    setError(null);
    if (!isPdfFile(selected)) {
      setError("Bitte eine PDF-Datei auswählen.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    if (selected.size > MAX_LIST_PDF_DIRECT_BYTES) {
      setError(
        `Die Fahrzeugliste ist ${formatMegabytes(selected.size)} groß; möglich sind ` +
          `höchstens ${formatMegabytes(MAX_LIST_PDF_DIRECT_BYTES)}.`,
      );
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    const previous = state.step === "preview" ? state : null;
    const restore = () =>
      setState(previous ?? { step: "idle" });

    let selection: PdfSelection;
    try {
      const availability = (await (await fetch(UPLOAD_ROUTE)).json()) as {
        directUpload?: boolean;
        error?: string;
      };
      if (availability.error) throw new Error(availability.error);

      if (availability.directUpload) {
        setState({
          step: "loading",
          phase: { kind: "uploading", what: "pdf", sent: 0, total: selected.size, withPdf: true },
        });
        const result = await upload(
          `temp/vehicle-imports/${crypto.randomUUID()}.pdf`,
          selected,
          {
            access: "public",
            handleUploadUrl: UPLOAD_ROUTE,
            contentType: "application/pdf",
            multipart: selected.size > MULTIPART_FROM_BYTES,
            onUploadProgress: ({ loaded, total }) =>
              setState({
                step: "loading",
                phase: { kind: "uploading", what: "pdf", sent: loaded, total, withPdf: true },
              }),
          },
        );
        selection = {
          kind: "blob",
          ref: { pathname: result.pathname, name: selected.name, size: selected.size },
        };
      } else {
        selection = { kind: "file", file: selected };
      }
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? `Die Fahrzeugliste konnte nicht hochgeladen werden: ${cause.message}`
          : "Die Fahrzeugliste konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.",
      );
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      restore();
      return;
    }

    setPdf(selection);
    void refreshPreview(file, selection);
  }

  /** "PDF entfernen": die temporäre Datei gleich mit wegräumen. */
  function clearPdf() {
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (pdf?.kind === "blob") {
      void fetch(`${UPLOAD_ROUTE}?ref=${encodeURIComponent(pdf.ref.pathname)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    void handleSelectPdf(null);
  }

  async function handleImport() {
    if (!file || state.step !== "preview") return;

    setError(null);
    const data = state.data;
    const withPdf = pdf !== null;
    setState({
      step: "importing",
      data,
      phase: { kind: "uploading", what: "request", sent: 0, total: 0, withPdf },
    });

    // Dieselbe Blob-Datei wie in der Vorschau – kein zweiter Upload. Nach
    // erfolgreichem Schreiben löscht der Server sie; bei Fehlern bleibt sie
    // für einen erneuten Versuch.
    const result = await send(file, pdf, "commit", (phase) =>
      setState({ step: "importing", data, phase }),
    );

    if (result && result.mode === "commit") {
      setState({ step: "done", data: result });
      setFile(null);
      setPdf(null);
      setDecisions({});
      if (inputRef.current) inputRef.current.value = "";
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      // Fahrzeugliste und Beitragsassistent zeigen sofort den neuen Stand.
      router.refresh();
    } else {
      setState({ step: "preview", data: state.data });
    }
  }

  const busy = state.step === "loading" || state.step === "importing";
  const enrichmentWork = hasEnrichmentWork(decisions);

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
        title="Schritt 1 · Fahrzeugbestand (CSV)"
        description="Der Export aus Ihrem Fahrzeugverwaltungssystem. Erwartet werden Spalten wie GW-Nr, FIN, Marke, Modell, Farbe, KM-Stand, Baujahr und Preis – Schreibweise und Reihenfolge sind egal."
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(event) => handleSelect(event.target.files?.[0] ?? null)}
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

      </AdminCard>

      {/*
        * Die PDF ist eine Ergänzung, keine zweite Quelle: Sie legt nichts an.
        * Deshalb erst wählbar, wenn die CSV da ist – ohne Bestand gibt es
        * nichts zu ergänzen.
        */}
      <AdminCard
        title="Schritt 2 · Fahrzeugliste (PDF), optional"
        description="Die CSV enthält den Fahrzeugbestand. Eine zusätzliche Fahrzeuglisten-PDF („Unser Fahrzeugbestand vom …“) kann technische Daten wie Leistung, Hubraum und Antrieb sowie Fotos ergänzen."
      >
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,application/pdf"
          disabled={busy || !file}
          onChange={(event) => void handleSelectPdf(event.target.files?.[0] ?? null)}
          className={cn(
            "border-border w-full rounded-lg border border-dashed p-4 text-sm",
            "file:border-border file:bg-muted file:mr-4 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium",
            (busy || !file) && "opacity-60",
          )}
          aria-label="Fahrzeuglisten-PDF (optional)"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {!file
              ? "Bitte zuerst die CSV auswählen."
              : pdf
                ? `„${pdf.kind === "blob" ? pdf.ref.name : pdf.file.name}“ wird mit der CSV zusammengeführt. Was die PDF ergänzt, sehen Sie unten – nichts davon wird ohne Ihre Prüfung übernommen.`
                : "Ohne PDF läuft der Import wie bisher, nur mit der CSV."}
          </p>
          {pdf && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearPdf}>
              PDF entfernen
            </Button>
          )}
        </div>

        {state.step === "loading" && <ProgressNotice phase={state.phase} />}
      </AdminCard>

      {(state.step === "preview" || state.step === "importing") && (
        <>
          <Preview data={state.data} />

          {state.data.enrichment && (
            <EnrichmentReview
              data={state.data.enrichment}
              decisions={decisions}
              onChange={(cardKey, decision) =>
                setDecisions((current) => ({ ...current, [cardKey]: decision }))
              }
            />
          )}

          <ConfirmStep
            data={state.data}
            busy={state.step === "importing"}
            phase={state.step === "importing" ? state.phase : null}
            enrichmentWork={enrichmentWork}
            onImport={() => void handleImport()}
          />
        </>
      )}

      {state.step === "done" && <Result data={state.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fortschritt
// ---------------------------------------------------------------------------

/**
 * Was gerade passiert – in Worten, die der Händler versteht.
 *
 * Beim Hochladen stehen echte Zahlen dabei. Danach arbeitet der Server:
 * Fahrzeuge erkennen, zuordnen, Vorschau vorbereiten. Das dauert lokal
 * gemessen unter einer Zehntelsekunde und wird deshalb als ein Schritt
 * gezeigt; drei nacheinander aufleuchtende Zeilen wären Theater. Dauert es
 * dennoch, sagt ein Hinweis nach 15 Sekunden, dass noch gearbeitet wird.
 */
function ProgressNotice({ phase }: { phase: Phase }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  let text: string;
  if (phase.kind === "uploading") {
    const what = phase.what === "pdf" ? "Fahrzeugliste wird hochgeladen" : "CSV wird hochgeladen";
    text =
      phase.total > 0
        ? `${what} … ${formatMegabytes(phase.sent)} von ${formatMegabytes(phase.total)}`
        : `${what} …`;
  } else {
    text = phase.withPdf
      ? "Fahrzeugliste wird analysiert – Fahrzeuge erkennen, zuordnen, Vorschau vorbereiten …"
      : "CSV wird gelesen und mit dem Bestand abgeglichen …";
  }

  return (
    <div className="mt-4 space-y-1.5" role="status" aria-live="polite">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {text}
      </p>
      {slow && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Die Fahrzeugliste wird noch verarbeitet. Bei größeren PDFs kann dies
          einen Moment dauern.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schritt 4: Bestätigen
// ---------------------------------------------------------------------------

function ConfirmStep({
  data,
  busy,
  phase,
  enrichmentWork,
  onImport,
}: {
  data: ImportPreviewResponse;
  busy: boolean;
  phase: Phase | null;
  enrichmentWork: boolean;
  onImport: () => void;
}) {
  const { counts } = data;
  const nothingToDo = counts.create + counts.update === 0 && !enrichmentWork;

  return (
    <AdminCard title="Schritt 4 · Bestätigen">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="brand"
          size="2xl"
          disabled={busy || nothingToDo}
          title={
            nothingToDo
              ? "Es gibt nichts anzulegen, zu ändern oder zu ergänzen."
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
          {busy ? "Import läuft …" : "Bestand jetzt aktualisieren"}
        </Button>

        <p className="text-muted-foreground text-sm">
          Bis hierher wurde nichts gespeichert.
        </p>
      </div>

      {phase && <ProgressNotice phase={phase} />}
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

function Preview({ data }: { data: ImportPreviewResponse }) {
  const { counts } = data;

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

      <AdminCard title="Schritt 3 · Prüfen: Das würde die CSV tun">
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

      {(data.enriched > 0 || data.imagesStored > 0) && (
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Aus der Fahrzeugliste ergänzt:{" "}
          {data.enriched === 1 ? "1 Fahrzeug" : `${data.enriched} Fahrzeuge`}
          {data.imagesStored > 0 &&
            `, ${data.imagesStored === 1 ? "1 Foto" : `${data.imagesStored} Fotos`} gespeichert`}
          .
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
