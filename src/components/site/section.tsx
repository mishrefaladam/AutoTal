import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Einheitlicher Seitenabschnitt.
 *
 * Sorgt dafür, dass alle Abschnitte denselben vertikalen Rhythmus und
 * dieselbe Ausrichtung haben – der Unterschied zwischen "wirkt gebaut" und
 * "wirkt zusammengeklickt".
 */
export function Section({
  children,
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"section"> & {
  tone?: "default" | "muted" | "ink";
}) {
  return (
    <section
      className={cn(
        "py-16 lg:py-24",
        tone === "muted" && "bg-muted/40",
        tone === "ink" && "bg-ink text-ink-foreground",
        className,
      )}
      {...props}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

/**
 * Abschnittskopf mit Eyebrow, Überschrift und optionaler Aktion rechts.
 * `headingId` verbindet die Überschrift per aria-labelledby mit dem Abschnitt.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  headingId,
  align = "start",
  tone = "default",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingId?: string;
  align?: "start" | "center";
  tone?: "default" | "ink";
}) {
  return (
    <div
      className={cn(
        "mb-10 flex flex-col gap-6 lg:mb-14",
        align === "center"
          ? "items-center text-center"
          : "sm:flex-row sm:items-end sm:justify-between",
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}

        <h2
          id={headingId}
          className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl"
        >
          {title}
        </h2>

        {description && (
          <p
            className={cn(
              "mt-4 text-base leading-relaxed text-pretty",
              tone === "ink" ? "text-ink-muted" : "text-muted-foreground",
            )}
          >
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
