import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { extractFormFields, parsePdfObjects } from "@/modules/vehicles/price-sheet";
import {
  collectFieldRects,
  extractPlacedText,
  extractPositionalFields,
  isSalesOfferTemplate,
} from "@/modules/vehicles/price-sheet-layout";
import { mapPriceSheet } from "@/modules/vehicles/price-sheet-mapping";

/**
 * Verkaufsangebot: Werte über ihre Position zuordnen.
 *
 * Diese Vorlage trägt ihre Werte nicht im Feldwörterbuch. `Marke[0]`,
 * `Kilometerstand[0]` und die übrigen haben `/T` und `/Rect`, aber kein `/V`;
 * der sichtbare Text steckt in flachgerechneten Darstellungsobjekten, die der
 * Seiteninhalt genau auf die Feldfläche setzt.
 *
 * Die Fixtures bilden diese Struktur nach – klein, ohne Kundendaten und so
 * zugeschnitten, dass sich auch Fälle prüfen lassen, die die echte Datei nicht
 * hergibt (mehrdeutige Zuordnung, `/V` gegen Position). Gegen die reale Datei
 * sales-offer-2222222228192291.pdf wurde derselbe Code gesondert geprüft; die
 * dort gemessenen Werte stehen in den Kommentaren.
 */

// ---------------------------------------------------------------------------
// Fixture: Struktur des Verkaufsangebots nachbauen
// ---------------------------------------------------------------------------

type OfferField = {
  /** Linke untere Ecke der Feldfläche. */
  x: number;
  y: number;
  /** Sichtbarer Text; mehrere ergeben eine mehrdeutige Zuordnung. */
  texts: string[];
  /** Wert im Feldwörterbuch – hat immer Vorrang. */
  value?: string;
  /** Name steht am Elternfeld, die Fläche am namenlosen Kind (wie "Hubraum"). */
  viaParent?: boolean;
  /** Text absichtlich versetzt platzieren, um die Toleranz zu prüfen. */
  offset?: number;
};

/** Die Beschriftungsspalte, an der die Vorlage erkannt wird. */
const LABEL_FIELDS = { FD1: "Erstzulassung", FD2: "Kilometer", FD3: "Treibstoff" };

function buildSalesOffer(fields: Record<string, OfferField>): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.6\n", "latin1")];
  let next = 1;

  const push = (body: string) => {
    parts.push(Buffer.from(`${next} 0 obj\n${body}\nendobj\n`, "latin1"));
    return next++;
  };

  const pushStream = (dict: string, data: Buffer) => {
    parts.push(
      Buffer.concat([
        Buffer.from(`${next} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"),
        data,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]),
    );
    return next++;
  };

  // Beschriftungsfelder mit echtem /V – so wie in der Vorlage.
  for (const [name, label] of Object.entries(LABEL_FIELDS)) {
    push(
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /V (${label}) ` +
        `/Rect [19 600 169 622] >>`,
    );
  }

  const placements: { name: string; x: number; y: number }[] = [];

  for (const [name, field] of Object.entries(fields)) {
    const rect = `/Rect [${field.x} ${field.y} ${field.x + 130} ${field.y + 22}]`;
    const value = field.value === undefined ? "" : ` /V (${field.value})`;

    if (field.viaParent) {
      // Elternfeld trägt den Namen, das Kind die Fläche.
      const parent = push(`<< /FT /Tx /T (${name})${value} /Kids [${next + 1} 0 R] >>`);
      push(`<< /Type /Annot /Subtype /Widget /Parent ${parent} 0 R ${rect} >>`);
    } else {
      push(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name})${value} ${rect} >>`);
    }

    field.texts.forEach((text, index) => {
      const escaped = text.replace(/([()\\])/g, "\\$1");
      const number = pushStream(
        `/Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 130 22]`,
        Buffer.from(`BT /F1 12 Tf 0 4 Td (${escaped}) Tj ET`, "latin1"),
      );
      const resourceName = `Fm${number}`;
      const shift = field.offset ?? 0;
      placements.push({ name: resourceName, x: field.x + shift, y: field.y + shift });
      // Objektnummer merken, indem der Name die Nummer trägt.
      void index;
    });
  }

  const xobjects = placements
    .map(({ name }) => `/${name} ${name.slice(2)} 0 R`)
    .join(" ");

  const content = placements
    .map(({ name, x, y }) => `q 1 0 0 1 ${x} ${y} cm /${name} Do Q`)
    .join("\n");

  const contentRef = pushStream("", Buffer.from(content, "latin1"));

  push(
    `<< /Type /Page /MediaBox [0 0 595.08 842.04] ` +
      `/Resources << /XObject << ${xobjects} >> >> /Contents [${contentRef} 0 R] >>`,
  );

  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));

  return Buffer.concat(parts);
}

/** Die Werte des realen Verkaufsangebots, an denselben Stellen. */
const REAL_LAYOUT: Record<string, OfferField> = {
  "Marke[0]": { x: 18.9393, y: 671.376, texts: ["BMW"] },
  "Modell[0]": { x: 18.9394, y: 650.785, texts: ["X3 xDrive 20d M-Paket Aut."] },
  "DatumErstzulassung[0]": { x: 118.072, y: 608.813, texts: ["03/2015"] },
  "Kilometerstand[0]": { x: 118.072, y: 592.813, texts: ["245.858"] },
  Treibstoff: { x: 118.071, y: 576.813, texts: ["Diesel"] },
  Leistung: { x: 118.071, y: 560.813, texts: ["140 kW (190 PS)"] },
  Getriebe: { x: 118.071, y: 544.813, texts: ["Automatik"] },
  // "Hubraum" trägt den Namen am Elternfeld, die Fläche am namenlosen Kind.
  Hubraum: { x: 118.072, y: 528.813, texts: ["1.995 ccm"], viaParent: true },
  "Farbe[0]": { x: 118.071, y: 496.89, texts: ["schwarz"] },
};

const OFFER = buildSalesOffer(REAL_LAYOUT);

function fieldNames(pdf: Buffer): Set<string> {
  const names = new Set<string>();
  for (const object of parsePdfObjects(pdf).values()) {
    const name = /\/T\s*\(((?:[^()\\]|\\.)*)\)/.exec(object.dict.toString("latin1"))?.[1];
    if (name) names.add(name);
  }
  return names;
}

/** Zusammengeführt wie im Dienst: /V gewinnt, Position ergänzt. */
function readMerged(pdf: Buffer) {
  const objects = parsePdfObjects(pdf);
  const positional = extractPositionalFields(objects);
  return {
    fields: { ...positional.fields, ...extractFormFields(objects) },
    ambiguous: positional.ambiguous,
  };
}

// ---------------------------------------------------------------------------
// 1 + 2: Vorlagenerkennung
// ---------------------------------------------------------------------------

describe("Vorlagenerkennung", () => {
  it("erkennt das Verkaufsangebot an mehreren Merkmalen", () => {
    assert.equal(isSalesOfferTemplate(fieldNames(OFFER)), true);
  });

  it("genügt sich nicht mit einem einzelnen Feldnamen", () => {
    assert.equal(isSalesOfferTemplate(["Marke[0]"]), false);
    assert.equal(
      isSalesOfferTemplate(["Marke[0]", "Modell[0]", "Kilometerstand[0]"]),
      false,
      "ohne Beschriftungsspalte keine Erkennung",
    );
  });

  it("hält die Preisblatt-Vorlage heraus", () => {
    // Deren Felder heißen "Marke", "Kilometer", "Erstzulassung" – ohne Zusatz.
    const preisblatt = [
      "Marke",
      "Bezeichnung",
      "Kilometer",
      "Erstzulassung",
      "FD1",
      "FD2",
      "FD3",
      "Highlights_1",
    ];

    assert.equal(isSalesOfferTemplate(preisblatt), false);
  });
});

// ---------------------------------------------------------------------------
// 3–11: Werte
// ---------------------------------------------------------------------------

describe("Positionsbasierte Werte", () => {
  const values = mapPriceSheet(readMerged(OFFER).fields);

  it("erkennt die Marke", () => {
    assert.equal(values.make, "BMW");
  });

  it("erkennt die Modellbezeichnung, ohne sie zu zerlegen", () => {
    // Das Modell des Fahrzeugs bleibt unangetastet – aus "X3 xDrive 20d
    // M-Paket Aut." ein Modell zu schneiden wäre geraten.
    assert.equal(values.variant, "X3 xDrive 20d M-Paket Aut.");
  });

  it("erkennt die Erstzulassung und normalisiert sie", () => {
    assert.equal(values.firstRegistration?.toISOString().slice(0, 10), "2015-03-01");
  });

  it("erkennt den Kilometerstand", () => {
    assert.equal(values.mileageKm, 245_858);
  });

  it("erkennt den Treibstoff", () => {
    assert.equal(values.fuel, "DIESEL");
  });

  it("normalisiert die Leistung auf kW", () => {
    assert.equal(values.powerKw, 140);
  });

  it("erkennt das Getriebe", () => {
    assert.equal(values.transmission, "AUTOMATIC");
  });

  it("erkennt den Hubraum über das Elternfeld", () => {
    // Der Name steht am Feld, die Fläche am namenlosen Kind.
    assert.equal(values.displacementCcm, 1995);
  });

  it("erkennt die Farbe", () => {
    assert.equal(values.color, "schwarz");
  });

  it("ordnet jede Feldfläche genau einem Text zu", () => {
    const objects = parsePdfObjects(OFFER);
    const rects = collectFieldRects(objects);
    const placed = extractPlacedText(objects);

    assert.equal(rects.get("Marke[0]")?.x, 18.9393);
    assert.equal(rects.get("Hubraum")?.y, 528.813);
    assert.equal(placed.length, 9);
  });
});

// ---------------------------------------------------------------------------
// 12 + 13: Grenzen der Zuordnung
// ---------------------------------------------------------------------------

describe("Grenzen der Zuordnung", () => {
  it("übernimmt nichts, wenn zwei Texte auf derselben Fläche liegen", () => {
    const pdf = buildSalesOffer({
      ...REAL_LAYOUT,
      Treibstoff: { x: 118.071, y: 576.813, texts: ["Diesel", "Benzin"] },
    });

    const { fields, ambiguous } = readMerged(pdf);

    assert.equal(fields.Treibstoff, undefined, "kein stillschweigend gewählter Wert");
    assert.deepEqual(ambiguous, ["Treibstoff"]);
  });

  it("meldet die Mehrdeutigkeit, statt sie zu verschweigen", () => {
    const service = readFileSync(
      "src/modules/vehicles/price-sheet-service.ts",
      "utf8",
    );
    assert.match(service, /standen mehrere Textstellen zur Auswahl/);
  });

  it("gibt dem Feldwert /V den Vorrang vor der Position", () => {
    const pdf = buildSalesOffer({
      ...REAL_LAYOUT,
      // Im Wörterbuch steht etwas anderes als auf dem Blatt.
      Treibstoff: { x: 118.071, y: 576.813, texts: ["Diesel"], value: "Benzin" },
    });

    assert.equal(readMerged(pdf).fields.Treibstoff, "Benzin");
    assert.equal(mapPriceSheet(readMerged(pdf).fields).fuel, "PETROL");
  });

  it("nimmt keinen Text, der neben der Feldfläche liegt", () => {
    // 20 Punkt Versatz – weit außerhalb der Toleranz von zwei Punkt.
    const weit = buildSalesOffer({
      ...REAL_LAYOUT,
      Getriebe: { x: 118.071, y: 544.813, texts: ["Automatik"], offset: 20 },
    });

    assert.equal(
      extractPositionalFields(parsePdfObjects(weit)).fields.Getriebe,
      undefined,
    );

    // Eine Rundungsabweichung von einem halben Punkt zählt dagegen noch.
    const knapp = buildSalesOffer({
      ...REAL_LAYOUT,
      Getriebe: { x: 118.071, y: 544.813, texts: ["Automatik"], offset: 0.5 },
    });

    assert.equal(
      extractPositionalFields(parsePdfObjects(knapp)).fields.Getriebe,
      "Automatik",
    );
  });

  it("verwirft einen Feldnamen, der zu zwei Flächen gehört", () => {
    // Zwei Widgets mit demselben /T an verschiedenen Stellen: Es gibt keine
    // richtige Wahl, also wird keine getroffen.
    const pdf = Buffer.concat([
      Buffer.from(
        "%PDF-1.6\n" +
          "1 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (Marke[0]) /Rect [10 700 140 722] >>\nendobj\n" +
          "2 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (Marke[0]) /Rect [10 400 140 422] >>\nendobj\n" +
          "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
        "latin1",
      ),
    ]);

    assert.equal(collectFieldRects(parsePdfObjects(pdf)).has("Marke[0]"), false);
  });
});

// ---------------------------------------------------------------------------
// 2: Preisblatt bleibt unberührt
// ---------------------------------------------------------------------------

describe("Preisblatt-Vorlage", () => {
  it("greift dort nicht ein", () => {
    // Kein Verkaufsangebot -> der Dienst ruft die Positionssuche gar nicht auf.
    const service = readFileSync(
      "src/modules/vehicles/price-sheet-service.ts",
      "utf8",
    );

    assert.match(service, /if \(!isSalesOfferTemplate\(names\)\) return \{ fields, warnings: \[\] \}/);
  });

  it("liest Analyse und Übernahme über dieselbe Routine", () => {
    // Zwei Lesewege wären zwei Wahrheiten: Die Vorschau zeigte Werte, die beim
    // Speichern niemand mehr fände.
    const service = readFileSync(
      "src/modules/vehicles/price-sheet-service.ts",
      "utf8",
    );

    assert.match(service, /mapPriceSheet\(readFields\(objects\)\.fields\)/);
    assert.equal(
      (service.match(/mapPriceSheet\(/g) ?? []).length,
      2,
      "genau zwei Aufrufe: Analyse und Übernahme",
    );
  });
});

// ---------------------------------------------------------------------------
// 14–17: Bild, Überschreibschutz, Social Media
// ---------------------------------------------------------------------------

describe("Unveränderte Regeln", () => {
  const parser = readFileSync("src/modules/vehicles/price-sheet.ts", "utf8");
  const service = readFileSync(
    "src/modules/vehicles/price-sheet-service.ts",
    "utf8",
  );

  it("lässt die Bildregeln unangetastet", () => {
    assert.match(parser, /minPageWidthRatio: 0\.2\b/);
    assert.match(parser, /minWidthPx: 400/);
    assert.match(parser, /minHeightPx: 300/);
    assert.match(parser, /if \(image\.hasAlpha\)/);
    assert.match(parser, /image\.contentType === "image\/jpeg" \? 1\.5 : 1/);
    // Der Prädiktor-Fix bleibt.
    assert.match(parser, /alreadyFiltered/);
  });

  it("überschreibt bestehende Werte weiterhin nicht automatisch", () => {
    assert.match(service, /preselected: isEmpty && !options\.neverPreselect/);
    assert.match(service, /conflict: !isEmpty/);
  });

  it("schreibt auch die neuen Felder nur nach Bestätigung", () => {
    for (const field of ["displacementCcm", "color", "stockNumber"]) {
      assert.match(service, new RegExp(`accepted\\.has\\("${field}"\\)`));
    }
  });

  it("gibt die neuen Angaben an den Social-Media-Prompt weiter", () => {
    const openai = readFileSync("src/integrations/openai/index.ts", "utf8");

    assert.match(openai, /if \(vehicle\.displacementCcm !== null\)/);
    assert.match(openai, /if \(vehicle\.color\) facts\.push/);
    assert.match(openai, /if \(vehicle\.transmission\)/);
  });

  it("weist beim Bildvorschlag auf eingeblendete Angaben hin", () => {
    const ui = readFileSync("src/components/admin/vehicle-price-sheet.tsx", "utf8");

    assert.match(
      ui,
      /Bitte\s*\n?\s*prüfen Sie eingeblendete Preis-, Finanzierungs- und/,
    );
  });

  it("holt nichts nach und führt nichts aus", () => {
    const layout = readFileSync(
      "src/modules/vehicles/price-sheet-layout.ts",
      "utf8",
    );

    assert.ok(!/fetch\(|axios|eval\(|new Function|child_process/.test(layout));
  });
});
