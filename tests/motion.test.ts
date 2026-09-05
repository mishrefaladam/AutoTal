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
const page = readFileSync("src/app/(public)/page.tsx", "utf8");
const aboutPage = readFileSync("src/app/(public)/ueber-uns/page.tsx", "utf8");
const button = readFileSync("src/components/ui/button.tsx", "utf8");
const whatsappFab = readFileSync("src/components/site/whatsapp-fab.tsx", "utf8");

describe("Normale Website-Bewegung bleibt sichtbar", () => {
  it("deaktiviert Scroll-Reveal, Hero-Intro und Marquee nicht global", () => {
    const reducedMotionBlocks = css.matchAll(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g,
    );

    for (const match of reducedMotionBlocks) {
      for (const selector of ["[data-reveal]", ".rise-in", ".hero-photo", ".marquee-track"]) {
        assert.ok(
          !match[0].includes(selector),
          `${selector} wird bei reduzierter Bewegung noch global deaktiviert`,
        );
      }
    }
  });

  it("lässt Scroll-Reveal auch bei prefers-reduced-motion über den Observer laufen", () => {
    assert.ok(!reveal.includes("prefers-reduced-motion"));
    assert.match(reveal, /IntersectionObserver" in window/);
  });

  it("verwendet keinen Development-Force-Schalter mehr", () => {
    const source = [
      css,
      reveal,
      parallax,
      page,
      aboutPage,
      button,
      whatsappFab,
      readFileSync(".env.example", "utf8"),
    ].join("\n");

    assert.ok(!source.includes("NEXT_PUBLIC_FORCE_MOTION"));
    assert.ok(!source.includes("data-force-motion"));
  });

  it("entfernt motion-reduce-Varianten von normalen Hover-Effekten", () => {
    for (const [name, source] of Object.entries({
      page,
      aboutPage,
      button,
      whatsappFab,
    })) {
      assert.ok(
        !source.includes("motion-reduce:"),
        `${name} enthält noch motion-reduce`,
      );
    }
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

describe("Starke Bewegung bleibt reduziert", () => {
  it("schaltet Parallax bei prefers-reduced-motion weiter ab", () => {
    assert.match(parallax, /prefers-reduced-motion: reduce/);
    assert.match(parallax, /wide\.matches && !reducedMotion\.matches/);
    const parallaxRule = css.slice(css.indexOf("scrollgekoppelte Bewegung"));
    assert.match(parallaxRule, /prefers-reduced-motion: reduce/);
    assert.match(parallaxRule, /\.parallax[\s\S]*?transform: none/);
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
