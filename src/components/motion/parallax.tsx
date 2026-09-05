"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { shouldReduceMotion } from "./preferences";

/**
 * Verschiebt den Inhalt beim Scrollen minimal gegen die Scrollrichtung.
 *
 * Absichtlich der einzige Parallax-Effekt der Website und bewusst schwach
 * dosiert: Der Versatz soll Tiefe andeuten, nicht auffallen.
 *
 * Nur auf großen Zeigegeräten aktiv. Auf dem Smartphone kostet ein
 * Scroll-Listener Leistung, und die Adressleiste ändert dort beim Scrollen
 * ohnehin die Viewporthöhe – der Effekt würde ruckeln statt zu tragen.
 *
 * Der Wert landet als CSS-Variable am Element; die Transformation selbst
 * steht in globals.css. So bleibt hier nur die Messung, und es wird
 * ausschließlich `transform` animiert (kein Layout-Shift).
 */
export function Parallax({
  children,
  className,
  strength = 40,
}: {
  children: ReactNode;
  className?: string;
  /** Maximaler Versatz in Pixeln über die volle Scrollstrecke. */
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");

    let frame = 0;
    let listening = false;

    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      // Fortschritt, während das Element nach oben aus dem Bild wandert.
      const progress = Math.min(Math.max(-rect.top / window.innerHeight, 0), 1);
      element.style.setProperty(
        "--parallax-y",
        `${(progress * strength).toFixed(1)}px`,
      );
    };

    // Scroll-Ereignisse kommen häufiger als Bilder gezeichnet werden.
    // Deshalb wird pro Frame höchstens einmal gemessen.
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      element.style.removeProperty("--parallax-y");
    };

    const sync = () => {
      const active = wide.matches && !shouldReduceMotion(reducedMotion);
      if (active && !listening) {
        listening = true;
        window.addEventListener("scroll", onScroll, { passive: true });
        update();
      } else if (!active) {
        stop();
      }
    };

    sync();
    reducedMotion.addEventListener("change", sync);
    wide.addEventListener("change", sync);

    return () => {
      stop();
      reducedMotion.removeEventListener("change", sync);
      wide.removeEventListener("change", sync);
    };
  }, [strength]);

  return (
    <div ref={ref} className={cn("parallax", className)}>
      {children}
    </div>
  );
}
