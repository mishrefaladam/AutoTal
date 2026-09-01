"use client";

import { useState, useTransition } from "react";
import {
  CircleCheck,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Unlink,
} from "lucide-react";

import { AdminCard } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InstagramConnection } from "@/integrations/instagram";
import {
  disconnectInstagramAction,
  startInstagramConnect,
} from "@/modules/social/instagram-actions";
import { triggerVehicleSync } from "@/modules/vehicles/sync-action";
import { formatDateTime } from "@/modules/vehicles/labels";

/**
 * Integrationsübersicht: Fahrzeugquelle, Sync-Protokoll (US-27) und
 * Instagram-Verbindung (US-22).
 */

type ProviderInfo = {
  key: string;
  label: string;
  source: string;
  configured: boolean;
  active: boolean;
};

type SyncRunView = {
  id: string;
  source: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: Date;
  finishedAt: Date | null;
  vehiclesFound: number;
  vehiclesCreated: number;
  vehiclesUpdated: number;
  vehiclesDeactivated: number;
  errorMessage: string | null;
  triggeredBy: string;
};

const SYNC_STATUS: Record<
  SyncRunView["status"],
  { label: string; className: string }
> = {
  RUNNING: { label: "Läuft", className: "bg-muted text-muted-foreground" },
  SUCCESS: { label: "Erfolgreich", className: "bg-success/12 text-success" },
  PARTIAL: { label: "Teilweise", className: "bg-warning/15 text-warning-foreground" },
  FAILED: { label: "Fehlgeschlagen", className: "bg-destructive/12 text-destructive" },
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "manuell",
  cron: "geplant",
  cli: "Kommandozeile",
  seed: "Seed",
};

type Feedback = { kind: "success" | "error"; message: string } | null;

export function IntegrationsPanel({
  providers,
  syncRuns,
  instagram,
  instagramConfigured,
  initialFeedback,
}: {
  providers: ProviderInfo[];
  syncRuns: SyncRunView[];
  instagram: InstagramConnection;
  instagramConfigured: boolean;
  initialFeedback: Feedback;
}) {
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [pending, startTransition] = useTransition();

  const activeProvider = providers.find((provider) => provider.active);

  function handleSync() {
    setFeedback(null);
    startTransition(async () => {
      const result = await triggerVehicleSync();
      setFeedback(
        result.ok
          ? { kind: "success", message: result.data.message }
          : { kind: "error", message: result.error },
      );
    });
  }

  function handleConnect() {
    setFeedback(null);
    startTransition(async () => {
      const result = await startInstagramConnect();

      if (result.ok) {
        // Weiterleitung zum Meta-Anmeldedialog.
        window.location.href = result.data.authUrl;
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  }

  function handleDisconnect() {
    setFeedback(null);
    startTransition(async () => {
      const result = await disconnectInstagramAction();
      setFeedback(
        result.ok
          ? { kind: "success", message: result.data.message }
          : { kind: "error", message: result.error },
      );
    });
  }

  return (
    <div className="space-y-8">
      {feedback && (
        <div
          role={feedback.kind === "success" ? "status" : "alert"}
          className={cn(
            "flex gap-3 rounded-lg border p-4 text-sm leading-relaxed",
            feedback.kind === "success"
              ? "border-success/30 bg-success/8"
              : "border-destructive/30 bg-destructive/8",
          )}
        >
          {feedback.kind === "success" ? (
            <CircleCheck
              className="text-success mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <TriangleAlert
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <p>{feedback.message}</p>
        </div>
      )}

      {/* --- Fahrzeugquelle ---------------------------------------------- */}
      <AdminCard
        title="Fahrzeugquelle"
        description="Woher der Fahrzeugbestand kommt. Umgestellt wird über die Umgebungsvariable VEHICLE_PROVIDER."
        action={
          <Button
            variant="brand"
            size="xl"
            onClick={handleSync}
            disabled={pending}
          >
            {pending ? (
              <Loader2
                data-icon="inline-start"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw data-icon="inline-start" aria-hidden="true" />
            )}
            {pending ? "Läuft …" : "Jetzt synchronisieren"}
          </Button>
        }
      >
        <ul className="space-y-3">
          {providers.map((provider) => (
            <li
              key={provider.key}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
                provider.active
                  ? "border-brand/40 bg-brand-subtle/40"
                  : "border-border",
              )}
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {provider.label}
                  {provider.active && (
                    <Badge className="bg-brand text-brand-foreground border-transparent">
                      aktiv
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                  VEHICLE_PROVIDER=&quot;{provider.key}&quot;
                </p>
              </div>

              <Badge
                variant="secondary"
                className={cn(
                  provider.configured
                    ? "bg-success/12 text-success border-transparent"
                    : "bg-muted text-muted-foreground border-transparent",
                )}
              >
                {provider.configured ? "einsatzbereit" : "nicht eingerichtet"}
              </Badge>
            </li>
          ))}
        </ul>

        {activeProvider && !activeProvider.configured && (
          <p className="text-muted-foreground bg-muted/60 mt-4 flex gap-2.5 rounded-lg p-3.5 text-xs leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Der aktive Anbieter „{activeProvider.label}“ ist noch nicht
              angebunden. Solange keine offizielle Schnittstellendokumentation
              und keine Zugangsdaten vorliegen, liefert er keine Fahrzeuge.
              Setzen Sie VEHICLE_PROVIDER auf „mock“, um mit Testdaten zu
              arbeiten.
            </span>
          </p>
        )}
      </AdminCard>

      {/* --- Sync-Protokoll (US-27) --------------------------------------- */}
      <AdminCard
        title="Synchronisierungsprotokoll"
        description="Die letzten Läufe mit Zeitpunkt, Ergebnis und aufgetretenen Fehlern."
      >
        {syncRuns.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Bisher wurde noch keine Synchronisierung durchgeführt.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Protokoll der Fahrzeugsynchronisierungen
              </caption>
              <thead>
                <tr className="border-border text-muted-foreground border-b text-left">
                  <th scope="col" className="pb-2.5 pr-4 font-medium">
                    Zeitpunkt
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 font-medium">
                    Quelle
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 text-right font-medium">
                    Gefunden
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 text-right font-medium">
                    Neu
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 text-right font-medium">
                    Aktualisiert
                  </th>
                  <th scope="col" className="pb-2.5 text-right font-medium">
                    Deaktiviert
                  </th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => {
                  const status = SYNC_STATUS[run.status];

                  return (
                    <tr key={run.id} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4 align-top">
                        <span className="tabular whitespace-nowrap">
                          {formatDateTime(run.startedAt)}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {TRIGGER_LABELS[run.triggeredBy] ?? run.triggeredBy}
                        </span>
                      </td>

                      <td className="py-3 pr-4 align-top">
                        <Badge
                          className={cn("border-transparent", status.className)}
                        >
                          {status.label}
                        </Badge>

                        {run.errorMessage && (
                          <p className="text-destructive mt-1.5 max-w-md text-xs leading-relaxed">
                            {run.errorMessage}
                          </p>
                        )}
                      </td>

                      <td className="text-muted-foreground py-3 pr-4 align-top font-mono text-xs">
                        {run.source}
                      </td>

                      <td className="tabular py-3 pr-4 text-right align-top">
                        {run.vehiclesFound}
                      </td>
                      <td className="tabular py-3 pr-4 text-right align-top">
                        {run.vehiclesCreated}
                      </td>
                      <td className="tabular py-3 pr-4 text-right align-top">
                        {run.vehiclesUpdated}
                      </td>
                      <td className="tabular py-3 text-right align-top">
                        {run.vehiclesDeactivated}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* --- Instagram (US-22) -------------------------------------------- */}
      <AdminCard
        title="Instagram"
        description="Verbindung zum geschäftlichen Instagram-Konto für die Veröffentlichung von Beiträgen."
      >
        {!instagramConfigured ? (
          <div className="border-border bg-muted/60 flex gap-3 rounded-lg border p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="leading-relaxed">
              <p className="font-medium">Noch nicht eingerichtet</p>
              <p className="text-muted-foreground mt-1">
                Es fehlen die Umgebungsvariablen{" "}
                <code className="bg-background rounded px-1 py-0.5 text-xs">
                  INSTAGRAM_APP_ID
                </code>
                ,{" "}
                <code className="bg-background rounded px-1 py-0.5 text-xs">
                  INSTAGRAM_APP_SECRET
                </code>{" "}
                und{" "}
                <code className="bg-background rounded px-1 py-0.5 text-xs">
                  INSTAGRAM_REDIRECT_URI
                </code>
                . Eine Anleitung steht in{" "}
                <code className="bg-background rounded px-1 py-0.5 text-xs">
                  src/integrations/instagram/README.md
                </code>
                .
              </p>
            </div>
          </div>
        ) : instagram.connected ? (
          <div className="space-y-4">
            <div className="border-success/30 bg-success/8 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <CircleCheck
                  className="text-success size-5 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {instagram.username
                      ? `@${instagram.username}`
                      : "Konto verbunden"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {instagram.expiresAt
                      ? `Zugang gültig bis ${formatDateTime(instagram.expiresAt)}`
                      : "Zugang ohne Ablaufdatum"}
                  </p>
                </div>
              </div>

              <Button
                variant="destructive"
                size="xl"
                onClick={handleDisconnect}
                disabled={pending}
              >
                <Unlink data-icon="inline-start" aria-hidden="true" />
                Verbindung trennen
              </Button>
            </div>

            {instagram.expiringSoon && (
              <p className="border-warning/40 bg-warning/10 flex gap-2.5 rounded-lg border p-3.5 text-sm leading-relaxed">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Der Zugang läuft in weniger als sieben Tagen ab. Verbinden Sie
                  das Konto rechtzeitig neu, sonst schlagen Veröffentlichungen
                  fehl.
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Es ist noch kein Konto verbunden. Für die Veröffentlichung wird
              ein Instagram-<strong>Business</strong>- oder Creator-Konto
              benötigt, das mit einer Facebook-Seite verknüpft ist. Für
              Privatkonten stellt Meta keine Veröffentlichungs-Schnittstelle
              bereit.
            </p>

            <Button
              variant="brand"
              size="2xl"
              onClick={handleConnect}
              disabled={pending}
            >
              {pending ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Link2 data-icon="inline-start" aria-hidden="true" />
              )}
              Instagram-Konto verbinden
            </Button>

            <p className="text-muted-foreground flex gap-2 text-xs">
              <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Sie werden zu Facebook weitergeleitet und danach hierher
              zurückgeführt.
            </p>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
