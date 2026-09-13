import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decodeImage,
  extractImageMetadata,
  parsePdfObjects,
} from "@/modules/vehicles/price-sheet";
import {
  isVehicleListPdf,
  parseToUnicodeCMap,
  parseVehicleListObjects,
  parseVehicleListPdf,
} from "@/modules/vehicles/vehicle-list-pdf";

/**
 * Fahrzeuglisten-PDF ("Unser Fahrzeugbestand vom …").
 *
 * Die Fixture bildet den Aufbau der echten Datei nach: ein Browser-Druck mit
 * CID-Fonts, deren Text als Glyph-IDs im Inhaltsstrom steht und erst über
 * die ToUnicode-CMap lesbar wird; Karten in zwei Spalten, je Karte ein Foto.
 * Dazu ein Logo mit Transparenzmaske und eine winzige Dekografik, die beide
 * kein Fahrzeugbild sind.
 *
 * Gegen die echte Datei (32 Karten auf drei Seiten) läuft am Ende ein
 * Test, der übersprungen wird, wenn sie nicht vorliegt.
 */

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

/** Glyph-ID = Zeichencode (Latin-1); das Eurozeichen bekommt eine eigene ID. */
function hex(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch === "€" ? 0x0164 : ch === "…" ? 0x015b : ch.codePointAt(0)!;
      return code.toString(16).padStart(4, "0");
    })
    .join("");
}

const CMAP = `/CIDInit /ProcSet findresource begin
begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar
<0164> <20AC>
<015B> <2026>
endbfchar
1 beginbfrange
<0020> <00FF> <0020>
endbfrange
endcmap`;

type CardSpec = {
  column: 0 | 1;
  row: number;
  title: string;
  price: string;
  variant: string;
  baujahr: string;
  km: string;
  leistung: string;
  hubraum: string;
  farbe: string;
  antrieb: string;
  /** Bild weglassen – Karte ohne Foto. */
  noImage?: boolean;
};

function buildListPdf(cards: CardSpec[], options: { heading?: string } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
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

  const cmap = pushStream("", Buffer.from(CMAP, "latin1"));
  const bold = push(
    `<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+OpenSans-Bold /Encoding /Identity-H /ToUnicode ${cmap} 0 R >>`,
  );
  const regular = push(
    `<< /Type /Font /Subtype /Type0 /BaseFont /BAAAAA+OpenSans-Regular /Encoding /Identity-H /ToUnicode ${cmap} 0 R >>`,
  );

  // Logo mit Transparenzmaske und kleine Dekografik – keine Fahrzeugbilder.
  const mask = pushStream("/Type /XObject /Subtype /Image /Width 200 /Height 60 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode", FAKE_JPEG);
  const logo = pushStream(`/Type /XObject /Subtype /Image /Width 200 /Height 60 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /SMask ${mask} 0 R`, FAKE_JPEG);
  const deco = pushStream("/Type /XObject /Subtype /Image /Width 40 /Height 40 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", FAKE_JPEG);

  const xobjects: string[] = [`/L ${logo} 0 R`, `/D ${deco} 0 R`];
  const content: string[] = ["1 0 0 -1 0 842 cm"];

  const text = (font: number, x: number, yTop: number, value: string) =>
    content.push(`BT /F${font} 10 Tf 1 0 0 -1 ${x} ${yTop} Tm <${hex(value)}> Tj ET`);

  text(bold, 194, 46, options.heading ?? "Unser Fahrzeugbestand vom 13.09.2026");
  content.push("q 200 0 0 60 20 10 cm /L Do Q");
  content.push("q 10 0 0 10 560 800 cm /D Do Q");

  cards.forEach((card, i) => {
    const x = card.column === 0 ? 35 : 316;
    const top = 87 + card.row * 113;
    const photoX = card.column === 0 ? 47 : 328;

    if (!card.noImage) {
      const image = pushStream("/Type /XObject /Subtype /Image /Width 640 /Height 640 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode", FAKE_JPEG);
      xobjects.push(`/X${i} ${image} 0 R`);
      content.push(`q 52 0 0 52 ${photoX} ${top + 4} cm /X${i} Do Q`);
    }

    const [make, model] = card.title.split(" | ");
    text(regular, x, top, make);
    text(regular, x + 26, top, " | ");
    text(regular, x + 37, top, model);
    text(bold, x + 208, top + 2, card.price);
    text(regular, x + 81, top + 12, card.variant);

    const rows: [string, string, string, string][] = [
      ["Baujahr", card.baujahr, "KM", card.km],
      ["Leistung", card.leistung, "Hubraum", card.hubraum],
      ["Farbe", card.farbe, "Antrieb", card.antrieb],
    ];
    rows.forEach(([l1, v1, l2, v2], r) => {
      const y = top + 26 + r * 11.3;
      text(bold, x + 81, y, l1);
      text(regular, x + 131, y, v1);
      text(bold, x + 165, y, l2);
      text(regular, x + 223, y, v2);
    });
  });

  const contents = pushStream("", Buffer.from(content.join("\n"), "latin1"));
  push(
    `<< /Type /Page /MediaBox [0 0 594.96 841.92] /Resources << /Font << /F${bold} ${bold} 0 R /F${regular} ${regular} 0 R >> /XObject << ${xobjects.join(" ")} >> >> /Contents ${contents} 0 R >>`,
  );

  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}

const BMW: CardSpec = {
  column: 0, row: 0,
  title: "BMW | X5 Reihe", price: "€ 17.990",
  variant: "X5 xDrive 30d *Pano*Memory*HeadUp*…",
  baujahr: "12/2016", km: "294.330", leistung: "190 kW", hubraum: "2.993",
  farbe: "Grau", antrieb: "Allrad",
};

const MERCEDES: CardSpec = {
  column: 1, row: 0,
  title: "Mercedes-Benz | C-Klasse", price: "€ 29.190",
  variant: "C 250",
  baujahr: "05/2017", km: "112.419", leistung: "155 kW", hubraum: "1.991",
  farbe: "Grau", antrieb: "Hinterrad",
};

const MASTER: CardSpec = {
  column: 0, row: 1,
  title: "Renault | Master", price: "€ 33.500",
  variant: "Master",
  baujahr: "01/2021", km: "10.961", leistung: "132 kW", hubraum: "---",
  farbe: "Weiß", antrieb: "---",
};

// ---------------------------------------------------------------------------
// CMap
// ---------------------------------------------------------------------------

describe("ToUnicode-CMap", () => {
  it("liest bfchar und bfrange", () => {
    const map = parseToUnicodeCMap(CMAP);
    assert.equal(map.get(0x0164), "€");
    assert.equal(map.get(0x0041), "A");
    assert.equal(map.get(0x00df), "ß");
  });

  it("liest die echte Form mit mehreren Blöcken", () => {
    const map = parseToUnicodeCMap(
      "2 beginbfchar <0003> <0020> <0164> <20AC> endbfchar 1 beginbfrange <0013> <001C> <0030> endbfrange",
    );
    assert.equal(map.get(3), " ");
    assert.equal(map.get(0x13), "0");
    assert.equal(map.get(0x1c), "9");
  });
});

// ---------------------------------------------------------------------------
// Karten
// ---------------------------------------------------------------------------

describe("Fahrzeugkarten", () => {
  const list = parseVehicleListPdf(buildListPdf([BMW, MERCEDES, MASTER]));

  it("erkennt die Liste an ihrer Überschrift", () => {
    assert.equal(isVehicleListPdf(parsePdfObjects(buildListPdf([BMW]))), true);
    assert.equal(
      isVehicleListPdf(parsePdfObjects(buildListPdf([BMW], { heading: "Preisblatt" }))),
      false,
    );
    assert.equal(list.listedAt, "13.09.2026");
  });

  it("findet jede Karte genau einmal, in Lesereihenfolge", () => {
    assert.equal(list.cards.length, 3);
    assert.deepEqual(
      list.cards.map((c) => `${c.make} ${c.model}`),
      ["BMW X5 Reihe", "Mercedes-Benz C-Klasse", "Renault Master"],
    );
    assert.deepEqual(list.cards.map((c) => c.key), ["1-1", "1-2", "1-3"]);
  });

  it("liest alle Felder einer Karte", () => {
    const bmw = list.cards[0];
    assert.equal(bmw.priceCents, 1_799_000);
    assert.equal(bmw.firstRegistration?.toISOString(), "2016-12-01T00:00:00.000Z");
    assert.equal(bmw.year, 2016);
    assert.equal(bmw.mileageKm, 294_330);
    assert.equal(bmw.powerKw, 190);
    assert.equal(bmw.displacementCcm, 2993);
    assert.equal(bmw.color, "Grau");
    assert.equal(bmw.drivetrain, "ALL_WHEEL");
  });

  it("hält die Angaben der linken Karte von der rechten fern", () => {
    // Die rechte Hälfte einer linken Karte liegt weit über der Seitenmitte –
    // eine Mittel-Trennung würde Preis und Kilometer der falschen Karte geben.
    const mercedes = list.cards[1];
    assert.equal(mercedes.priceCents, 2_919_000);
    assert.equal(mercedes.mileageKm, 112_419);
    assert.equal(mercedes.powerKw, 155);
    assert.equal(mercedes.drivetrain, "REAR_WHEEL");
  });

  it("erkennt gekürzte Bezeichnungen und entfernt die Auslassungspunkte", () => {
    assert.equal(list.cards[0].variantTruncated, true);
    assert.equal(list.cards[0].variant, "X5 xDrive 30d *Pano*Memory*HeadUp*");
    assert.equal(list.cards[1].variantTruncated, false);
    assert.equal(list.cards[1].variant, "C 250");
  });

  it("liest „---“ als keine Angabe", () => {
    const master = list.cards[2];
    assert.equal(master.displacementCcm, null);
    assert.equal(master.drivetrain, null);
    assert.equal(master.powerKw, 132);
    assert.deepEqual(master.warnings, []);
  });

  it("führt weder FIN noch GW-Nr – die Liste hat keine", () => {
    for (const card of list.cards) {
      assert.equal(card.vin, null);
      assert.equal(card.stockNumber, null);
    }
  });
});

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

describe("Fotos", () => {
  it("ordnet jeder Karte ihr eigenes Foto zu – nicht das größte der Seite", () => {
    const list = parseVehicleListPdf(buildListPdf([BMW, MERCEDES, MASTER]));
    const numbers = list.cards.map((c) => c.image?.objectNumber ?? null);

    assert.ok(numbers.every((n) => n !== null), "jede Karte hat ein Foto");
    assert.equal(new Set(numbers).size, 3, "drei verschiedene Fotos");
    // Reihenfolge der Objekte folgt der Kartenreihenfolge im Aufbau.
    assert.ok(numbers[0]! < numbers[1]! && numbers[1]! < numbers[2]!);
  });

  it("verwendet weder das Logo noch die Dekografik als Fahrzeugbild", () => {
    const objects = parsePdfObjects(buildListPdf([BMW]));
    const list = parseVehicleListObjects(objects);

    const logo = [...objects.values()].find((o) => /\/SMask/.test(o.dict.toString("latin1")));
    const deco = [...objects.values()].find((o) => /\/Width 40\b/.test(o.dict.toString("latin1")));
    assert.ok(logo && deco);
    assert.notEqual(list.cards[0].image?.objectNumber, logo.number);
    assert.notEqual(list.cards[0].image?.objectNumber, deco.number);
    assert.equal(list.cards[0].image?.widthPx, 640);
  });

  it("lässt eine Karte ohne Foto ohne Foto", () => {
    // Ohne Foto gibt es keinen Anker – die Karte wird nicht erkannt; die
    // Nachbarkarte bekommt ihre Angaben nicht zugeschlagen.
    const list = parseVehicleListPdf(buildListPdf([{ ...BMW, noImage: true }, MERCEDES]));
    assert.equal(list.cards.length, 1);
    assert.equal(list.cards[0].make, "Mercedes-Benz");
    assert.equal(list.cards[0].priceCents, 2_919_000);
  });
});

// ---------------------------------------------------------------------------
// Echte Datei
// ---------------------------------------------------------------------------

const REAL = `${process.env.HOME}/Downloads/Fahrzeugbestand-13.09.2026.pdf`;

describe("Echte Fahrzeugliste", { skip: !existsSync(REAL) }, () => {
  it("liest 32 Karten auf drei Seiten vollständig", () => {
    const list = parseVehicleListPdf(readFileSync(REAL));

    assert.equal(list.pages, 3);
    assert.equal(list.cards.length, 32);
    assert.equal(list.listedAt, "13.09.2026");
    assert.deepEqual(list.warnings, []);

    for (const card of list.cards) {
      assert.ok(card.make && card.model, `${card.key}: Titel`);
      assert.ok(card.priceCents !== null && card.priceCents > 0, `${card.key}: Preis`);
      assert.ok(card.firstRegistration, `${card.key}: Baujahr`);
      assert.ok(card.mileageKm !== null && card.mileageKm > 0, `${card.key}: Kilometer`);
      assert.ok(card.powerKw !== null && card.powerKw > 0, `${card.key}: Leistung`);
      assert.ok(card.image, `${card.key}: Foto`);
      assert.deepEqual(card.warnings, [], `${card.key}: ${card.warnings.join("; ")}`);
    }

    const first = list.cards[0];
    assert.equal(`${first.make} ${first.model}`, "BMW X5 Reihe");
    assert.equal(first.priceCents, 649_000);
    assert.equal(first.mileageKm, 230_000);
    assert.equal(first.powerKw, 173);
    assert.equal(first.drivetrain, "ALL_WHEEL");

    const master = list.cards.find((c) => c.model === "Master");
    assert.equal(master?.drivetrain, null);
    assert.equal(master?.displacementCcm, 2299);
  });
});

// ---------------------------------------------------------------------------
// Vorschau ohne Bilddaten
// ---------------------------------------------------------------------------

describe("Bilder erst beim Bestätigen", () => {
  it("liefert in der Vorschau nur Metadaten, keine Bilddaten", () => {
    const objects = parsePdfObjects(buildListPdf([BMW, MERCEDES]));
    const metadata = extractImageMetadata(objects);

    const photos = metadata.filter((m) => !m.hasAlpha && m.widthPx >= 120);
    assert.equal(photos.length, 2);
    for (const meta of metadata) {
      assert.ok(!("data" in meta), "Metadaten tragen keine Bytes");
      assert.ok(meta.decode.kind === "jpeg" || meta.decode.kind === "flate");
    }
  });

  it("dekodiert ein einzelnes Bild anhand seiner Metadaten", () => {
    const objects = parsePdfObjects(buildListPdf([BMW]));
    const list = parseVehicleListObjects(objects);
    const meta = extractImageMetadata(objects).find(
      (m) => m.objectNumber === list.cards[0].image?.objectNumber,
    );
    assert.ok(meta);

    const image = decodeImage(objects, meta);
    assert.ok(image);
    assert.equal(image.contentType, "image/jpeg");
    assert.deepEqual([...image.data.subarray(0, 2)], [0xff, 0xd8], "JPEG-Signatur");
  });

  it("erkennt die Liste im selben Durchlauf, ohne die erste Seite doppelt zu lesen", () => {
    const list = parseVehicleListObjects(parsePdfObjects(buildListPdf([BMW])));
    assert.equal(list.recognized, true);

    const other = parseVehicleListObjects(
      parsePdfObjects(buildListPdf([BMW], { heading: "Preisblatt" })),
    );
    assert.equal(other.recognized, false);

    const service = readFileSync("src/modules/vehicles/import-service.ts", "utf8");
    assert.match(service, /if \(!list\.recognized\)/);
    assert.ok(!/isVehicleListPdf\(/.test(service), "kein zweiter Seitenlauf im Service");
  });

  it("liest die CMap je Schrift nur einmal über alle Seiten", () => {
    const source = readFileSync("src/modules/vehicles/vehicle-list-pdf.ts", "utf8");
    assert.match(source, /cache: Map<number, FontMap>/);
    assert.match(source, /const fontCache = new Map<number, FontMap>\(\)/);
  });
});
