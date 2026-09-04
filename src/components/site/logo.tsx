import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Wort-Bild-Marke von AutoTal.
 *
 * Das Logo ist eine in sich geschlossene dunkle Platte mit abgerundeten,
 * transparenten Ecken. Dieselbe Datei funktioniert deshalb auf hellem Grund
 * (Kopfzeile) wie auf dunklem (Fußzeile, Anmeldung) – eine zweite Fassung
 * ist nicht nötig.
 *
 * Die Anzeigehöhe kommt über `className` (z. B. `h-11 lg:h-14`), damit sie
 * pro Breakpoint unterschiedlich sein kann. Die Bildmaße bleiben die
 * Originalmaße: Bei 400 px Quellbreite ist die Darstellung selbst auf
 * 3x-Displays noch scharf, solange sie unter ~130 px angezeigt wird.
 */

const LOGO_SRC = "/autotal-logo.webp";
const LOGO_WIDTH = 400;
const LOGO_HEIGHT = 240;

export function Logo({
  name,
  href = "/",
  className,
  priority = false,
  onNavigate,
}: {
  /** Firmenname – Bestandteil des Alternativtexts. */
  name: string;
  href?: string | null;
  /** Steuert die Höhe, z. B. "h-11 lg:h-14". */
  className?: string;
  /** true in der Kopfzeile: Das Logo gehört dort zum ersten Bildaufbau. */
  priority?: boolean;
  onNavigate?: () => void;
}) {
  const image = (
    <Image
      src={LOGO_SRC}
      alt={`${name} – Wähl' das Original`}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      sizes="200px"
      className="h-full w-auto object-contain"
    />
  );

  if (!href) {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        {image}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={`${name} – zur Startseite`}
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {image}
    </Link>
  );
}
