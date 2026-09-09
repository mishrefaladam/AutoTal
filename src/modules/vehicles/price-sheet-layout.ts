import { extractTextStrings, type PdfObject } from "./price-sheet";

/**
 * Sichtbare Werte einer bekannten Vorlage über ihre Position zuordnen.
 *
 * WOZU: Das Verkaufsangebot von willhaben trägt seine Werte NICHT im
 * Feldwörterbuch. `Marke[0]`, `Kilometerstand[0]`, `Hubraum` und die anderen
 * haben `/T` und eine Fläche `/Rect`, aber kein `/V`. Der sichtbare Text
 * steckt in flachgerechneten Darstellungsobjekten, die der Seiteninhalt an
 * genau diese Stelle setzt.
 *
 * WAS DIES AUSDRÜCKLICH NICHT IST: eine Layout-Analyse für beliebige PDFs.
 * Es gibt keine Zeilenerkennung, keine Spaltenfindung, keine Suche nach dem
 * "nächstgelegenen Text". Zugeordnet wird nur, was an der Ecke eines
 * benannten Feldes steht – auf zwei Punkt genau. Passt nichts, bleibt das
 * Feld unerkannt.
 *
 * Rein: keine Datenbank, kein Framework, kein Netzwerk.
 */

/** Wie weit dürfen Feldecke und Textecke auseinanderliegen (in Punkt). */
const ORIGIN_TOLERANCE = 2;

type Rect = { x: number; y: number; width: number; height: number };

export type PlacedText = {
  /** Linke untere Ecke in Seitenkoordinaten. */
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};

// ---------------------------------------------------------------------------
// Wörterbuch-Hilfen
// ---------------------------------------------------------------------------

function rectOf(dict: string): Rect | null {
  const match =
    /\/Rect\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(dict);
  if (!match) return null;

  const [x1, y1, x2, y2] = match.slice(1, 5).map(Number);

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function fieldName(dict: string): string | null {
  const match = /\/T\s*\(((?:[^()\\]|\\.)*)\)/.exec(dict);
  return match ? match[1].replace(/\\([()\\])/g, "$1") : null;
}

// ---------------------------------------------------------------------------
// Felder und ihre Flächen
// ---------------------------------------------------------------------------

/**
 * Name -> Fläche, für jedes Feld mit Geometrie.
 *
 * AcroForm erlaubt, Name und Darstellung zu trennen: Ein Feld kann seinen
 * Namen tragen und die Geometrie an ein Kind auslagern. Genau so liegt
 * "Hubraum" in dieser Vorlage – das Feld hat den Namen, das namenlose Kind die
 * Fläche. Deshalb wird bei einem Widget ohne `/T` der Elternteil befragt.
 *
 * Kommt ein Name mehrfach vor, wird er verworfen statt geraten.
 */
export function collectFieldRects(
  objects: Map<number, PdfObject>,
): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  const ambiguous = new Set<string>();

  for (const object of objects.values()) {
    const dict = object.dict.toString("latin1");
    if (!/\/Subtype\s*\/Widget/.test(dict)) continue;

    const rect = rectOf(dict);
    if (!rect) continue;

    let name = fieldName(dict);

    // Namenloses Widget: Der Name steht am Elternfeld.
    if (!name) {
      const parent = /\/Parent\s+(\d+)\s+\d+\s+R/.exec(dict);
      if (parent) {
        const parentDict = objects.get(Number(parent[1]))?.dict.toString("latin1");
        if (parentDict) name = fieldName(parentDict);
      }
    }

    if (!name) continue;

    if (rects.has(name)) ambiguous.add(name);
    else rects.set(name, rect);
  }

  for (const name of ambiguous) rects.delete(name);

  return rects;
}

// ---------------------------------------------------------------------------
// Sichtbarer Text und seine Position
// ---------------------------------------------------------------------------

function resourceXObjects(
  objects: Map<number, PdfObject>,
  pageDict: string,
): Map<string, number> {
  const map = new Map<string, number>();

  // /Resources steht entweder direkt in der Seite oder als eigenes Objekt.
  let resources = pageDict;
  const indirect = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(pageDict);
  if (indirect) {
    resources = objects.get(Number(indirect[1]))?.dict.toString("latin1") ?? "";
  }

  const block = /\/XObject\s*<<([\s\S]*?)>>/.exec(resources);
  if (!block) return map;

  for (const match of block[1].matchAll(/\/(\w+)\s+(\d+)\s+\d+\s+R/g)) {
    map.set(match[1], Number(match[2]));
  }

  return map;
}

function contentStreams(
  objects: Map<number, PdfObject>,
  pageDict: string,
): Buffer[] {
  const array = /\/Contents\s*\[([^\]]*)\]/.exec(pageDict);
  const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(pageDict);

  const numbers = array
    ? [...array[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]))
    : single
      ? [Number(single[1])]
      : [];

  return numbers
    .map((number) => objects.get(number)?.stream)
    .filter((stream): stream is Buffer => Boolean(stream));
}

/**
 * Alle Textbausteine, die der Seiteninhalt über ein Darstellungsobjekt setzt.
 *
 * Der Erzeuger dieser Vorlage rechnet jedes ausgefüllte Feld in ein eigenes
 * Form-XObject um und platziert es mit `cm` an der Stelle des Feldes. Die
 * Position ergibt sich damit unmittelbar aus der Transformationsmatrix – es
 * braucht weder eine Textmatrix-Verfolgung noch eine Schriftauswertung.
 *
 * Textoperatoren innerhalb des Objekts (BT/ET, Tf, Td, Tj) tragen zum Inhalt
 * nur über ihre Zeichenketten bei; die werden vollständig eingesammelt.
 */
export function extractPlacedText(objects: Map<number, PdfObject>): PlacedText[] {
  const placed: PlacedText[] = [];

  for (const page of objects.values()) {
    const pageDict = page.dict.toString("latin1");
    if (!/\/Type\s*\/Page(?![a-zA-Z])/.test(pageDict)) continue;

    const xobjects = resourceXObjects(objects, pageDict);
    if (xobjects.size === 0) continue;

    const content = Buffer.concat(contentStreams(objects, pageDict)).toString("latin1");

    const pattern =
      /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm[\s\S]{0,200}?\/(\w+)\s+Do/g;

    for (const match of content.matchAll(pattern)) {
      const scaleX = Math.abs(Number(match[1]));
      const scaleY = Math.abs(Number(match[4]));
      const x = Number(match[5]);
      const y = Number(match[6]);

      const target = objects.get(xobjects.get(match[7]) ?? -1);
      if (!target?.stream) continue;

      const targetDict = target.dict.toString("latin1");
      // Bilder liefern keinen Text und werden hier übersprungen.
      if (!/\/Subtype\s*\/Form/.test(targetDict)) continue;

      const text = extractTextStrings(target.stream).join(" ").trim();
      if (text === "") continue;

      const bbox =
        /\/BBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(targetDict);

      const width = bbox ? Math.abs(Number(bbox[3]) - Number(bbox[1])) * scaleX : 0;
      const height = bbox ? Math.abs(Number(bbox[4]) - Number(bbox[2])) * scaleY : 0;

      placed.push({ x, y, width, height, text });
    }
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Vorlagenerkennung
// ---------------------------------------------------------------------------

/**
 * Feldnamen, die es nur im Verkaufsangebot gibt.
 *
 * Bewusst mehrere und bewusst solche mit dem eckigen Namenszusatz: Die
 * Preisblatt-Vorlage nennt ihre Felder "Marke", "Kilometer", "Erstzulassung" –
 * ohne Zusatz. Eine einzelne Übereinstimmung genügt nicht.
 */
const SALES_OFFER_MARKERS = [
  "Marke[0]",
  "Modell[0]",
  "Kilometerstand[0]",
  "DatumErstzulassung[0]",
  "Farbe[0]",
];

/** Wie viele Merkmale mindestens zusammenkommen müssen. */
const REQUIRED_MARKERS = 3;

export function isSalesOfferTemplate(fieldNames: Iterable<string>): boolean {
  const names = new Set(fieldNames);
  const hits = SALES_OFFER_MARKERS.filter((marker) => names.has(marker)).length;

  // Zusätzlich die erwartete Struktur: die Beschriftungsspalte der Datentabelle.
  const hasLabelColumn = ["FD1", "FD2", "FD3"].every((label) => names.has(label));

  return hits >= REQUIRED_MARKERS && hasLabelColumn;
}

// ---------------------------------------------------------------------------
// Zuordnung
// ---------------------------------------------------------------------------

/**
 * Feldnamen des Verkaufsangebots auf die Namen der Preisblatt-Vorlage
 * abbilden.
 *
 * Damit fließen beide Vorlagen in dieselbe Auswertung – die Zuordnung von
 * Feld zu Fahrzeugangabe steht weiterhin an genau einer Stelle.
 */
const FIELD_ALIASES: Record<string, string> = {
  "Marke[0]": "Marke",
  "Modell[0]": "Bezeichnung",
  "DatumErstzulassung[0]": "Erstzulassung",
  "Kilometerstand[0]": "Kilometer",
  "Farbe[0]": "Farbe",
  Treibstoff: "Treibstoff",
  Leistung: "Leistung",
  Getriebe: "Getriebe",
  Hubraum: "Hubraum",
  gw_nr: "GW-Nr",
};

export type PositionalResult = {
  /** Gefundene Werte unter den Namen der Preisblatt-Vorlage. */
  fields: Record<string, string>;
  /** Felder, bei denen die Zuordnung nicht eindeutig war. */
  ambiguous: string[];
};

/**
 * Sichtbare Werte den bekannten Feldern zuordnen.
 *
 * Ein Text zählt nur, wenn seine linke untere Ecke mit der des Feldes
 * übereinstimmt. Das ist keine Näherung: Der Erzeuger setzt das
 * Darstellungsobjekt genau auf die Feldecke, gemessen stimmen beide auf unter
 * einen Zehntelpunkt überein. Die Toleranz von zwei Punkt fängt nur
 * Rundungen ab.
 *
 * Passen mehrere Texte auf dasselbe Feld, wird nichts übernommen – ein
 * stillschweigend gewählter von zwei Kandidaten wäre eine erfundene Angabe.
 */
export function extractPositionalFields(
  objects: Map<number, PdfObject>,
): PositionalResult {
  const rects = collectFieldRects(objects);
  const placed = extractPlacedText(objects);

  const fields: Record<string, string> = {};
  const ambiguous: string[] = [];

  for (const [name, alias] of Object.entries(FIELD_ALIASES)) {
    const rect = rects.get(name);
    if (!rect) continue;

    const matches = placed.filter(
      (text) =>
        Math.abs(text.x - rect.x) <= ORIGIN_TOLERANCE &&
        Math.abs(text.y - rect.y) <= ORIGIN_TOLERANCE,
    );

    if (matches.length === 0) continue;

    if (matches.length > 1) {
      ambiguous.push(alias);
      continue;
    }

    const value = matches[0].text.trim();
    if (value !== "" && value !== "-") fields[alias] = value;
  }

  return { fields, ambiguous };
}
