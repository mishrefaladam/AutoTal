import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Auch hier keine Komponenten-Render-Tests (keine DOM-Test-Infrastruktur in
 * diesem Projekt) – die Quelltextprüfung sichert die Kundenvorgaben zum
 * Footer und zur Kontaktseite gegen ein versehentliches Zurückrudern ab.
 */

const footer = readFileSync("src/components/site/site-footer.tsx", "utf8");
const kontakt = readFileSync("src/app/(public)/kontakt/page.tsx", "utf8");

describe("Footer – Navigation ist eindeutig als Überschrift erkennbar", () => {
  it("nutzt für die Spaltenüberschriften ein Label statt Link-Optik", () => {
    assert.match(footer, /const COLUMN_HEADING =/);
    assert.match(footer, /className=\{COLUMN_HEADING\}/);
  });

  it("rendert die Hauptnavigation als echte, anklickbare Links", () => {
    assert.match(footer, /\{MAIN_NAV\.map/);
    assert.match(footer, /<Link\s+href=\{item\.href\}/);
  });

  it("gibt den Footer-Links eine Trefferfläche für Touch-Bedienung", () => {
    // "block" + Innenabstand statt reinem Fließtext-Link.
    const navLinkBlock = footer.slice(
      footer.indexOf("{MAIN_NAV.map"),
      footer.indexOf("</nav>"),
    );
    assert.match(navLinkBlock, /block rounded-md px-2 py-3/);
  });
});

describe("Footer – Kontakt zeigt nur vorhandene CompanySettings-Daten", () => {
  it("rendert Telefon, E-Mail und WhatsApp jeweils nur wenn gepflegt", () => {
    assert.match(footer, /\{company\.phone && \(/);
    assert.match(footer, /\{company\.email && \(/);
    assert.match(footer, /\{whatsappHref && \(/);
  });

  it("baut den WhatsApp-Link über das gemeinsame Modul, nicht über eine eigene URL", () => {
    assert.match(footer, /buildWhatsAppUrl\(/);
    assert.ok(!/https:\/\/wa\.me\//.test(footer), "eine hartkodierte wa.me-URL ist aufgetaucht");
  });

  it("erfindet keine Platzhalter-Kontaktdaten", () => {
    for (const placeholder of ["+43 000", "office@autotal.at", "Musterstraße"]) {
      assert.ok(!footer.includes(placeholder), `Platzhalter "${placeholder}" im Footer gefunden`);
    }
  });
});

describe("Footer – keine leere Kontakt-Karte ohne Daten", () => {
  it("blendet die ganze Kontakt-Spalte aus, statt Überschrift ohne Inhalt zu zeigen", () => {
    // Ohne CompanySettings (frische Production-DB) wären sonst Überschrift
    // "Kontakt" und eine leere <address> übrig – wirkt wie ein Fehler.
    assert.match(footer, /const hasContactInfo = Boolean\(/);
    assert.match(footer, /\{hasContactInfo && \(/);
  });

  it("berücksichtigt Adresse, Telefon, E-Mail und WhatsApp bei der Prüfung", () => {
    const check = footer.slice(
      footer.indexOf("const hasContactInfo"),
      footer.indexOf(");", footer.indexOf("const hasContactInfo")),
    );
    for (const field of ["company.addressLine", "company.phone", "company.email", "whatsappHref"]) {
      assert.ok(check.includes(field), `${field} fehlt in der hasContactInfo-Prüfung`);
    }
  });
});

describe("Footer – Öffnungszeiten ohne erfundene Defaults", () => {
  it("zeigt bei leeren Öffnungszeiten den neutralen Hinweis statt einer Tabelle", () => {
    assert.match(footer, /openingDays\.length > 0/);
    assert.match(footer, /OPENING_HOURS_UNKNOWN_LABEL/);
  });
});

describe("Kontaktseite – Direkt erreichen zeigt nur vorhandene Daten", () => {
  it("rendert Telefon, E-Mail, Adresse und WhatsApp jeweils bedingt", () => {
    assert.match(kontakt, /\{company\.phone && \(/);
    assert.match(kontakt, /\{company\.email && \(/);
    assert.match(kontakt, /\{company\.addressLine && \(/);
    assert.match(kontakt, /whatsappHref/);
  });

  it("verlinkt Telefon und E-Mail korrekt", () => {
    assert.match(kontakt, /href=\{`tel:\$\{company\.phoneHref\}`\}/);
    assert.match(kontakt, /href=\{`mailto:\$\{company\.email\}`\}/);
  });

  it("zeigt bei leeren Öffnungszeiten den neutralen Hinweis statt einer Tabelle", () => {
    assert.match(kontakt, /openingDays\.length > 0/);
    assert.match(kontakt, /OPENING_HOURS_UNKNOWN_LABEL/);
  });

  it("blendet die 'Direkt erreichen'-Karte aus, statt sie leer zu zeigen", () => {
    assert.match(kontakt, /const hasDirectContact = Boolean\(/);
    assert.match(kontakt, /\{hasDirectContact && \(/);
    // Die Öffnungszeiten-Karte darunter bleibt unabhängig davon immer sichtbar.
    assert.match(kontakt, /\{\/\* Öffnungszeiten \*\/\}/);
  });
});
