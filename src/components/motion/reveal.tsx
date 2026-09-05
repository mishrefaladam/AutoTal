"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { shouldReduceMotion } from "./preferences";

/**
 * Blendet den Inhalt ein, sobald er in den sichtbaren Bereich scrollt.
 *
 * Bewusst ohne React-State: Der Wechsel ist reine Darstellung und würde als
 * State nur ein Rerender auslösen. Der Effekt setzt deshalb direkt das
 * data-Attribut, das Übergang und Startzustand in globals.css steuert.
 *
 * Der Startzustand (unsichtbar) steht in CSS hinter `@media (scripting:
 * enabled)`. Ohne JavaScript – und in Browsern, die diese Media Query nicht
 * kennen – bleibt der Inhalt sofort sichtbar. Eine Animation darf nie
 * Voraussetzung dafür sein, den Text lesen zu können.
 *
 * `children` wird vom Server gerendert und nur durchgereicht; die Kinder
 * werden dadurch nicht zu Client-Komponenten.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Versatz in ms für gestaffelte Gruppen. 80–150 ms wirken ruhig. */
  delay?: number;
  /** Zeilen einer Überschrift brauchen "span" – ein div wäre dort ungültig. */
  as?: "div" | "li" | "section" | "span";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Wer reduzierte Bewegung eingestellt hat, bekommt den Inhalt sofort.
    // Nur der explizite Development-Override darf Motion lokal erzwingen.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (shouldReduceMotion(reducedMotion)) {
      element.dataset["reveal"] = "shown";
      return;
    }

    // Ältere Browser ohne IntersectionObserver zeigen den Inhalt direkt an,
    // statt ihn dauerhaft verborgen zu lassen.
    if (!("IntersectionObserver" in window)) {
      element.dataset["reveal"] = "shown";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset["reveal"] = "shown";
          // Einmal eingeblendet bleibt eingeblendet – erneutes Ein- und
          // Ausblenden beim Zurückscrollen wirkt unruhig.
          observer.unobserve(entry.target);
        }
      },
      // Erst auslösen, wenn das Element ein Stück im Bild ist, damit die
      // Bewegung nicht am äußersten Rand passiert und übersehen wird.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal="hidden"
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
