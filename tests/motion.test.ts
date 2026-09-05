import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Diese Zusicherungen sind im Alltag unsichtbar: Wer keine reduzierte
 * Bewegung eingestellt hat und JavaScript aktiviert lässt, merkt nie, wenn
 * sie wegfallen. Genau deshalb gehören sie in einen Test – ein Umbau der
 * Animationen darf sie nicht stillschweigend entfernen.
 */

const css = readFileSync("src/app/globals.css", "utf8");
const reveal = readFileSync("src/components/motion/reveal.tsx", "utf8");
const marquee = readFileSync("src/components/motion/marquee.tsx", "utf8");
const parallax = readFileSync("src/components/motion/parallax.tsx", "utf8");
const preferences = readFileSync("src/components/motion/preferences.ts", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("Bewegung bleibt abschaltbar", () => {
  it("schaltet alle Animationen bei prefers-reduced-motion ab", () => {
    const block = css.slice(
      css.indexOf("Wer reduzierte Bewegung eingestellt hat"),
      css.indexOf("Lokaler Development-Testmodus"),
    );
    for (const selector of [
      "[data-reveal]",
      ".rise-in",
      ".hero-photo",
      ".marquee-track",
      ".parallax",
    ]) {
      assert.ok(
        block.includes(selector),
        `${selector} wird bei reduzierter Bewegung nicht zurückgesetzt`,
      );
    }
  });

  it("prüft reduzierte Bewegung auch im Beobachter", () => {
    // Sonst würde der Inhalt zwar sichtbar bleiben, aber der Observer liefe
    // trotzdem mit und setzte Übergänge in Gang.
    assert.match(reveal, /prefers-reduced-motion: reduce/);
    assert.match(parallax, /prefers-reduced-motion: reduce/);
  });

  it("erlaubt erzwungene Bewegung nur in Development", () => {
    assert.match(preferences, /process\.env\.NODE_ENV === "development"/);
    assert.match(preferences, /process\.env\.NEXT_PUBLIC_FORCE_MOTION === "true"/);
    assert.match(reveal, /shouldReduceMotion/);
    assert.match(parallax, /shouldReduceMotion/);
    assert.match(layout, /data-force-motion=\{forceMotionInDevelopment \? "true" : undefined\}/);
  });

  it("schaltet CSS-Bewegung nur über das Development-Attribut wieder ein", () => {
    const override = css.slice(css.indexOf("Lokaler Development-Testmodus"));
    assert.match(override, /prefers-reduced-motion: reduce/);
    assert.match(override, /NEXT_PUBLIC_FORCE_MOTION=true/);
    assert.match(override, /marquee-slide 46s linear infinite/);
    assert.match(override, /hero-photo 2200ms/);
    assert.match(override, /rise-in 760ms/);
  });
});

describe("Inhalte bleiben ohne JavaScript lesbar", () => {
  it("versteckt den Startzustand nur bei aktivem Scripting", () => {
    // Ohne diese Schranke bliebe alles dauerhaft unsichtbar, sobald
    // JavaScript fehlschlägt oder abgeschaltet ist.
    const hidden = css.indexOf('[data-reveal="hidden"]');
    const guard = css.lastIndexOf("@media (scripting: enabled)", hidden);
    assert.ok(guard !== -1, "der verborgene Zustand steht nicht hinter (scripting: enabled)");
    assert.ok(
      css.slice(guard, hidden).trim().endsWith("{"),
      "zwischen Schranke und verborgenem Zustand steht noch etwas anderes",
    );
  });

  it("blendet ohne IntersectionObserver sofort ein", () => {
    assert.match(reveal, /IntersectionObserver" in window/);
  });
});

describe("Das Laufband läuft nahtlos", () => {
  it("rendert genau zwei identische Hälften", () => {
    // Die Animation verschiebt um 50 % – das stimmt nur bei zwei Hälften.
    assert.match(marquee, /half\(false\)/);
    assert.match(marquee, /half\(true\)/);
    assert.match(css, /marquee-slide[\s\S]*?translateX\(-50%\)/);
  });

  it("blendet die Wiederholung für Screenreader aus", () => {
    assert.match(marquee, /aria-hidden=\{duplicate \|\| undefined\}/);
  });

  it("erzeugt den Abstand über Innenabstand, nicht über gap", () => {
    // Mit `gap` entstünde an der Nahtstelle zwischen den Hälften eine Lücke.
    const track = css.slice(css.indexOf(".marquee-track"), css.indexOf(".marquee-half"));
    assert.ok(!/\bgap\s*:/.test(track), "die Spur nutzt gap – das reißt die Naht auf");
  });
});

describe("Es wird nur transform und opacity animiert", () => {
  it("vermeidet Eigenschaften, die das Layout verschieben", () => {
    // Layout-Shifts kosten Sichtbarkeit (CLS) und wirken unruhig.
    const motion = css.slice(css.indexOf("Bewegung\n"));
    for (const property of ["width:", "height:", "margin-top:", "top:", "left:"]) {
      const inTransition = new RegExp(`transition:[^;]*${property.replace(":", "")}`);
      assert.ok(!inTransition.test(motion), `${property} wird animiert`);
    }
  });
});
