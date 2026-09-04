"use client";

import { useState, useTransition } from "react";
import {
  CircleCheck,
  ExternalLink,
  Info,
  Link2,
  Loader2,
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
import { formatDateTime } from "@/modules/vehicles/labels";

/**
 * Integrationsübersicht: Fahrzeugbörse und Instagram-Verbindung (US-22).
 *
 * Der Fahrzeugbestand wird nicht mehr synchronisiert – er kommt aus dem
 * eingebetteten willhaben-Widget. Es gibt daher weder Sync-Protokoll noch
 * Provider-Auswahl.
 */

type Feedback = { kind: "success" | "error"; message: string } | null;

export function IntegrationsPanel({
  widgetProvider,
  widgetLabel,
  instagram,
  instagramConfigured,
  initialFeedback,
}: {
  widgetProvider: string;
  widgetLabel: string;
  instagram: InstagramConnection;
  instagramConfigured: boolean;
  initialFeedback: Feedback;
}) {
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [pending, startTransition] = useTransition();

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

      {/* --- Fahrzeugbörse ----------------------------------------------- */}
      <AdminCard
        title="Fahrzeugbörse"
        description="Der Fahrzeugbestand wird von willhaben eingebettet und dort gepflegt."
      >
        <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">{widgetLabel}</p>
            <p className="text-muted-foreground mt-0.5 font-mono text-xs">
              {widgetProvider}
            </p>
          </div>
          <Badge className="bg-brand text-brand-foreground border-transparent">
            aktiv
          </Badge>
        </div>

        <p className="text-muted-foreground bg-muted/60 mt-4 flex gap-2.5 rounded-lg p-3.5 text-xs leading-relaxed">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Fahrzeuge werden ausschließlich auf willhaben gepflegt. Änderungen
            dort erscheinen laut Anbieter unmittelbar auf der Website – es gibt
            keine Synchronisierung, keinen Zwischenspeicher und keinen
            API-Zugang. Der Wechsel auf das Carport-Widget betrifft nur die
            Integrationskomponente; siehe README.
          </span>
        </p>
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
