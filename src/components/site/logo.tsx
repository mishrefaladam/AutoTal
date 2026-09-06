import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Wortmarke von AutoTal.
 *
 * Bewusst reiner Text statt Bilddatei: schärfer auf jedem Display, kein
 * zusätzlicher Netzwerkabruf, kein Layout-Sprung beim Laden und in jeder
 * Größe frei skalierbar.
 *
 * FARBEN – die Marke passt sich dem Untergrund von selbst an, ohne dass die
 * Aufrufer eine Variante wählen müssen:
 *
 *   "AUTO"  erbt die Textfarbe des Elternelements (`currentColor`). Auf
 *           hellem Grund also dunkel, in der Fußzeile hell.
 *   "TAL"   nutzt `text-wordmark-accent` – EIN fester Orangeton, oben wie
 *           unten identisch. Bewusst nicht `brand-strong`: Das wechselt je
 *           nach Untergrund die Helligkeit, wodurch die Marke im Header
 *           dunkelgold und im Footer hellgold wirkte.
 *
 * GRÖSSE kommt über `className` als Schriftgröße (z. B. "text-2xl lg:text-3xl"),
 * nicht mehr als Höhe – die Marke ist jetzt Typografie, kein Bild.
 *
 * Der Schriftzug selbst ist eine Markenkonstante und stammt deshalb nicht aus
 * den CompanySettings. Der dort gepflegte Name fließt weiterhin in die
 * Beschriftung für Screenreader ein.
 */

const WORDMARK_LEAD = "AUTO";
const WORDMARK_ACCENT = "TAL";

export function Logo({
  name,
  href = "/",
  className,
  onNavigate,
}: {
  /** Firmenname aus den CompanySettings – nur für die Screenreader-Beschriftung. */
  name: string;
  href?: string | null;
  /** Steuert die Schriftgröße, z. B. "text-2xl lg:text-3xl". */
  className?: string;
  onNavigate?: () => void;
}) {
  const wordmark = (
    <span
      // aria-hidden, weil der zugängliche Name vom umgebenden Element kommt:
      // sonst läse ein Screenreader den Schriftzug ein zweites Mal vor.
      aria-hidden="true"
      className="font-display leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap uppercase"
    >
      {WORDMARK_LEAD}
      <span className="text-wordmark-accent">{WORDMARK_ACCENT}</span>
    </span>
  );

  if (!href) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center", className)}
        role="img"
        aria-label={name}
      >
        {wordmark}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={`${name} – zur Startseite`}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {wordmark}
    </Link>
  );
}
