import type { DrivetrainType } from "@/generated/prisma/enums";

import { parseEuroToCents, parseGermanInteger } from "./csv-import";
import {
  extractImages,
  pageWidthPt,
  parsePdfObjects,
  type PdfImage,
  type PdfObject,
} from "./price-sheet";

/**
 * Fahrzeuglisten-PDF aus Motornetzwerk/willhaben ("Unser Fahrzeugbestand vom …").
 *
 * AUFBAU DER DATEI: Ein Browser-Druck (Skia). Jede Seite zeigt Fahrzeugkarten
 * in zwei Spalten, jede Karte hat links ein Foto und rechts die Angaben:
 *
 *   BMW | X5 Reihe                                   € 6.490
 *   [Foto]  X5 3,0d Aut. EXPORT - HÄNDLER
 *           Baujahr   05/2007     KM        230.000
 *           Leistung  173 kW      Hubraum   2.993
 *           Farbe     Weiß        Antrieb   Allrad
 *
 * WIE DER TEXT VORLIEGT: Nicht als Klartext. Die Schriften sind CID-Fonts
 * (Identity-H), jeder Buchstabe steht als zweistellige Glyph-ID im
 * Inhaltsstrom: `<0037005000550047> Tj`. Lesbar wird das erst über die
 * ToUnicode-CMap, die jede Schrift mitbringt (bfchar/bfrange). Die Position
 * ergibt sich aus verschachtelten `cm`-Matrizen und der Textmatrix `Tm` –
 * beides muss mitgerechnet werden, sonst stimmt keine Koordinate.
 *
 * Kein OCR: Text und Bilder stehen vollständig in der Datei.
 *
 * KARTENERKENNUNG: Jede Karte hat genau ein Foto. Das Foto ist der Anker –
 * die Spalte ergibt sich aus seiner x-Position, die Zeile aus seiner
 * y-Position. Jeder Text wird der Karte zugeordnet, in deren Spalte er steht
 * und deren Foto ihm vertikal am nächsten liegt. Weil die Zeilen rund 110
 * Punkt auseinanderliegen, ist das eindeutig.
 *
 * Das Foto gehört damit von Anfang an zu seiner Karte. Ein "größtes Bild
 * gewinnt" gibt es hier nicht – bei 32 Fahrzeugen wäre das immer falsch.
 *
 * Alles hier ist rein: keine Datenbank, kein Server-Import.
 */

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

export type VehicleListCard = {
  /** Stabile Kennung innerhalb der Datei, z. B. "1-3" (Seite 1, Karte 3). */
  key: string;
  page: number;
  index: number;
  make: string;
  model: string;
  /** Bezeichnung unter dem Titel. Die Liste kürzt lange Texte mit "…". */
  variant: string | null;
  variantTruncated: boolean;
  priceCents: number | null;
  /** Erstzulassung auf den Monat genau, in UTC. */
  firstRegistration: Date | null;
  year: number | null;
  mileageKm: number | null;
  powerKw: number | null;
  displacementCcm: number | null;
  color: string | null;
  drivetrain: DrivetrainType | null;
  /** Diese Liste führt weder FIN noch GW-Nr. Bleibt für spätere Formate. */
  vin: string | null;
  stockNumber: string | null;
  /** Das Foto der Karte, sofern eines gezeichnet wurde. */
  image: { objectNumber: number; widthPx: number; heightPx: number } | null;
  warnings: string[];
};

export type VehicleListPdf = {
  cards: VehicleListCard[];
  pages: number;
  /** Datum aus der Überschrift, falls lesbar (nur zur Anzeige). */
  listedAt: string | null;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Matrizen und CMaps
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function transform(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * ToUnicode-CMap lesen: Glyph-ID -> Zeichen.
 *
 * Zwei Formen kommen vor: `bfchar` (ein Code, ein Zeichen) und `bfrange`
 * (ein Bereich, fortlaufend). Mehr braucht diese Datei nicht; unbekannte
 * Codes werden zu U+FFFD, damit ein Lesefehler sichtbar bleibt statt still
 * zu verschwinden.
 */
export function parseToUnicodeCMap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();

  const decode = (hex: string): string =>
    String.fromCodePoint(
      ...(hex.match(/.{1,4}/g) ?? []).map((unit) => parseInt(unit, 16)),
    );

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(entry[1], 16), decode(entry[2]));
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      const low = parseInt(entry[1], 16);
      const high = parseInt(entry[2], 16);
      const start = parseInt(entry[3], 16);
      // Schutz gegen eine kaputte Angabe, die Millionen Einträge erzeugen würde.
      if (high - low > 0xffff) continue;
      for (let code = low; code <= high; code += 1) {
        map.set(code, String.fromCodePoint(start + (code - low)));
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Seiteninhalt lesen
// ---------------------------------------------------------------------------

type PlacedRun = { x: number; y: number; text: string; bold: boolean };
type PlacedImage = {
  objectNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern =
    /<[0-9a-fA-F\s]*>|\[[^\]]*\]|\/[^\s/[\]<>(]+|[-+.\d][\d.eE+-]*|[A-Za-z*'"]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) tokens.push(match[0]);
  return tokens;
}

function dictRefs(dict: string, key: string): Map<string, number> {
  const refs = new Map<string, number>();
  const block = new RegExp(`/${key}\\s*<<([^>]*)>>`).exec(dict)?.[1] ?? "";
  for (const entry of block.matchAll(/\/([^\s/]+)\s+(\d+)\s+0\s+R/g)) {
    refs.set(entry[1], Number(entry[2]));
  }
  return refs;
}

function fontMaps(
  pageDict: string,
  objects: Map<number, PdfObject>,
): Map<string, { map: Map<number, string>; bold: boolean }> {
  const fonts = new Map<string, { map: Map<number, string>; bold: boolean }>();

  for (const [name, number] of dictRefs(pageDict, "Font")) {
    const font = objects.get(number);
    if (!font) continue;
    const dict = font.dict.toString("latin1");
    const toUnicode = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(dict)?.[1];
    const stream = toUnicode ? objects.get(Number(toUnicode))?.stream : null;
    fonts.set(name, {
      map: stream ? parseToUnicodeCMap(stream.toString("latin1")) : new Map(),
      bold: /Bold/i.test(dict),
    });
  }

  return fonts;
}

/**
 * Läuft einmal durch den Inhaltsstrom einer Seite und sammelt jeden Textlauf
 * und jedes gezeichnete Bild mit seiner Position in Seitenkoordinaten.
 */
function walkPage(
  page: PdfObject,
  objects: Map<number, PdfObject>,
): { runs: PlacedRun[]; images: PlacedImage[] } {
  const dict = page.dict.toString("latin1");
  const runs: PlacedRun[] = [];
  const images: PlacedImage[] = [];

  const contentRefs = [
    ...(/\/Contents\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? "").matchAll(/(\d+)\s+0\s+R/g),
  ].map((m) => Number(m[1]));
  const single = /\/Contents\s+(\d+)\s+0\s+R/.exec(dict)?.[1];
  if (single) contentRefs.push(Number(single));

  const source = contentRefs
    .map((ref) => objects.get(ref)?.stream?.toString("latin1") ?? "")
    .join("\n");
  if (!source) return { runs, images };

  const fonts = fontMaps(dict, objects);
  const xObjects = dictRefs(dict, "XObject");

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let textMatrix: Matrix = IDENTITY;
  let font: { map: Map<number, string>; bold: boolean } | null = null;
  const operands: string[] = [];

  const numbers = () => operands.map(Number);

  for (const token of tokenize(source)) {
    if (/^[-+.\d<\/[]/.test(token)) {
      operands.push(token);
      continue;
    }

    switch (token) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? ctm;
        break;
      case "cm":
        ctm = multiply(numbers().slice(-6) as Matrix, ctm);
        break;
      case "BT":
        textMatrix = IDENTITY;
        break;
      case "Tf":
        font = fonts.get(operands[operands.length - 2]?.slice(1) ?? "") ?? null;
        break;
      case "Tm":
        textMatrix = numbers().slice(-6) as Matrix;
        break;
      case "Td":
      case "TD": {
        const [tx, ty] = numbers().slice(-2);
        textMatrix = multiply([1, 0, 0, 1, tx, ty], textMatrix);
        break;
      }
      case "Tj":
      case "TJ": {
        const argument = operands[operands.length - 1] ?? "";
        const hex = [...argument.matchAll(/<([0-9a-fA-F\s]*)>/g)]
          .map((m) => m[1].replace(/\s/g, ""))
          .join("");
        const text = (hex.match(/.{4}/g) ?? [])
          .map((glyph) => font?.map.get(parseInt(glyph, 16)) ?? "�")
          .join("");
        if (text.trim()) {
          const origin = transform(multiply(textMatrix, ctm), 0, 0);
          runs.push({ x: origin.x, y: origin.y, text, bold: font?.bold ?? false });
        }
        break;
      }
      case "Do": {
        const name = operands[operands.length - 1]?.slice(1) ?? "";
        const objectNumber = xObjects.get(name);
        if (objectNumber !== undefined) {
          const a = transform(ctm, 0, 0);
          const b = transform(ctm, 1, 1);
          images.push({
            objectNumber,
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
          });
        }
        break;
      }
      default:
        break;
    }

    operands.length = 0;
  }

  return { runs, images };
}

// ---------------------------------------------------------------------------
// Karten bilden
// ---------------------------------------------------------------------------

/** Etiketten der Karte, wie sie in der Liste stehen. */
const LABELS = ["Baujahr", "KM", "Leistung", "Hubraum", "Farbe", "Antrieb"] as const;
type Label = (typeof LABELS)[number];

const DRIVETRAIN_BY_WORD: Record<string, DrivetrainType> = {
  vorderrad: "FRONT_WHEEL",
  hinterrad: "REAR_WHEEL",
  allrad: "ALL_WHEEL",
};

/** "---" ist der Platzhalter der Liste für "keine Angabe". */
function value(raw: string | undefined): string | null {
  const text = raw?.replace(/ /g, " ").trim() ?? "";
  if (text === "" || /^-+$/.test(text)) return null;
  return text;
}

function parseMonthYear(raw: string | null): Date | null {
  const match = raw?.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12 || year < 1900 || year > 2100) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function parseKw(raw: string | null): number | null {
  const match = raw?.match(/(\d[\d.]*)\s*kW/i);
  return match ? parseGermanInteger(match[1]) : null;
}

/** Vertikaler Abstand, innerhalb dessen ein Text noch zur Karte gehört. */
const CARD_HALF_HEIGHT_PT = 62;

/**
 * Text darf so weit links vom Foto seiner Karte beginnen. Der Titel steht
 * am Kartenrand, das Foto ein Stück eingerückt – gemessen rund 12 Punkt.
 */
const TITLE_LEFT_OF_PHOTO_PT = 40;

/**
 * Ordnet Textläufe und Bilder zu Karten.
 *
 * Erst die Spalten: Die Fotos bilden klar getrennte x-Gruppen. Ein Text
 * gehört zur am weitesten rechts liegenden Gruppe, deren Fotos noch links
 * von ihm beginnen (mit etwas Spielraum für den Titel). Die Mitte zwischen
 * den Fotos wäre falsch: Die Angaben einer linken Karte reichen bis kurz vor
 * die rechte Karte, weit über die Mitte hinaus.
 *
 * Dann je Text das Foto derselben Spalte, das ihm vertikal am nächsten
 * liegt – sofern es innerhalb der Kartenhöhe liegt. Was zu keiner Karte
 * passt (etwa die Seitenüberschrift), bleibt draußen.
 */
function buildCards(
  page: number,
  runs: PlacedRun[],
  images: PlacedImage[],
  imagesByObject: Map<number, PdfImage>,
): VehicleListCard[] {
  const anchors = images
    .filter((image) => imagesByObject.has(image.objectNumber))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  if (anchors.length === 0) return [];

  // Spalten: aufsteigend nach x, neue Spalte bei einer Lücke über 60 Punkt.
  const columns: { minX: number; maxX: number }[] = [];
  for (const x of anchors.map((a) => a.x).sort((a, b) => a - b)) {
    const last = columns[columns.length - 1];
    if (last && x - last.maxX <= 60) last.maxX = x;
    else columns.push({ minX: x, maxX: x });
  }
  // Links von jeder Fotospalte gibt es keine Karte – solcher Text gehört zu
  // keiner. Sonst würde eine Karte ohne Foto ihre Angaben der Nachbarkarte
  // zuschlagen.
  const columnOf = (x: number): number | null => {
    let column: number | null = null;
    columns.forEach((c, index) => {
      if (c.minX - TITLE_LEFT_OF_PHOTO_PT <= x) column = index;
    });
    return column;
  };

  const buckets = anchors.map((anchor) => ({
    anchor,
    // Ein Foto liegt immer in seiner eigenen Spalte – nie links davon.
    column: columnOf(anchor.x) ?? 0,
    centerY: anchor.y + anchor.height / 2,
    runs: [] as PlacedRun[],
  }));

  for (const run of runs) {
    const column = columnOf(run.x);
    if (column === null) continue;
    let best: (typeof buckets)[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const bucket of buckets) {
      if (bucket.column !== column) continue;
      const distance = Math.abs(run.y - bucket.centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = bucket;
      }
    }
    if (best && bestDistance <= CARD_HALF_HEIGHT_PT) best.runs.push(run);
  }

  // Lesereihenfolge: Zeile für Zeile, links nach rechts, linke Spalte zuerst.
  buckets.sort((a, b) => {
    if (Math.abs(a.centerY - b.centerY) > 20) return b.centerY - a.centerY;
    return a.column - b.column;
  });

  return buckets.map((bucket, index) => cardFromRuns(page, index + 1, bucket, imagesByObject));
}

function cardFromRuns(
  page: number,
  index: number,
  bucket: { anchor: PlacedImage; runs: PlacedRun[] },
  imagesByObject: Map<number, PdfImage>,
): VehicleListCard {
  const warnings: string[] = [];
  const runs = [...bucket.runs].sort((a, b) => b.y - a.y || a.x - b.x);

  // Zeilen bilden: Läufe mit fast gleichem y gehören zusammen.
  const lines: PlacedRun[][] = [];
  for (const run of runs) {
    const line = lines.find((l) => Math.abs(l[0].y - run.y) < 2.5);
    if (line) line.push(run);
    else lines.push([run]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);

  // Titel: die oberste Zeile mit " | " zwischen Marke und Modell.
  const titleLine = lines.find((line) =>
    line.some((run) => run.text.includes("|")),
  );
  const title = (titleLine ?? [])
    .filter((run) => !run.bold)
    .map((run) => run.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const [makeRaw, ...modelParts] = title.split("|");
  const make = (makeRaw ?? "").trim();
  const model = modelParts.join("|").trim();
  if (!make || !model) warnings.push("Marke oder Modell nicht lesbar.");

  // Preis: fetter Lauf mit Euro-Zeichen, üblicherweise in der Titelzeile.
  const priceRun = runs.find((run) => run.bold && /€/.test(run.text));
  const priceCents = priceRun ? parseEuroToCents(priceRun.text) : null;

  // Bezeichnung: die Zeile direkt unter dem Titel, ohne Etiketten.
  const titleIndex = titleLine ? lines.indexOf(titleLine) : -1;
  const variantLine = lines[titleIndex + 1];
  const variantText =
    variantLine && !variantLine.some((run) => run.bold)
      ? variantLine.map((run) => run.text).join("").trim()
      : "";
  const variantTruncated = /…$|\.\.\.$/.test(variantText);
  const variant = variantText.replace(/[…]+$|\.\.\.$/, "").trim() || null;

  // Etikett -> Wert: der nächste nicht-fette Lauf rechts daneben in der Zeile.
  const fields: Partial<Record<Label, string | null>> = {};
  for (const line of lines) {
    for (let i = 0; i < line.length; i += 1) {
      const run = line[i];
      const label = LABELS.find((l) => run.bold && run.text.trim() === l);
      if (!label) continue;
      const next = line.slice(i + 1).find((r) => !r.bold);
      fields[label] = value(next?.text);
    }
  }

  const firstRegistration = parseMonthYear(fields.Baujahr ?? null);
  if (fields.Baujahr && !firstRegistration) {
    warnings.push(`Baujahr „${fields.Baujahr}“ nicht lesbar.`);
  }

  const drivetrainWord = fields.Antrieb?.toLowerCase() ?? "";
  const drivetrain = DRIVETRAIN_BY_WORD[drivetrainWord] ?? null;
  if (fields.Antrieb && !drivetrain) {
    warnings.push(`Antrieb „${fields.Antrieb}“ unbekannt.`);
  }

  const image = imagesByObject.get(bucket.anchor.objectNumber) ?? null;

  return {
    key: `${page}-${index}`,
    page,
    index,
    make,
    model,
    variant,
    variantTruncated,
    priceCents,
    firstRegistration,
    year: firstRegistration?.getUTCFullYear() ?? null,
    mileageKm: fields.KM ? parseGermanInteger(fields.KM) : null,
    powerKw: parseKw(fields.Leistung ?? null),
    displacementCcm: fields.Hubraum ? parseGermanInteger(fields.Hubraum) : null,
    color: fields.Farbe ?? null,
    drivetrain,
    vin: null,
    stockNumber: null,
    image: image
      ? { objectNumber: image.objectNumber, widthPx: image.widthPx, heightPx: image.heightPx }
      : null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

function pageObjects(objects: Map<number, PdfObject>): PdfObject[] {
  return [...objects.values()].filter((object) =>
    /\/Type\s*\/Page\b/.test(object.dict.toString("latin1")),
  );
}

/**
 * Fotos, die als Fahrzeugbild taugen: ohne Transparenzmaske (Logos) und
 * groß genug, um ein Foto zu sein. Kleine Dekografiken fallen weg.
 */
const MIN_PHOTO_PX = 120;

function vehiclePhotos(objects: Map<number, PdfObject>): Map<number, PdfImage> {
  const photos = new Map<number, PdfImage>();
  for (const image of extractImages(objects)) {
    if (image.hasAlpha) continue;
    if (image.widthPx < MIN_PHOTO_PX || image.heightPx < MIN_PHOTO_PX) continue;
    photos.set(image.objectNumber, image);
  }
  return photos;
}

/** Erkennt die Liste an ihrer Überschrift und dem Kartenaufbau. */
export function isVehicleListPdf(objects: Map<number, PdfObject>): boolean {
  const pages = pageObjects(objects);
  if (pages.length === 0) return false;
  const { runs } = walkPage(pages[0], objects);
  const text = runs.map((run) => run.text).join(" ");
  return /Unser Fahrzeugbestand/i.test(text) && /Baujahr/.test(text) && /Antrieb/.test(text);
}

export function parseVehicleListPdf(bytes: Buffer): VehicleListPdf {
  const objects = parsePdfObjects(bytes);
  return parseVehicleListObjects(objects);
}

export function parseVehicleListObjects(objects: Map<number, PdfObject>): VehicleListPdf {
  const warnings: string[] = [];
  const pages = pageObjects(objects);
  const photos = vehiclePhotos(objects);
  const cards: VehicleListCard[] = [];
  let listedAt: string | null = null;

  if (pageWidthPt(objects) === null) {
    warnings.push("Seitengröße nicht lesbar – Positionen können abweichen.");
  }

  pages.forEach((page, pageIndex) => {
    const { runs, images } = walkPage(page, objects);

    if (listedAt === null) {
      const heading = runs.find((run) => /Fahrzeugbestand vom/i.test(run.text));
      listedAt = heading?.text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;
    }

    cards.push(...buildCards(pageIndex + 1, runs, images, photos));
  });

  if (cards.length === 0) {
    warnings.push("Keine Fahrzeugkarten erkannt.");
  }

  return { cards, pages: pages.length, listedAt, warnings };
}
