import { Info, TriangleAlert } from "lucide-react";

import { logger } from "@/lib/logger";

import { CarportEmbed, getCarportStatus } from "./carport";
import {
  PROVIDER_LABELS,
  VEHICLE_WIDGET_PROVIDER,
  type VehicleWidgetStatus,
} from "./config";
import { WillhabenLiteEmbed, getWillhabenLiteStatus } from "./willhaben-lite";

/**
 * Die Fahrzeugbörse – einzige Stelle, an der die Website weiß, woher der
 * Fahrzeugbestand kommt.
 *
 * Die Seite /fahrzeuge kennt nur diese Komponente:
 *
 *     /fahrzeuge  ->  VehicleWidget  ->  Widget Lite | Carport
 *
 * Ein Anbieterwechsel betrifft damit `config.ts` und das jeweilige
 * Embed-Modul – nicht die Seite, die Navigation oder das Layout.
 *
 * Der Bestand wird NICHT synchronisiert, nicht zwischengespeichert und nicht
 * ausgelesen: Das Widget lädt seine Daten selbst direkt bei willhaben. Es gibt
 * für diesen Händler keinen API-Zugang, und gescrapt wird nichts.
 */

function resolve(): {
  status: VehicleWidgetStatus;
  Embed: () => React.ReactNode;
} {
  switch (VEHICLE_WIDGET_PROVIDER) {
    case "carport":
      return { status: getCarportStatus(), Embed: CarportEmbed };
    case "willhaben-lite":
    default:
      return { status: getWillhabenLiteStatus(), Embed: WillhabenLiteEmbed };
  }
}

export function VehicleWidget() {
  const { status, Embed } = resolve();
  const label = PROVIDER_LABELS[VEHICLE_WIDGET_PROVIDER];

  if (status === "ready") {
    return (
      /**
       * Der Container gibt nur die Breite vor. Das Widget selbst wird nicht
       * per CSS manipuliert – insbesondere wird nicht versucht, in ein fremdes
       * iframe hineinzugestalten. `overflow-x-auto` sorgt dafür, dass ein zu
       * breites Widget in sich scrollt, statt die ganze Seite horizontal
       * scrollen zu lassen.
       */
      <div
        className="w-full overflow-x-auto"
        data-vehicle-widget={VEHICLE_WIDGET_PROVIDER}
      >
        <Embed />
      </div>
    );
  }

  // Ab hier: Der Einbettungscode fehlt.
  if (process.env.NODE_ENV === "production") {
    // In der Produktion ist das ein Konfigurationsfehler und gehört ins Log –
    // der Besucher bekommt davon nichts zu sehen.
    logger.error(
      "Fahrzeugbörse nicht eingerichtet: Der Einbettungscode fehlt",
      { provider: VEHICLE_WIDGET_PROVIDER },
    );

    return <VisitorNotice />;
  }

  return <DevelopmentPlaceholder label={label} />;
}

/**
 * Was Besucher zu sehen bekommen, wenn das Widget nicht eingerichtet ist.
 * Neutral formuliert, ohne technische Details – und mit einem echten
 * Kontaktweg, damit die Seite nicht in einer Sackgasse endet.
 */
function VisitorNotice() {
  return (
    <div className="border-border bg-muted/40 rounded-xl border border-dashed px-6 py-16 text-center">
      <h2 className="font-display text-xl font-bold">
        Unser Fahrzeugbestand wird gerade aktualisiert
      </h2>
      <p className="text-muted-foreground mx-auto mt-3 max-w-lg leading-relaxed text-pretty">
        Bitte schauen Sie in Kürze noch einmal vorbei – oder rufen Sie uns an.
        Wir sagen Ihnen gerne sofort, welche Fahrzeuge verfügbar sind.
      </p>
    </div>
  );
}

/** Nur in der Entwicklung sichtbar – erklärt, was noch fehlt. */
function DevelopmentPlaceholder({ label }: { label: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-xl border border-dashed p-8">
      <div className="flex gap-3">
        <Info className="text-brand-strong mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-display text-lg font-bold">
            Fahrzeugbörse wird hier eingebunden
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            An dieser Stelle erscheint {label}. Der offizielle Einbettungscode
            von willhaben liegt noch nicht vor und wird bewusst nicht erfunden.
          </p>
        </div>
      </div>

      <div className="border-warning/40 bg-warning/10 mt-6 flex gap-3 rounded-lg border p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="text-sm leading-relaxed">
          <p className="font-medium">Nur in der Entwicklung sichtbar</p>
          <p className="text-muted-foreground mt-1">
            In der Produktion sieht der Besucher stattdessen eine neutrale
            Meldung, und der fehlende Einbettungscode wird als
            Konfigurationsfehler protokolliert.
          </p>
        </div>
      </div>

      <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
        Einzusetzen in{" "}
        <code className="bg-background rounded px-1 py-0.5">
          src/components/integrations/vehicle-widget/willhaben-lite.tsx
        </code>{" "}
        – dort ist die Stelle mit{" "}
        <code className="bg-background rounded px-1 py-0.5">
          TODO: Insert official willhaben Widget Lite embed code here
        </code>{" "}
        markiert.
      </p>
    </div>
  );
}
