import { deflateSync, inflateSync } from "node:zlib";

/**
 * Einlesen eines Preisblatt-PDFs (willhaben-Vorlage für den Autohandel).
 *
 * WOHER DIE DATEN KOMMEN: ausschließlich aus der Datei, die der Admin selbst
 * hochlädt. Es wird nichts nachgeladen – keine im PDF genannte URL, kein
 * Widget, keine Schnittstelle. Enthaltene Aktionen (/OpenAction, /JavaScript)
 * werden nicht ausgeführt, sondern nur erkannt und gemeldet.
 *
 * WARUM OHNE BIBLIOTHEK: Die Vorlage trägt ihre Daten in AcroForm-Feldern.
 * Deren Namen ("Marke", "Bezeichnung", "Highlights_1" …) sind stabil, und sie
 * auszulesen braucht weder Textlayout noch Schriftbehandlung – nur den
 * PDF-Objektbaum. Für Bilder genügen `zlib` (in Node eingebaut) und ein
 * kleiner PNG-Kodierer. Eine PDF-Bibliothek würde hier nichts beitragen, was
 * dieses Modul nicht ohnehin tun muss, und stünde als zusätzliche
 * Angriffsfläche im Serverpfad.
 *
 * Dieses Modul ist rein: keine Datenbank, kein Framework, kein Netzwerk.
 */

// ---------------------------------------------------------------------------
// Zeichenketten
// ---------------------------------------------------------------------------

/**
 * PDFDocEncoding weicht zwischen 0x80 und 0xA0 von Latin-1 ab. Für uns zählt
 * vor allem 0xA0: Dort steht das Eurozeichen, und genau damit beginnt das
 * Preisfeld der Vorlage ("€ 16.490,-"). Ohne diese Abbildung stünde dort ein
 * geschütztes Leerzeichen.
 */
const PDF_DOC_ENCODING: Record<number, string> = {
  0x80: "•", 0x81: "†", 0x82: "‡", 0x83: "…",
  0x84: "—", 0x85: "–", 0x86: "ƒ", 0x87: "⁄",
  0x88: "‹", 0x89: "›", 0x8a: "−", 0x8b: "‰",
  0x8c: "„", 0x8d: "“", 0x8e: "”", 0x8f: "‘",
  0x90: "’", 0x91: "‚", 0x92: "™", 0x93: "ﬁ",
  0x94: "ﬂ", 0x95: "Ł", 0x96: "Œ", 0x97: "Š",
  0x98: "Ÿ", 0x99: "Ž", 0x9a: "ı", 0x9b: "ł",
  0x9c: "œ", 0x9d: "š", 0x9e: "ž", 0xa0: "€",
};

function decodePdfString(bytes: Buffer): string {
  // UTF-16BE, wenn die Byte Order Mark davorsteht.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).toString("utf16le").length === 0
      ? ""
      : Buffer.from(bytes.subarray(2)).swap16().toString("utf16le");
  }

  let out = "";
  for (const byte of bytes) {
    out += PDF_DOC_ENCODING[byte] ?? String.fromCharCode(byte);
  }
  return out;
}

/** Literale Zeichenkette `(...)` ab `start` (zeigt auf die öffnende Klammer). */
function readLiteralString(buffer: Buffer, start: number): { value: string; end: number } | null {
  if (buffer[start] !== 0x28) return null;

  const bytes: number[] = [];
  let depth = 1;
  let i = start + 1;

  while (i < buffer.length) {
    const byte = buffer[i];

    if (byte === 0x5c) {
      // Escape-Sequenz
      const next = buffer[i + 1];
      const simple: Record<number, number> = {
        0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c,
        0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c,
      };

      if (next in simple) {
        bytes.push(simple[next]);
        i += 2;
        continue;
      }

      if (next >= 0x30 && next <= 0x37) {
        // Oktal, bis zu drei Ziffern
        let octal = "";
        let j = i + 1;
        while (j < buffer.length && octal.length < 3 && buffer[j] >= 0x30 && buffer[j] <= 0x37) {
          octal += String.fromCharCode(buffer[j]);
          j += 1;
        }
        bytes.push(parseInt(octal, 8) & 0xff);
        i = j;
        continue;
      }

      if (next === 0x0a) {
        // Zeilenfortsetzung
        i += 2;
        continue;
      }

      i += 1;
      continue;
    }

    if (byte === 0x28) depth += 1;
    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) return { value: decodePdfString(Buffer.from(bytes)), end: i + 1 };
    }

    bytes.push(byte);
    i += 1;
  }

  return null;
}

/** Hexadezimale Zeichenkette `<...>` ab `start`. */
function readHexString(buffer: Buffer, start: number): { value: string; end: number } | null {
  if (buffer[start] !== 0x3c || buffer[start + 1] === 0x3c) return null;

  const end = buffer.indexOf(0x3e, start + 1);
  if (end === -1) return null;

  const hex = buffer
    .subarray(start + 1, end)
    .toString("latin1")
    .replace(/[^0-9a-fA-F]/g, "");

  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;

  return { value: decodePdfString(Buffer.from(padded, "hex")), end: end + 1 };
}

/** Zeichenkette an `start`, gleich welcher Schreibweise. */
function readString(buffer: Buffer, start: number): { value: string; end: number } | null {
  return readLiteralString(buffer, start) ?? readHexString(buffer, start);
}

/**
 * Endet ein PDF-Name an dieser Stelle?
 *
 * Ohne diese Prüfung fände die Suche nach `/T` auch `/Type` – und damit im
 * Feldwörterbuch zuerst "/Type /Annot" statt des Feldnamens. Namen enden an
 * Whitespace oder einem der Trennzeichen.
 */
function isNameBoundary(byte: number | undefined): boolean {
  if (byte === undefined) return true;
  if (byte <= 0x20) return true;
  return "()<>[]{}/%".includes(String.fromCharCode(byte));
}

/** Wert eines Schlüssels als Zeichenkette, z. B. `/T (Marke)`. */
function stringValue(dict: Buffer, key: string): string | null {
  const needle = `/${key}`;
  let at = dict.indexOf(needle);

  while (at !== -1) {
    let i = at + needle.length;

    if (isNameBoundary(dict[i])) {
      while (i < dict.length && dict[i] <= 0x20) i += 1;

      const read = readString(dict, i);
      if (read) return read.value;
    }

    at = dict.indexOf(needle, at + 1);
  }

  return null;
}

export function numberValue(dict: Buffer, key: string): number | null {
  const match = new RegExp(`/${key}\\s+(-?[\\d.]+)`).exec(dict.toString("latin1"));
  return match ? Number(match[1]) : null;
}

export function nameValue(dict: Buffer, key: string): string | null {
  const match = new RegExp(`/${key}\\s*/(\\w+)`).exec(dict.toString("latin1"));
  return match ? match[1] : null;
}

/**
 * Alle Zeichenketten eines Streams, in Vorkommensreihenfolge.
 *
 * Für Textoperatoren: `(Text) Tj` und `[(a) -5 (b)] TJ` legen ihren Inhalt als
 * gewöhnliche PDF-Zeichenkette ab. Ausgewertet wird deshalb nichts weiter als
 * die Zeichenketten selbst – Schriftgrößen, Zeilenvorschübe und Laufweiten
 * beeinflussen die Darstellung, nicht den Inhalt.
 */
export function extractTextStrings(stream: Buffer): string[] {
  const strings: string[] = [];
  let i = 0;

  while (i < stream.length) {
    const byte = stream[i];

    if (byte === 0x28 || (byte === 0x3c && stream[i + 1] !== 0x3c)) {
      const read = readString(stream, i);
      if (read) {
        strings.push(read.value);
        i = read.end;
        continue;
      }
    }

    i += 1;
  }

  return strings;
}

// ---------------------------------------------------------------------------
// Objekte
// ---------------------------------------------------------------------------

export type PdfObject = {
  number: number;
  /** Wörterbuch bzw. alles vor `stream`. */
  dict: Buffer;
  /** Entpackter Streaminhalt, falls vorhanden. */
  stream: Buffer | null;
  /** Rohdaten des Streams, ungefiltert. */
  rawStream: Buffer | null;
  filter: string | null;
};

/** Kennzeichen einer PDF-Datei. */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export function isEncrypted(bytes: Buffer): boolean {
  return bytes.includes("/Encrypt");
}

function inflate(raw: Buffer): Buffer | null {
  try {
    return inflateSync(raw);
  } catch {
    // Manche Erzeuger hängen ein zusätzliches Zeilenende an.
    try {
      return inflateSync(raw.subarray(0, raw.length - 1));
    } catch {
      return null;
    }
  }
}

/**
 * Alle indirekten Objekte einsammeln.
 *
 * Bewusst über die Byte-Suche nach "N G obj" statt über die Querverweistabelle:
 * Das kommt auch mit nachträglich veränderten Dateien und kaputten Tabellen
 * zurecht, und für unseren Zweck – Formularfelder und Bilder finden – genügt
 * es vollständig. Objektströme (/ObjStm) werden zusätzlich ausgepackt.
 */
export function parsePdfObjects(bytes: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const text = bytes.toString("latin1");
  const objectPattern = /(\d+)\s+(\d+)\s+obj\b/g;

  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(text)) !== null) {
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const bodyEnd = text.indexOf("endobj", bodyStart);
    const body = bytes.subarray(bodyStart, bodyEnd === -1 ? bytes.length : bodyEnd);

    const streamAt = body.indexOf("stream");
    let dict = body;
    let rawStream: Buffer | null = null;

    if (streamAt !== -1) {
      dict = body.subarray(0, streamAt);
      let dataStart = streamAt + "stream".length;
      if (body[dataStart] === 0x0d) dataStart += 1;
      if (body[dataStart] === 0x0a) dataStart += 1;

      const dataEnd = body.lastIndexOf("endstream");
      rawStream = body.subarray(dataStart, dataEnd === -1 ? body.length : dataEnd);
    }

    const filter = nameValue(dict, "Filter");
    const stream =
      rawStream && filter === "FlateDecode" ? inflate(rawStream) : rawStream;

    objects.set(number, { number, dict, stream, rawStream, filter });
  }

  // Objektströme enthalten weitere Objekte in gepackter Form.
  for (const object of [...objects.values()]) {
    if (nameValue(object.dict, "Type") !== "ObjStm" || !object.stream) continue;

    const count = numberValue(object.dict, "N") ?? 0;
    const first = numberValue(object.dict, "First") ?? 0;
    const header = object.stream.subarray(0, first).toString("latin1").trim().split(/\s+/);

    for (let i = 0; i < count; i += 1) {
      const number = Number(header[i * 2]);
      const offset = Number(header[i * 2 + 1]);
      if (!Number.isFinite(number) || !Number.isFinite(offset)) continue;

      const nextOffset =
        i + 1 < count ? Number(header[(i + 1) * 2 + 1]) : object.stream.length - first;
      const slice = object.stream.subarray(first + offset, first + nextOffset);

      if (!objects.has(number)) {
        objects.set(number, {
          number,
          dict: slice,
          stream: null,
          rawStream: null,
          filter: null,
        });
      }
    }
  }

  return objects;
}

// ---------------------------------------------------------------------------
// Formularfelder
// ---------------------------------------------------------------------------

export type PriceSheetFields = Record<string, string>;

/**
 * Alle ausgefüllten Formularfelder als Name -> Wert.
 *
 * Leere Werte werden weggelassen: Ein leeres Feld ist keine Information und
 * darf später keinen gepflegten Wert überschreiben.
 */
export function extractFormFields(objects: Map<number, PdfObject>): PriceSheetFields {
  const fields: PriceSheetFields = {};

  for (const object of objects.values()) {
    if (!object.dict.includes("/FT") && !object.dict.includes("/Widget")) continue;

    const name = stringValue(object.dict, "T");
    if (!name) continue;

    const value = stringValue(object.dict, "V");
    if (value === null) continue;

    const trimmed = value.trim();
    if (trimmed === "") continue;

    fields[name] = trimmed;
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

export type PdfImage = {
  objectNumber: number;
  widthPx: number;
  heightPx: number;
  /** Breite/Höhe in Punkt, mit der das Bild auf der Seite gezeichnet wird. */
  drawnWidthPt: number | null;
  drawnHeightPt: number | null;
  /** Anteil der Seitenbreite, den das gezeichnete Bild einnimmt. */
  pageWidthRatio: number | null;
  /** true, wenn eine Transparenzmaske hängt – typisch für Logos. */
  hasAlpha: boolean;
  contentType: "image/jpeg" | "image/png";
  data: Buffer;
};

/** CRC32 für die PNG-Blöcke. */
function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Rohe Bildpunkte als PNG verpacken.
 *
 * Nötig, weil PDF Rasterbilder häufig als reine Abtastwerte mit
 * Flate-Kompression ablegt – ohne Container. Der Browser kann damit nichts
 * anfangen, ein PNG dagegen überall. Bewusst kein Neucodieren des Bildinhalts:
 * Die Bildpunkte werden unverändert übernommen.
 */
export function encodePng(
  samples: Buffer,
  width: number,
  height: number,
  channels: 1 | 3,
  options: { alreadyFiltered?: boolean } = {},
): Buffer {
  const stride = width * channels;

  /*
   * Zwei Fälle, und sie zu verwechseln ergibt Bildrauschen:
   *
   *   Ohne Prädiktor sind die Daten reine Abtastwerte. PNG verlangt vor jeder
   *   Zeile ein Filterbyte, das hier auf 0 ("keine Filterung") gesetzt wird.
   *
   *   Mit PNG-Prädiktor (/DecodeParms /Predictor >= 10) enthalten die Daten
   *   dieses Filterbyte bereits – sie liegen exakt im PNG-Zeilenformat vor.
   *   Ein zweites Byte davorzusetzen verschöbe jede Zeile um eins und
   *   interpretierte die Filterkennung als Bildpunkt.
   */
  const raw = options.alreadyFiltered
    ? samples.subarray(0, (stride + 1) * height)
    : (() => {
        const buffer = Buffer.alloc((stride + 1) * height);
        for (let y = 0; y < height; y += 1) {
          buffer[y * (stride + 1)] = 0;
          samples.copy(buffer, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
        }
        return buffer;
      })();

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bittiefe
  header[9] = channels === 1 ? 0 : 2; // Graustufen bzw. RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Wie groß wird welches XObject gezeichnet?
 *
 * Der entscheidende Unterschied zwischen Logo und Fahrzeugbild steckt nicht in
 * der Pixelzahl, sondern in der Fläche auf der Seite: Das Logo der Vorlage ist
 * 400x240 Pixel groß – für eine reine Pixelprüfung also unauffällig –, wird
 * aber nur 91 x 55 Punkt oben rechts gezeichnet, keine 16 % der Seitenbreite.
 * Ein Fahrzeugbild nimmt dagegen einen großen Teil der Seite ein.
 */
function drawnSizes(objects: Map<number, PdfObject>): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();

  for (const object of objects.values()) {
    if (!object.stream) continue;
    const content = object.stream.toString("latin1");
    if (!content.includes(" Do")) continue;

    const pattern =
      /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm[\s\S]{0,300}?\/(\w+)\s+Do/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const width = Math.abs(Number(match[1]));
      const height = Math.abs(Number(match[4]));
      const name = match[7];
      const previous = sizes.get(name);

      // Größte Zeichnung gewinnt: Dasselbe Bild kann mehrfach vorkommen.
      if (!previous || width * height > previous.width * previous.height) {
        sizes.set(name, { width, height });
      }
    }
  }

  return sizes;
}

/** Seitenbreite in Punkt aus der MediaBox. */
export function pageWidthPt(objects: Map<number, PdfObject>): number | null {
  for (const object of objects.values()) {
    const match = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(
      object.dict.toString("latin1"),
    );
    if (match) return Math.abs(Number(match[3]) - Number(match[1]));
  }
  return null;
}

/** Zuordnung Ressourcenname -> Objektnummer, z. B. /Im1 -> 102. */
function xObjectNames(objects: Map<number, PdfObject>): Map<number, string> {
  const names = new Map<number, string>();

  for (const object of objects.values()) {
    const text = object.dict.toString("latin1");
    const block = /\/XObject\s*<<([\s\S]*?)>>/.exec(text);
    if (!block) continue;

    const pattern = /\/(\w+)\s+(\d+)\s+\d+\s+R/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(block[1])) !== null) {
      names.set(Number(match[2]), match[1]);
    }
  }

  return names;
}

/**
 * Alle eingebetteten Rasterbilder mit ihrer Zeichengröße.
 *
 * Sanftmasken (/SMask) werden nicht als eigene Bilder ausgegeben – sie sind
 * der Alphakanal eines anderen Bildes und ergäben sonst ein zweites,
 * sinnloses Graustufenbild in der Auswahl.
 */
export function extractImages(objects: Map<number, PdfObject>): PdfImage[] {
  const sizes = drawnSizes(objects);
  const names = xObjectNames(objects);
  const pageWidth = pageWidthPt(objects);

  const maskNumbers = new Set<number>();
  for (const object of objects.values()) {
    const match = /\/SMask\s+(\d+)\s+\d+\s+R/.exec(object.dict.toString("latin1"));
    if (match) maskNumbers.add(Number(match[1]));
  }

  const images: PdfImage[] = [];

  for (const object of objects.values()) {
    const text = object.dict.toString("latin1");
    if (!/\/Subtype\s*\/Image/.test(text)) continue;
    if (maskNumbers.has(object.number)) continue;

    const widthPx = numberValue(object.dict, "Width");
    const heightPx = numberValue(object.dict, "Height");
    if (!widthPx || !heightPx) continue;

    const colorSpace = nameValue(object.dict, "ColorSpace");
    const bits = numberValue(object.dict, "BitsPerComponent") ?? 8;

    let data: Buffer | null = null;
    let contentType: PdfImage["contentType"] = "image/png";

    if (object.filter === "DCTDecode" && object.rawStream) {
      // Der Stream IST bereits eine JPEG-Datei – unverändert übernehmen.
      data = Buffer.from(object.rawStream);
      contentType = "image/jpeg";
    } else if (object.filter === "FlateDecode" && object.stream && bits === 8) {
      const channels = colorSpace === "DeviceRGB" ? 3 : colorSpace === "DeviceGray" ? 1 : null;

      // Ein PNG-Prädiktor ab 10 heißt: Die Zeilen tragen ihr Filterbyte schon.
      const predictor = numberValue(object.dict, "Predictor") ?? 1;
      const alreadyFiltered = predictor >= 10;

      const needed = alreadyFiltered
        ? heightPx * (widthPx * (channels ?? 1) + 1)
        : widthPx * heightPx * (channels ?? 1);

      if (channels && object.stream.length >= needed) {
        data = encodePng(object.stream, widthPx, heightPx, channels, {
          alreadyFiltered,
        });
      }
    }

    // Alles andere (CMYK, indizierte Paletten, JPEG2000, CCITT) wird bewusst
    // übersprungen statt halbrichtig umgerechnet: Ein farbverfälschtes
    // Fahrzeugbild wäre schlimmer als gar keins.
    if (!data) continue;

    const name = names.get(object.number);
    const drawn = name ? sizes.get(name) : undefined;

    images.push({
      objectNumber: object.number,
      widthPx,
      heightPx,
      drawnWidthPt: drawn?.width ?? null,
      drawnHeightPt: drawn?.height ?? null,
      pageWidthRatio: drawn && pageWidth ? drawn.width / pageWidth : null,
      hasAlpha: /\/SMask\s+\d+\s+\d+\s+R/.test(text),
      contentType,
      data,
    });
  }

  return images;
}

// ---------------------------------------------------------------------------
// Bildauswahl
// ---------------------------------------------------------------------------

/**
 * Ab wann gilt ein Bild als Fahrzeugbild?
 *
 * An zwei echten willhaben-Blättern gemessen:
 *
 *   Preisblatt-Vorlage: Logo 400x240 px, Transparenzmaske, gezeichnet auf
 *   15,3 % der Seitenbreite. Kein Fahrzeugbild enthalten.
 *
 *   Verkaufsangebot: Fahrzeugbild 640x640 px, JPEG, ohne Transparenz,
 *   gezeichnet auf 24,7 %. Logo 400x240 px, Transparenzmaske, gezeichnet auf
 *   28,0 %.
 *
 * Daraus folgt das Wichtigste: Die gezeichnete Breite trennt Logo und Foto
 * NICHT – im Verkaufsangebot ist das Logo sogar das breitere von beiden. Sie
 * taugt nur als Schwelle gegen Symbole und Zierrat, und dafür muss sie unter
 * den gemessenen 24,7 % eines echten Fahrzeugbilds liegen.
 *
 * Die Trennung leisten stattdessen zwei Eigenschaften, die aus der Sache
 * folgen und nicht aus diesen zwei Dateien:
 *
 *   Transparenz. Eine Maske hat ein Bild, das sich in ein Layout einfügen
 *   soll – ein Logo. Ein Foto aus einer Kamera ist ein deckendes Rechteck.
 *
 *   Pixelzahl. Ein Foto bringt ein Vielfaches der Bildpunkte eines Logos mit
 *   (409.600 gegen 96.000 in den gemessenen Dateien).
 */
export const IMAGE_RULES = {
  /** Nur noch Schwelle gegen Symbole – siehe oben, gemessen wurden 24,7 %. */
  minPageWidthRatio: 0.2,
  minWidthPx: 400,
  minHeightPx: 300,
  minAspect: 0.5,
  maxAspect: 3,
} as const;

export type ImageCandidate = PdfImage & {
  /** Je höher, desto eher ein Fahrzeugbild. */
  score: number;
};

export function rankVehicleImages(images: PdfImage[]): {
  candidates: ImageCandidate[];
  rejected: { objectNumber: number; reason: string }[];
} {
  const candidates: ImageCandidate[] = [];
  const rejected: { objectNumber: number; reason: string }[] = [];

  for (const image of images) {
    const aspect = image.widthPx / image.heightPx;

    // Transparenz zuerst: Sie trägt die klarste Begründung und schließt beide
    // in echten Blättern vorgefundenen Logos aus – auch das große.
    if (image.hasAlpha) {
      rejected.push({
        objectNumber: image.objectNumber,
        reason:
          "hat eine Transparenzmaske – das ist ein Logo oder eine Grafik, " +
          "kein Fahrzeugfoto",
      });
      continue;
    }

    if (aspect < IMAGE_RULES.minAspect || aspect > IMAGE_RULES.maxAspect) {
      rejected.push({
        objectNumber: image.objectNumber,
        reason: `ungewöhnliches Seitenverhältnis (${aspect.toFixed(2)})`,
      });
      continue;
    }

    // Ohne bekannte Zeichengröße bleibt nur die Pixelprüfung. Das Bild wird
    // dann zwar angeboten, aber nachrangig – bestätigen muss es ohnehin der
    // Admin.
    if (image.pageWidthRatio !== null && image.pageWidthRatio < IMAGE_RULES.minPageWidthRatio) {
      rejected.push({
        objectNumber: image.objectNumber,
        reason:
          `wird nur auf ${Math.round(image.pageWidthRatio * 100)} % der Seitenbreite ` +
          `gezeichnet – das ist ein Logo oder Symbol, kein Fahrzeugbild`,
      });
      continue;
    }

    if (image.widthPx < IMAGE_RULES.minWidthPx || image.heightPx < IMAGE_RULES.minHeightPx) {
      rejected.push({
        objectNumber: image.objectNumber,
        reason: `zu klein (${image.widthPx}x${image.heightPx} Pixel)`,
      });
      continue;
    }

    const areaScore = image.widthPx * image.heightPx;
    const pageScore = (image.pageWidthRatio ?? 0.3) * 10_000_000;
    // JPEG ist das Format für Fotografien; Grafiken liegen als Flate vor.
    // Ein Hinweis, keine Bedingung – manche Systeme legen Fotos anders ab.
    const photoBonus = image.contentType === "image/jpeg" ? 1.5 : 1;

    candidates.push({ ...image, score: (areaScore + pageScore) * photoBonus });
  }

  candidates.sort((a, b) => b.score - a.score);

  return { candidates, rejected };
}
