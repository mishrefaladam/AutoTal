import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * Typdeklaration für das Custom Element von willhaben.
 *
 * `<widget-lite>` ist eine Webkomponente, die der Loader von willhaben zur
 * Laufzeit registriert. JSX kennt sie nicht, deshalb wird sie hier bekannt
 * gemacht – ohne sie wäre das Element ein Typfehler.
 *
 * Bewusst ohne eigene Attribute: Laut Anleitung ist das Element ein reiner
 * Platzhalter ohne Konfigurationsattribute. Käme später eines dazu, gehört es
 * hierher und nicht als `any` an die Verwendungsstelle.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "widget-lite": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}
