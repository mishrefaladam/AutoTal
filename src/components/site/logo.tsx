import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Wortmarke mit Signet.
 *
 * Bewusst als Inline-SVG statt als Bilddatei: skaliert scharf, erbt die
 * Textfarbe (funktioniert damit auf hellem wie auf dunklem Grund) und
 * verursacht keinen zusätzlichen Request.
 *
 * TODO(design): Sobald ein echtes Logo vorliegt, dieses Signet ersetzen.
 */
export function Logo({
  name,
  href = "/",
  className,
  onNavigate,
}: {
  name: string;
  href?: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      aria-label={`${name} – zur Startseite`}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="size-8 shrink-0"
        fill="none"
      >
        <rect
          width="32"
          height="32"
          rx="9"
          className="fill-current opacity-[0.08]"
        />
        {/* Stilisierte Fahrzeugsilhouette */}
        <path
          d="M6.5 19.5h19M9 19.5v1.75a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V19.5m17 0v1.75a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V19.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6.5 19.5v-3.2a2 2 0 0 1 .35-1.13l2.63-3.86A3 3 0 0 1 11.96 10h8.08a3 3 0 0 1 2.48 1.31l2.63 3.86a2 2 0 0 1 .35 1.13v3.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="19.5" r="1.6" className="fill-brand" />
        <circle cx="21" cy="19.5" r="1.6" className="fill-brand" />
      </svg>

      <span className="font-display text-[1.0625rem] font-bold tracking-tight">
        {name}
      </span>
    </Link>
  );
}
