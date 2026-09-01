/**
 * Hauptnavigation der öffentlichen Website (US-02).
 * Eine Quelle für Header, Mobilmenü und Footer.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Kurzbeschreibung für das Mobilmenü */
  description?: string;
};

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Start" },
  {
    href: "/fahrzeuge",
    label: "Fahrzeuge",
    description: "Unser aktueller Bestand",
  },
  {
    href: "/finanzierung",
    label: "Finanzierung",
    description: "Rate berechnen und Partner ansehen",
  },
  {
    href: "/auto-verkaufen",
    label: "Auto verkaufen",
    description: "Wir kaufen Ihr Fahrzeug an",
  },
  { href: "/ueber-uns", label: "Über uns" },
  { href: "/kontakt", label: "Kontakt" },
];

export const LEGAL_NAV: NavItem[] = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
];

/**
 * Ist der Navigationspunkt aktiv?
 * "/" nur bei exakter Übereinstimmung, sonst wäre immer alles aktiv.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
