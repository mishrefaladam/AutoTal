import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { deflateSync, inflateSync } from "node:zlib";

import {
  encodePng,
  extractFormFields,
  extractImages,
  isEncrypted,
  looksLikePdf,
  pageWidthPt,
  parsePdfObjects,
  rankVehicleImages,
} from "@/modules/vehicles/price-sheet";
import {
  checkPlausibility,
  kwToPs,
  mapPriceSheet,
  parseFuel,
  parsePowerKw,
  parseRegistration,
  parseTransmission,
  proposeDescription,
} from "@/modules/vehicles/price-sheet-mapping";

/**
 * Preisblatt-Import.
 *
 * Die Fixtures werden hier erzeugt statt als Datei mitgeliefert: Sie bleiben
 * damit klein, enthalten keine Kunden- oder Händlerdaten und lassen sich für
 * jeden Fall genau zuschneiden – etwa für ein Logo, das groß genug wäre, um
 * eine reine Pixelprüfung zu bestehen.
 *
 * Gegen zwei echte willhaben-Blätter wurde derselbe Code gesondert geprüft –
 * die Preisblatt-Vorlage und ein Verkaufsangebot mit Fahrzeugfoto. Die dort
 * gemessenen Werte stehen in den Kommentaren und bestimmen die Schwellen.
 */

// ---------------------------------------------------------------------------
// Minimale PDFs bauen
// ---------------------------------------------------------------------------

type ImageSpec = {
  widthPx: number;
  heightPx: number;
  /** Zeichengröße auf der Seite in Punkt. */
  drawnWidthPt: number;
  drawnHeightPt: number;
  withAlpha?: boolean;
  /** DCTDecode – im PDF liegt dann bereits eine JPEG-Datei. */
  jpeg?: boolean;
  /** PNG-Prädiktor: Die Zeilen tragen ihr Filterbyte schon selbst. */
  predictor?: boolean;
};

/** Kleinste erkennbare JPEG-Signatur; der Inhalt wird nie decodiert. */
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

function buildPdf(options: {
  fields?: Record<string, string>;
  /** Werte, die als Hex-String abgelegt werden (wie das Preisfeld der Vorlage). */
  hexFields?: Record<string, string>;
  images?: ImageSpec[];
}): Buffer {
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

  for (const [name, value] of Object.entries(options.fields ?? {})) {
    const escaped = value.replace(/([()\\])/g, "\\$1").replace(/\n/g, "\\n");
    push(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /V (${escaped}) >>`);
  }

  for (const [name, value] of Object.entries(options.hexFields ?? {})) {
    // PDFDocEncoding: 0xA0 ist das Eurozeichen.
    const hex = Buffer.from(value.replace(/€/g, " "), "latin1").toString("hex");
    push(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /V <${hex}> >>`);
  }

  const imageRefs: { name: string; number: number; spec: ImageSpec }[] = [];

  (options.images ?? []).forEach((spec, index) => {
    const maskRef = spec.withAlpha
      ? pushStream(
          `/Type /XObject /Subtype /Image /Filter /FlateDecode /BitsPerComponent 8 ` +
            `/Width ${spec.widthPx} /Height ${spec.heightPx} /ColorSpace /DeviceGray`,
          deflateSync(Buffer.alloc(spec.widthPx * spec.heightPx, 0xff)),
        )
      : null;

    const common =
      `/Type /XObject /Subtype /Image /BitsPerComponent 8 ` +
      `/Width ${spec.widthPx} /Height ${spec.heightPx} /ColorSpace /DeviceRGB` +
      (maskRef ? ` /SMask ${maskRef} 0 R` : "");

    let number: number;

    if (spec.jpeg) {
      number = pushStream(`${common} /Filter /DCTDecode`, FAKE_JPEG);
    } else if (spec.predictor) {
      // Wie ein echter Erzeuger: je Zeile ein Filterbyte, dann die Bildpunkte.
      const stride = spec.widthPx * 3;
      const rows = Buffer.alloc((stride + 1) * spec.heightPx);
      for (let y = 0; y < spec.heightPx; y += 1) {
        rows[y * (stride + 1)] = 0;
        rows.fill(0x80, y * (stride + 1) + 1, (y + 1) * (stride + 1));
      }
      number = pushStream(
        `${common} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 ` +
          `/BitsPerComponent 8 /Columns ${spec.widthPx} >>`,
        deflateSync(rows),
      );
    } else {
      number = pushStream(
        `${common} /Filter /FlateDecode`,
        deflateSync(Buffer.alloc(spec.widthPx * spec.heightPx * 3, 0x80)),
      );
    }

    imageRefs.push({ name: `Im${index + 1}`, number, spec });
  });

  const content = imageRefs
    .map(
      ({ name, spec }) =>
        `q ${spec.drawnWidthPt} 0 0 ${spec.drawnHeightPt} 50 400 cm /${name} Do Q`,
    )
    .join("\n");

  const contentRef = pushStream("", Buffer.from(content, "latin1"));

  const xobjects = imageRefs
    .map(({ name, number }) => `/${name} ${number} 0 R`)
    .join(" ");

  push(
    `<< /Type /Page /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /XObject << ${xobjects} >> >> /Contents ${contentRef} 0 R >>`,
  );

  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));

  return Buffer.concat(parts);
}

/** Die Felder der echten willhaben-Vorlage. */
const TEMPLATE_FIELDS = {
  Marke: "BMW",
  Bezeichnung: "X3 xDrive 20d M-Paket Aut.",
  Erstzulassung: "03.2015",
  Kilometer: "245.858",
  Leistung: "140 KW (190 PS)",
  Getriebe: "Automatik",
  Treibstoff: "Diesel",
  Abgasnorm: "",
  Highlights_1: "ABS",
  Highlights_2: "Alufelgen",
  Highlights_3: "Lederausstattung",
  Highlights_4: "Navigationssystem",
  Highlights_5: "Sitzheizung vorne",
  // Nichts davon darf zu Fahrzeugdaten werden.
  Dealer_Name: "Autotal e.U.",
  Dealer_Footer: "Hauptstraße 147 - 2231 Strasshof - autotal.office@example.com",
  Anzahlung: "6.490,00",
  Rate: "210,00",
  Laufzeit: "60",
  Restwert: "0,00",
  FD1: "Erstzulassung",
  FD2: "Kilometer",
  FB1: "Anzahlung",
};

const VEHICLE = { make: "BMW", model: "X3 Reihe", variant: null };

// ---------------------------------------------------------------------------
// 5–13: Feldextraktion
// ---------------------------------------------------------------------------

describe("Felder aus dem Preisblatt", () => {
  const pdf = buildPdf({
    fields: TEMPLATE_FIELDS,
    hexFields: { Preis: "€ 16.490,-" },
  });
  const values = mapPriceSheet(extractFormFields(parsePdfObjects(pdf)));

  it("erkennt die Datei als PDF und nicht als verschlüsselt", () => {
    assert.equal(looksLikePdf(pdf), true);
    assert.equal(isEncrypted(pdf), false);
    assert.equal(Math.round(pageWidthPt(parsePdfObjects(pdf)) ?? 0), 595);
  });

  it("liest die Marke", () => {
    assert.equal(values.make, "BMW");
  });

  it("liest die Bezeichnung als Modellbezeichnung", () => {
    assert.equal(values.variant, "X3 xDrive 20d M-Paket Aut.");
  });

  it("liest die Erstzulassung als Monatserster", () => {
    assert.equal(values.firstRegistration?.toISOString().slice(0, 10), "2015-03-01");
  });

  it("liest den Kilometerstand im deutschen Format", () => {
    assert.equal(values.mileageKm, 245_858);
  });

  it("liest die Leistung in kW und rechnet PS daraus", () => {
    assert.equal(values.powerKw, 140);
    assert.equal(kwToPs(140), 190);
  });

  it("liest das Getriebe", () => {
    assert.equal(values.transmission, "AUTOMATIC");
  });

  it("liest den Treibstoff", () => {
    assert.equal(values.fuel, "DIESEL");
  });

  it("liest den Preis aus einem Hex-String mit Eurozeichen", () => {
    // Die Vorlage legt den Preis als <A0 20 ...> ab; 0xA0 ist in
    // PDFDocEncoding das Eurozeichen, nicht ein geschütztes Leerzeichen.
    assert.equal(values.priceCents, 1_649_000);
  });

  it("liest alle Highlights in der Reihenfolge der Vorlage", () => {
    assert.deepEqual(values.highlights, [
      "ABS",
      "Alufelgen",
      "Lederausstattung",
      "Navigationssystem",
      "Sitzheizung vorne",
    ]);
  });

  it("übernimmt weder Händlerangaben noch Finanzierungsparameter", () => {
    const serialized = JSON.stringify(values);

    for (const forbidden of ["Autotal e.U.", "Hauptstraße", "example.com", "6.490"]) {
      assert.ok(
        !serialized.includes(forbidden),
        `"${forbidden}" darf keine Fahrzeugangabe werden`,
      );
    }
    // Auch die Beschriftungsfelder der Vorlage sind keine Werte.
    assert.ok(!serialized.includes("Laufzeit"));
  });

  it("verwechselt /T nicht mit /Type", () => {
    // Im Feldwörterbuch steht "/Type /Annot" vor "/T (Marke)". Ohne
    // Namensgrenze läse die Suche "Annot" als Feldnamen – und fände nichts.
    const fields = extractFormFields(parsePdfObjects(pdf));
    assert.ok(Object.keys(fields).includes("Marke"));
    assert.ok(!Object.keys(fields).includes("Annot"));
  });
});

describe("Einzelne Werte", () => {
  it("liest verschiedene Schreibweisen der Erstzulassung", () => {
    assert.equal(parseRegistration("03.2015")?.toISOString().slice(0, 7), "2015-03");
    assert.equal(parseRegistration("03/2015")?.toISOString().slice(0, 7), "2015-03");
    assert.equal(parseRegistration("2015")?.toISOString().slice(0, 7), "2015-01");
    assert.equal(parseRegistration("keine Angabe"), null);
  });

  it("liest die Leistung aus kW und ersatzweise aus PS", () => {
    assert.equal(parsePowerKw("140 KW (190 PS)"), 140);
    assert.equal(parsePowerKw("190 PS"), 140);
    assert.equal(parsePowerKw("110"), 110);
    assert.equal(parsePowerKw("stark"), null);
  });

  it("unterscheidet Hybrid von Plug-in-Hybrid", () => {
    assert.equal(parseFuel("Plug-in-Hybrid"), "PLUGIN_HYBRID");
    assert.equal(parseFuel("Hybrid"), "HYBRID");
    assert.equal(parseFuel("Diesel"), "DIESEL");
    assert.equal(parseFuel(""), null);
    assert.equal(parseFuel("Sonstiges"), null);
  });

  it("erkennt gängige Getriebebezeichnungen", () => {
    assert.equal(parseTransmission("Automatik"), "AUTOMATIC");
    assert.equal(parseTransmission("DSG"), "AUTOMATIC");
    assert.equal(parseTransmission("Schaltgetriebe"), "MANUAL");
    assert.equal(parseTransmission("Halbautomatik"), "SEMI_AUTOMATIC");
    assert.equal(parseTransmission("unbekannt"), null);
  });
});

// ---------------------------------------------------------------------------
// Händlerwerbung
// ---------------------------------------------------------------------------

describe("Beschreibungsvorschlag", () => {
  // Aufbau wie im echten Details-Feld der Vorlage.
  const details = [
    "AUTOTAL - IHR PARTNER FÜR GEPFLEGTE FAHRZEUGE",
    "",
    "Willkommen bei AUTOTAL!",
    "Wir bieten Ihnen eine sorgfältig ausgewählte Auswahl an gepflegten Fahrzeugen.",
    "",
    "—UNSER FAHRZEUGANGEBOT—",
    "BMW X3 20d M-Paket",
    "|2.0 TDI | 03/2015 | 245.858 km| Automatik",
    "Fahrzeugpreis: 16.490€",
    "Anzahlung: 6.490€",
    "Laufzeit: 60 Monate",
    "",
    "| FINANZIERUNG MÖGLICH |",
    "Sie möchten Ihr Fahrzeug bequem finanzieren?",
    "Persönliche Beratung",
    "",
    "AUTOTAL",
    "Hauptstraße 147",
    "2231 Strasshof",
    "Email: autotal.office@example.com",
  ].join("\n");

  const proposal = proposeDescription(details, "BMW");

  it("behält nur die Fahrzeugzeilen", () => {
    assert.equal(proposal.text, "BMW X3 20d M-Paket\n|2.0 TDI | 03/2015 | 245.858 km| Automatik");
  });

  it("übernimmt keine Werbung, keine Kontaktdaten und keine Finanzierung", () => {
    for (const forbidden of [
      "Willkommen",
      "Beratung",
      "finanzieren",
      "Anzahlung",
      "Laufzeit",
      "Hauptstraße",
      "example.com",
      "Strasshof",
    ]) {
      assert.ok(
        !proposal.text.includes(forbidden),
        `"${forbidden}" gehört nicht in eine Fahrzeugbeschreibung`,
      );
    }
  });

  it("wiederholt den Preis nicht – der ist ein eigenes Feld", () => {
    assert.ok(!proposal.text.includes("16.490"));
  });

  it("zählt die ausgeschiedenen Absätze, statt sie stillschweigend zu verwerfen", () => {
    assert.ok(proposal.droppedParagraphs > 0);
  });
});

// ---------------------------------------------------------------------------
// 16: falsches Fahrzeug
// ---------------------------------------------------------------------------

describe("Plausibilität", () => {
  const values = mapPriceSheet(extractFormFields(parsePdfObjects(buildPdf({ fields: TEMPLATE_FIELDS }))));

  it("meldet nichts, wenn das Blatt zum Fahrzeug passt", () => {
    assert.deepEqual(checkPlausibility(values, VEHICLE), []);
  });

  it("warnt bei abweichender Marke", () => {
    const warnings = checkPlausibility(values, {
      make: "Audi",
      model: "A4",
      variant: null,
    });

    assert.ok(warnings.length > 0);
    assert.match(warnings[0], /möglicherweise zu einem anderen Fahrzeug/);
  });

  it("warnt, wenn das Modell in der Bezeichnung fehlt", () => {
    const warnings = checkPlausibility(values, {
      make: "BMW",
      model: "1er Reihe",
      variant: null,
    });

    assert.ok(warnings.some((warning) => /Modell/.test(warning)));
  });
});

// ---------------------------------------------------------------------------
// 17–19: Bildextraktion
// ---------------------------------------------------------------------------

describe("Bild aus dem Preisblatt", () => {
  it("erkennt ein großflächig gezeichnetes Fahrzeugbild", () => {
    const pdf = buildPdf({
      fields: TEMPLATE_FIELDS,
      images: [
        { widthPx: 1200, heightPx: 800, drawnWidthPt: 500, drawnHeightPt: 333 },
      ],
    });

    const { candidates } = rankVehicleImages(extractImages(parsePdfObjects(pdf)));

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].widthPx, 1200);
    assert.equal(candidates[0].contentType, "image/png");
    assert.ok(candidates[0].data.length > 0);
  });

  it("wählt kein Logo, das nur eine Ecke der Seite einnimmt", () => {
    // Preisblatt-Vorlage, gemessen: 400x240 Pixel – groß genug, um eine reine
    // Pixelprüfung zu bestehen –, gezeichnet auf 91x55 Punkt (15 % Breite),
    // mit Transparenzmaske.
    const pdf = buildPdf({
      fields: TEMPLATE_FIELDS,
      images: [
        {
          widthPx: 400,
          heightPx: 240,
          drawnWidthPt: 91,
          drawnHeightPt: 54.6,
          withAlpha: true,
        },
      ],
    });

    const { candidates, rejected } = rankVehicleImages(
      extractImages(parsePdfObjects(pdf)),
    );

    assert.equal(candidates.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /Transparenzmaske/);
  });

  it("erkennt das Fahrzeugfoto des echten Verkaufsangebots", () => {
    // Gemessen im Verkaufsangebot: Foto 640x640 JPEG ohne Transparenz auf
    // 24,7 % der Seitenbreite, Logo 400x240 mit Maske auf 28,0 %.
    //
    // Das Entscheidende daran: Das LOGO wird BREITER gezeichnet als das Foto.
    // Eine Schwelle auf die Zeichenbreite kann die beiden also gar nicht
    // trennen – das leistet nur die Transparenz.
    const pdf = buildPdf({
      images: [
        {
          widthPx: 640,
          heightPx: 640,
          drawnWidthPt: 147,
          drawnHeightPt: 147,
          jpeg: true,
        },
        {
          widthPx: 400,
          heightPx: 240,
          drawnWidthPt: 166.7,
          drawnHeightPt: 100,
          withAlpha: true,
        },
      ],
    });

    const { candidates, rejected } = rankVehicleImages(
      extractImages(parsePdfObjects(pdf)),
    );

    assert.equal(candidates.length, 1, "genau das Foto ist Kandidat");
    assert.equal(candidates[0].widthPx, 640);
    assert.equal(candidates[0].contentType, "image/jpeg");
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /Transparenzmaske/);
  });

  it("übernimmt einen JPEG-Stream unverändert", () => {
    // DCTDecode ist bereits eine JPEG-Datei – neu zu codieren hieße, ein Foto
    // ohne Not ein zweites Mal verlustbehaftet zu komprimieren.
    const pdf = buildPdf({
      images: [
        { widthPx: 640, heightPx: 640, drawnWidthPt: 147, drawnHeightPt: 147, jpeg: true },
      ],
    });

    const [image] = extractImages(parsePdfObjects(pdf));

    assert.equal(image.contentType, "image/jpeg");
    assert.deepEqual([...image.data.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  });

  it("verarbeitet Bilder mit PNG-Prädiktor, statt Rauschen zu erzeugen", () => {
    // /DecodeParms /Predictor 15 heißt: Jede Zeile trägt ihr Filterbyte
    // bereits. Ein zweites davorzusetzen verschiebt jede Zeile um ein Byte –
    // das Ergebnis ist Bildrauschen. Genau so kam das Logo des echten
    // Verkaufsangebots zunächst heraus.
    const pdf = buildPdf({
      images: [
        {
          widthPx: 400,
          heightPx: 300,
          drawnWidthPt: 300,
          drawnHeightPt: 225,
          predictor: true,
        },
      ],
    });

    const [image] = extractImages(parsePdfObjects(pdf));
    assert.equal(image.contentType, "image/png");

    // Die Bildpunkte müssen exakt der Vorlage entsprechen.
    const idatStart = image.data.indexOf(Buffer.from("IDAT", "latin1")) + 4;
    const idatLength = image.data.readUInt32BE(idatStart - 8);
    const pixels = inflateSync(image.data.subarray(idatStart, idatStart + idatLength));

    assert.equal(pixels.length, 300 * (400 * 3 + 1));
    assert.equal(pixels[0], 0, "Filterbyte der ersten Zeile");
    assert.equal(pixels[1], 0x80, "erster Bildpunkt");
    assert.equal(pixels[400 * 3 + 1], 0, "Filterbyte der zweiten Zeile");
  });

  it("führt die Alphamaske nicht als eigenes Bild", () => {
    const pdf = buildPdf({
      images: [
        {
          widthPx: 1200,
          heightPx: 800,
          drawnWidthPt: 500,
          drawnHeightPt: 333,
          withAlpha: true,
        },
      ],
    });

    // Ohne diese Regel stünde die Graustufenmaske als zweiter Vorschlag da.
    assert.equal(extractImages(parsePdfObjects(pdf)).length, 1);
  });

  it("stellt das größer gezeichnete Bild voran", () => {
    const pdf = buildPdf({
      images: [
        { widthPx: 900, heightPx: 600, drawnWidthPt: 260, drawnHeightPt: 173 },
        { widthPx: 900, heightPx: 600, drawnWidthPt: 520, drawnHeightPt: 346 },
      ],
    });

    const { candidates } = rankVehicleImages(extractImages(parsePdfObjects(pdf)));

    assert.equal(candidates.length, 2);
    assert.ok(
      (candidates[0].drawnWidthPt ?? 0) > (candidates[1].drawnWidthPt ?? 0),
    );
  });

  it("liefert ohne Bild einen sauberen Leerbefund", () => {
    const pdf = buildPdf({ fields: TEMPLATE_FIELDS });
    const { candidates, rejected } = rankVehicleImages(
      extractImages(parsePdfObjects(pdf)),
    );

    assert.deepEqual(candidates, []);
    assert.deepEqual(rejected, []);
  });

  it("erzeugt ein gültiges PNG aus rohen Bildpunkten", () => {
    const png = encodePng(Buffer.alloc(4 * 3 * 3, 0x40), 4, 3, 3);

    assert.deepEqual(
      [...png.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    assert.equal(png.subarray(12, 16).toString("latin1"), "IHDR");
    assert.equal(png.readUInt32BE(16), 4);
    assert.equal(png.readUInt32BE(20), 3);
    assert.ok(png.includes(Buffer.from("IEND", "latin1")));
  });
});

// ---------------------------------------------------------------------------
// 1–4, 14, 15, 20: Endpunkt, Sicherheit und Übernahmeregeln
// ---------------------------------------------------------------------------

describe("Endpunkt und Übernahme", () => {
  const route = readFileSync(
    "src/app/api/admin/vehicles/[id]/price-sheet/route.ts",
    "utf8",
  );
  const service = readFileSync(
    "src/modules/vehicles/price-sheet-service.ts",
    "utf8",
  );
  const ui = readFileSync("src/components/admin/vehicle-price-sheet.tsx", "utf8");

  it("bietet Analyse und Übernahme getrennt an", () => {
    assert.match(route, /mode.*===\s*"apply"/);
    assert.match(route, /analysePriceSheet/);
    assert.match(route, /applyPriceSheet/);
  });

  it("weist Unangemeldete ab", () => {
    assert.match(route, /const session = await getAdminSession\(\)/);
    assert.match(route, /if \(!session\)/);
    assert.match(route, /status: 401/);
  });

  it("prüft, dass das Fahrzeug existiert, bevor es etwas liest", () => {
    // Ohne diese Prüfung ließe sich über eine fremde ID herausfinden, welche
    // Fahrzeuge es gibt.
    assert.match(route, /prisma\.vehicle\.findUnique/);
    assert.match(route, /status: 404/);
  });

  it("nimmt nur PDF an und begrenzt die Größe", () => {
    assert.match(service, /endsWith\("\.pdf"\)/);
    assert.match(service, /file\.type !== "application\/pdf"/);
    assert.match(service, /file\.size > MAX_PRICE_SHEET_BYTES/);
    assert.match(service, /looksLikePdf\(bytes\)/);
    assert.match(route, /status: 413/);
  });

  it("lehnt verschlüsselte PDFs mit klarer Meldung ab", () => {
    assert.match(service, /isEncrypted\(bytes\)/);
  });

  it("nimmt nur bekannte Feldnamen aus dem Browser an", () => {
    assert.match(route, /VALID_FIELDS\.has\(entry\)/);
  });

  it("überschreibt bestehende Werte nicht automatisch", () => {
    // Vorausgewählt wird ausschließlich, was am Fahrzeug leer ist.
    assert.match(service, /preselected: isEmpty && !options\.neverPreselect/);
    assert.match(service, /conflict: !isEmpty/);
  });

  it("lässt leere Preisblattwerte nichts überschreiben", () => {
    assert.match(service, /if \(proposed === null \|\| proposed\.trim\(\) === ""\) return null/);
  });

  it("schlägt eine Beschreibung nie zur automatischen Übernahme vor", () => {
    assert.match(service, /neverPreselect: true/);
  });

  it("schreibt nur bestätigte Felder", () => {
    assert.match(service, /const accepted = new Set\(input\.acceptedFields\)/);
    for (const field of ["variant", "mileageKm", "fuel", "transmission", "priceCents"]) {
      assert.match(service, new RegExp(`accepted\\.has\\("${field}"\\)`));
    }
  });

  it("verlangt bei Verdacht auf ein fremdes Fahrzeug eine Bestätigung", () => {
    assert.match(ui, /conflictsAcknowledged/);
    assert.match(ui, /Ich habe geprüft, dass das Preisblatt zu diesem Fahrzeug gehört/);
  });

  it("nennt den Fallback, wenn kein Bild erkannt wurde", () => {
    assert.match(
      ui,
      /Kein geeignetes Fahrzeugbild im Preisblatt erkannt\. Sie können\s*\n?\s*weiterhin manuell ein Bild hochladen\./,
    );
  });

  it("legt das Bild über den bestehenden Speicherdienst ab", () => {
    // Kein zweiter Upload-Weg und kein direkter Blob-Zugriff.
    assert.match(service, /getFileStorage\(\)/);
    assert.match(service, /storage\.upload\(/);
    assert.ok(!/@vercel\/blob/.test(service));
    assert.ok(!/BLOB_READ_WRITE_TOKEN/.test(service));
  });

  it("macht das übernommene Bild zum Titelbild, ohne bestehende zu löschen", () => {
    assert.match(service, /position: 0/);
    assert.match(service, /position: \{ increment: 1 \}/);
    assert.ok(!/vehicleImage\.delete/.test(service));
  });

  it("meldet einen Speicherfehler, ohne die Feldübernahme scheitern zu lassen", () => {
    assert.match(service, /Das erkannte Bild konnte nicht gespeichert werden/);
  });

  it("gibt keine Stacktraces und keine Secrets nach außen", () => {
    assert.match(route, /error instanceof UserFacingError/);
    assert.ok(!/error\.stack/.test(route));
    assert.ok(!/process\.env/.test(route));
  });

  it("ruft nichts aus dem PDF nach", () => {
    // Keine im Dokument genannte Adresse wird abgerufen, nichts ausgeführt.
    const parser = readFileSync("src/modules/vehicles/price-sheet.ts", "utf8");

    for (const [name, source] of [
      ["parser", parser],
      ["service", service],
      ["route", route],
    ] as const) {
      assert.ok(
        !/fetch\(|axios|child_process|eval\(|new Function/.test(source),
        `${name} darf nichts nachladen oder ausführen`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 21, 22: Social Media
// ---------------------------------------------------------------------------

describe("Anbindung an Social Media", () => {
  const openai = readFileSync("src/integrations/openai/index.ts", "utf8");
  const socialActions = readFileSync("src/modules/social/actions.ts", "utf8");

  it("gibt die übernommenen Fahrzeugdaten an den Prompt weiter", () => {
    for (const fact of [
      "vehicle.fuel",
      "vehicle.transmission",
      "vehicle.drivetrain",
      "vehicle.powerKw",
      "vehicle.displacementCcm",
      "vehicle.color",
      "vehicle.seats",
      "vehicle.doors",
      "vehicle.vehicleType",
      "vehicle.features",
      "vehicle.extras",
      "vehicle.highlights",
    ]) {
      assert.ok(openai.includes(fact), `${fact} fehlt im Prompt`);
    }
  });

  it("erfindet weiterhin nichts", () => {
    assert.match(openai, /if \(vehicle\.fuel\) facts\.push/);
    assert.match(openai, /if \(vehicle\.extras\.length > 0\)/);
    assert.match(openai, /if \(vehicle\.highlights\.length > 0\)/);
  });

  it("verwendet das erste Bild des Fahrzeugs für den Entwurf", () => {
    assert.match(socialActions, /imageUrls:\s*vehicle\.images\.slice\(0,\s*1\)/);
  });

  it("veröffentlicht weiterhin nichts automatisch", () => {
    const generateStart = socialActions.indexOf("export async function generateCaption");
    const updateStart = socialActions.indexOf("export async function updateDraft");
    const generate = socialActions.slice(generateStart, updateStart);

    assert.match(generate, /status:\s*"DRAFT"/);
    assert.ok(!/publishImagePost/.test(generate));
    assert.match(socialActions, /draft\.status\s*!==\s*"APPROVED"/);
  });
});
