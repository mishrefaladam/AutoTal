import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { verifyCaptionFacts } from "@/integrations/openai";
import { kwToPs } from "@/lib/money";
import {
  AUTOTAL_CLOSING,
  AUTOTAL_GREETING,
  AUTOTAL_SERVICE_LINES,
  CAPTION_TEMPLATE_ID,
  buildInstagramCaption,
  buildInstagramHashtags,
  buildPowerPs,
  buildVehicleFactLines,
  buildVehicleName,
  buildYear,
  type CaptionVehicleFacts,
} from "@/modules/social/caption";

/**
 * Instagram-Text nach der AutoTal-Vorlage.
 *
 * Vier Fahrzeugwerte, sonst fester Text. Was fehlt, fehlt ganz – kein
 * Platzhalter, keine Schätzung, kein "unbekannt".
 */

const PANAMERA: CaptionVehicleFacts = {
  make: "Porsche",
  model: "Panamera",
  variant: "4S",
  mileageKm: 85_000,
  firstRegistration: new Date(Date.UTC(2019, 5, 1)),
  powerKw: 324,
};

// ---------------------------------------------------------------------------
// 1, 2: Fahrzeugname
// ---------------------------------------------------------------------------

describe("Fahrzeugname", () => {
  it("setzt sich aus Marke, Modell und Variante zusammen", () => {
    assert.equal(buildVehicleName(PANAMERA), "Porsche Panamera 4S");
    assert.equal(
      buildVehicleName({ make: "Mercedes-Benz", model: "S 500", variant: "4MATIC" }),
      "Mercedes-Benz S 500 4MATIC",
    );
  });

  it("kommt ohne Variante aus", () => {
    assert.equal(buildVehicleName({ make: "BMW", model: "X5", variant: null }), "BMW X5");
    assert.equal(buildVehicleName({ make: "BMW", model: "X5", variant: "" }), "BMW X5");
    assert.equal(buildVehicleName({ make: "BMW", model: "X5" }), "BMW X5");
  });

  it("erzeugt keine doppelten Leerzeichen", () => {
    assert.equal(
      buildVehicleName({ make: " Porsche ", model: "Panamera  ", variant: "  4S" }),
      "Porsche Panamera 4S",
    );
  });
});

// ---------------------------------------------------------------------------
// 3, 4, 5: Kilometer, Baujahr, Leistung
// ---------------------------------------------------------------------------

describe("Fahrzeugzeilen", () => {
  it("formatiert Kilometer deutsch", () => {
    const lines = buildVehicleFactLines({ ...PANAMERA, firstRegistration: null, powerKw: null });
    assert.deepEqual(lines, ["Kilometer: 85.000 km"]);
  });

  it("liest das Baujahr aus der Erstzulassung", () => {
    assert.equal(buildYear(new Date(Date.UTC(2019, 5, 1))), 2019);
    // Der 31. Dezember bleibt in seinem Jahr – kein Zeitzonensprung.
    assert.equal(buildYear(new Date(Date.UTC(2020, 11, 31))), 2020);
    assert.equal(buildYear(null), null);
    assert.equal(buildYear(new Date("nicht-gültig")), null);

    const lines = buildVehicleFactLines({ ...PANAMERA, mileageKm: null, powerKw: null });
    assert.deepEqual(lines, ["Baujahr: 2019"]);
  });

  it("rechnet kW über die zentrale Umrechnung in PS um", () => {
    // Keine zweite Formel: Der Beitrag nennt dieselbe Zahl wie das Formular.
    assert.equal(buildPowerPs(324), kwToPs(324));
    assert.equal(buildPowerPs(100), 136);
    assert.equal(buildPowerPs(140), 190);

    const lines = buildVehicleFactLines({ ...PANAMERA, mileageKm: null, firstRegistration: null });
    assert.deepEqual(lines, [`Leistung: ${kwToPs(324)} PS`]);
  });

  it("gibt keine kW aus", () => {
    assert.doesNotMatch(buildInstagramCaption(PANAMERA), /kW/);
  });
});

// ---------------------------------------------------------------------------
// 6, 7, 8, 9: Fehlende Werte
// ---------------------------------------------------------------------------

describe("Fehlende Werte", () => {
  it("lässt die Kilometer-Zeile weg, wenn kein Kilometerstand vorliegt", () => {
    for (const mileageKm of [null, 0, -5, Number.NaN]) {
      const caption = buildInstagramCaption({ ...PANAMERA, mileageKm });
      assert.doesNotMatch(caption, /Kilometer:/, `bei ${mileageKm}`);
      assert.match(caption, /Baujahr: 2019/);
    }
  });

  it("lässt die Baujahr-Zeile weg, wenn keine Erstzulassung vorliegt", () => {
    const caption = buildInstagramCaption({ ...PANAMERA, firstRegistration: null });
    assert.doesNotMatch(caption, /Baujahr:/);
    assert.match(caption, /Kilometer: 85\.000 km/);
  });

  it("lässt die Leistungs-Zeile weg, wenn keine Leistung vorliegt", () => {
    for (const powerKw of [null, 0, -1]) {
      const caption = buildInstagramCaption({ ...PANAMERA, powerKw });
      assert.doesNotMatch(caption, /Leistung:/, `bei ${powerKw}`);
    }
  });

  it("schreibt niemals Platzhalter oder „unbekannt“", () => {
    const bare = buildInstagramCaption({
      make: "BMW",
      model: "X5",
      variant: "xDrive30d",
      mileageKm: null,
      firstRegistration: null,
      powerKw: null,
    });

    assert.doesNotMatch(bare, /\[X+\]|\[.*?\]|XX|unbekannt|k\. ?A\.|ca\./i);
    assert.equal(
      bare,
      [
        AUTOTAL_GREETING,
        "",
        "BMW X5 xDrive30d",
        "",
        ...AUTOTAL_SERVICE_LINES,
        "",
        AUTOTAL_CLOSING,
      ].join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// 10, 11, 12: Fester Text und keine erfundenen Angaben
// ---------------------------------------------------------------------------

describe("Fester Text", () => {
  const caption = buildInstagramCaption(PANAMERA);

  it("entspricht der Vorlage des Kunden", () => {
    assert.equal(
      caption,
      `Herzlich willkommen bei Autotal! 🚗

Porsche Panamera 4S
Kilometer: 85.000 km
Baujahr: 2019
Leistung: ${kwToPs(324)} PS

• Fahrzeugankauf & -verkauf
• Inzahlungnahme möglich
• Österreichweite Zustellung gegen Aufpreis

Weitere Details zum Fahrzeug:
www.autotal.at`,
    );
  });

  it("enthält die drei festen AutoTal-Servicepunkte", () => {
    assert.match(caption, /• Fahrzeugankauf & -verkauf/);
    assert.match(caption, /• Inzahlungnahme möglich/);
    assert.match(caption, /• Österreichweite Zustellung gegen Aufpreis/);
  });

  it("schließt mit www.autotal.at", () => {
    assert.ok(caption.endsWith("Weitere Details zum Fahrzeug:\nwww.autotal.at"));
  });

  it("erfindet weder Ausstattung noch Extras, Preis oder Highlights", () => {
    // Die Vorlage liest diese Felder gar nicht erst – sie können also auch
    // dann nicht auftauchen, wenn das Fahrzeug sie trägt.
    const source = readFileSync("src/modules/social/caption.ts", "utf8");
    for (const field of ["features", "extras", "highlights", "priceCents", "color", "fuel", "transmission", "description"]) {
      assert.ok(!new RegExp(`\\b${field}\\b`).test(source), `${field} wird gelesen`);
    }
    assert.doesNotMatch(caption, /€|Ausstattung|Highlights|Extras/);
  });
});

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

describe("Hashtags", () => {
  it("bestehen aus den festen Tags plus Marke und Modell", () => {
    assert.deepEqual(buildInstagramHashtags({ make: "Porsche", model: "Panamera" }), [
      "AutoTal",
      "AutoTalWien",
      "GebrauchtwagenWien",
      "Porsche",
      "PorschePanamera",
    ]);
  });

  it("entfernt Zeichen, die Instagram im Tag nicht zulässt", () => {
    assert.deepEqual(buildInstagramHashtags({ make: "Mercedes-Benz", model: "S 500" }), [
      "AutoTal",
      "AutoTalWien",
      "GebrauchtwagenWien",
      "MercedesBenz",
      "MercedesBenzS500",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 13, 14: Ablauf bleibt
// ---------------------------------------------------------------------------

describe("Ablauf im Beitragsassistenten", () => {
  const actions = readFileSync("src/modules/social/actions.ts", "utf8");
  const manager = readFileSync("src/components/admin/social-media-manager.tsx", "utf8");

  it("erzeugt den Entwurf aus der Vorlage und kennzeichnet ihn so", () => {
    assert.match(actions, /caption: buildInstagramCaption\(vehicle\)/);
    assert.match(actions, /hashtags: buildInstagramHashtags\(vehicle\)/);
    assert.match(actions, /model: CAPTION_TEMPLATE_ID/);
    assert.equal(CAPTION_TEMPLATE_ID, "AutoTal-Vorlage");
    assert.ok(!/generateInstagramCaption\(/.test(actions), "kein KI-Aufruf für den Beitrag");
  });

  it("speichert weiterhin nur einen Entwurf – nichts wird automatisch veröffentlicht", () => {
    const block = actions.slice(
      actions.indexOf("export async function generateCaption"),
      actions.indexOf("export async function", actions.indexOf("export async function generateCaption") + 10),
    );
    assert.match(block, /status: "DRAFT"/);
    assert.ok(!/media_publish|publishInstagramImage|publishImagePost/.test(block));
  });

  it("lässt den Text vor der Veröffentlichung bearbeiten", () => {
    assert.match(actions, /export async function updateDraft/);
    assert.match(manager, /onChange=\{\(event\) => setCaption\(event\.target\.value\)\}/);
    assert.match(manager, /onChange=\{\(event\) => setHashtags\(event\.target\.value\)\}/);
  });

  it("hängt das Erzeugen nicht mehr am OpenAI-Schlüssel", () => {
    assert.doesNotMatch(manager, /openAiConfigured/);
    assert.match(manager, /disabled=\{pending \|\| !selectedVehicleId\}/);
  });

  it("lässt das Instagram-Publishing unverändert", () => {
    // Freigabe- und Veröffentlichungspfad sind dieselben wie zuvor.
    assert.match(actions, /export async function approveDraft/);
    assert.match(actions, /export async function publishDraft/);
    const publish = actions.slice(actions.indexOf("export async function publishDraft"));
    assert.match(publish, /status !== "APPROVED"|status: "APPROVED"/);
    assert.match(publish, /publishImagePost\(/);
  });

  it("braucht für die Faktenprüfung keinen OpenAI-Schlüssel", () => {
    // verifyCaptionFacts ist reine Textprüfung. Sie liegt zwar im
    // OpenAI-Modul, liest aber weder Schlüssel noch Client – die Vorlage
    // läuft damit auch auf einer Instanz ohne OPENAI_API_KEY.
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const vehicle = { ...PANAMERA, mileageKm: 85_000, priceCents: 8_990_000 };
      assert.deepEqual(verifyCaptionFacts(buildInstagramCaption(vehicle), vehicle), []);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }

    // Und die Action holt aus dem OpenAI-Modul nichts anderes.
    assert.match(actions, /import \{ verifyCaptionFacts \} from "@\/integrations\/openai";/);
    assert.ok(!/isOpenAIConfigured|getClient|OPENAI_API_KEY/.test(actions));
  });

  it("behält die OpenAI-Anbindung für spätere Funktionen", () => {
    const openai = readFileSync("src/integrations/openai/index.ts", "utf8");
    assert.match(openai, /export async function generateInstagramCaption/);
    assert.match(openai, /export function verifyCaptionFacts/);
    // Ihr Prompt kennt nur noch dieselben vier Werte.
    assert.match(openai, /Fahrzeugname: \$\{buildVehicleName\(vehicle\)\}/);
    assert.match(openai, /\.\.\.buildVehicleFactLines\(vehicle\)/);
    for (const forbidden of ["Ausstattung:", "Extras:", "Preis:", "Farbe:", "Getriebe:", "Kraftstoff:", "Hubraum:"]) {
      assert.ok(!openai.includes(`\`${forbidden}`), `${forbidden} steht noch im Prompt`);
    }
  });
});
