import "server-only";

import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

import { env, isOpenAIConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatNumber } from "@/lib/money";
import { UserFacingError } from "@/lib/result";
import {
  AUTOTAL_CLOSING,
  AUTOTAL_GREETING,
  AUTOTAL_SERVICE_LINES,
  buildInstagramCaption,
  buildVehicleFactLines,
  buildVehicleName,
} from "@/modules/social/caption";
import type { VehicleDetail } from "@/modules/vehicles/types";

/**
 * Erzeugung von Instagram-Texten aus Fahrzeugdaten (US-19).
 *
 * STAND: Der Instagram-Beitrag entsteht derzeit aus der AutoTal-Vorlage in
 * modules/social/caption.ts, nicht aus diesem Modul – der Text ist bis auf
 * vier Fahrzeugwerte fest, dafür braucht es keine KI. Dieses Modul bleibt für
 * spätere Social-Media-Funktionen erhalten; sein Prompt kennt dieselben vier
 * Werte und dieselbe Vorlage, damit ein KI-Text den gleichen Regeln folgt.
 *
 * Zentrale Regel: Die KI darf keine Fahrzeugdaten erfinden. Dafür greifen
 * drei Ebenen:
 *   1. Es werden ausschließlich vorhandene Felder in den Prompt übernommen.
 *      Fehlende Angaben tauchen gar nicht erst auf – so kann das Modell sie
 *      auch nicht "vervollständigen".
 *   2. Die Systemanweisung verbietet Ergänzungen ausdrücklich.
 *   3. Die Ausgabe wird nachgeprüft: Enthält der Text einen Euro-Betrag oder
 *      eine Kilometerangabe, muss diese exakt zum Fahrzeug passen. Sonst wird
 *      der Entwurf abgelehnt (siehe verifyCaptionFacts).
 *
 * Der API-Key bleibt serverseitig; dieses Modul ist `server-only`.
 * Veröffentlicht wird hier nichts – das ist ausschließlich ein Entwurf.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;

  if (!apiKey) {
    throw new UserFacingError(
      "Die KI-Funktion ist nicht eingerichtet. Bitte hinterlegen Sie einen " +
        "OpenAI-API-Key in den Umgebungsvariablen.",
      "NOT_CONFIGURED",
    );
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export type GeneratedCaption = {
  caption: string;
  hashtags: string[];
  model: string;
};

export type CaptionTone =
  | "seriös"
  | "sportlich"
  | "luxuriös"
  | "kurz"
  | "emotional";

export type CaptionStyleOptions = {
  /** Reine Stilreferenz. Die enthaltenen Fahrzeugangaben sind keine Faktenquelle. */
  exampleText?: string | null;
  tone?: CaptionTone | null;
  maxCharacters?: number | null;
};

export type CaptionCompletionRequest = ChatCompletionCreateParamsNonStreaming;

type CaptionCompletionResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

export type CaptionGenerationDependencies = {
  /** Ermöglicht Tests ohne echten API-Aufruf. In der Anwendung bleibt es leer. */
  createCompletion?: (
    request: CaptionCompletionRequest,
  ) => Promise<CaptionCompletionResponse>;
  model?: string;
};

export const DEFAULT_INSTAGRAM_MAX_CHARACTERS = 900;

/**
 * Stilreferenz: die AutoTal-Vorlage mit Beispielwerten.
 *
 * Inhaltliche Aussagen daraus – der Porsche, seine Zahlen – dürfen niemals in
 * einen Beitrag übernommen werden; sie zeigen nur den Aufbau.
 */
export const DEFAULT_INSTAGRAM_STYLE_EXAMPLE = buildInstagramCaption({
  make: "Porsche",
  model: "Panamera",
  variant: "4S",
  mileageKm: 85_000,
  firstRegistration: new Date(Date.UTC(2019, 5, 1)),
  powerKw: 324,
});

function resolveStyleOptions(options: CaptionStyleOptions = {}) {
  const exampleText = options.exampleText?.trim() || DEFAULT_INSTAGRAM_STYLE_EXAMPLE;
  const tone = options.tone ?? "seriös";
  const requestedMax = options.maxCharacters ?? DEFAULT_INSTAGRAM_MAX_CHARACTERS;
  const maxCharacters = Math.min(2_000, Math.max(300, Math.floor(requestedMax)));

  return { exampleText, tone, maxCharacters };
}

export function buildInstagramSystemPrompt(
  options: CaptionStyleOptions = {},
): string {
  const { maxCharacters, tone } = resolveStyleOptions(options);

  return `Du bist Social-Media-Redakteur für AutoTal und schreibst professionelle Instagram-Beiträge für Gebrauchtwagen.

ABSOLUTE REGELN:
- Du darfst ausschließlich die angegebenen Fahrzeugdaten verwenden. Wenn eine Information fehlt, lasse sie weg. Erfinde keine Ausstattung, keine Garantie, keinen Preis, keine Finanzierung, keine Zustandsbeschreibung und keine technischen Daten.
- Die Stilreferenz ist niemals eine Faktenquelle. Übernimm aus ihr nur Aufbau, Ton, Länge, Formulierungsart, Call-to-Action-, Emoji- und Hashtag-Stil. Kopiere sie nicht und übernimm keine ihrer Fahrzeugdaten oder Leistungsversprechen.
- Behaupte niemals "unfallfrei", "1. Besitz" oder "servicegepflegt", außer genau diese Aussage steht ausdrücklich in den Fahrzeugdaten.
- Erfinde keine Verbrauchs- oder CO2-Werte, Vorbesitzerzahl, Zustandsbewertung, Garantie, Finanzierung, Eintausch, Lieferung, Rabatte oder Aktionen.
- Formuliere keine verbindliche Finanzierungszusage, kein Garantieversprechen und keine rechtlich riskanten Superlative wie "unschlagbar", "perfekt" oder "garantiert".
- Wenn eine Angabe fehlt, erwähne sie gar nicht. Schreibe niemals "ca.", "vermutlich", "und vieles mehr" oder einen Platzhalter.
- Übernimm Preis und Kilometerstand exakt so, wie sie angegeben sind. Runde nicht, schätze nicht, formuliere sie nicht um.

AUFBAU (halte dich eng an dieses Muster, Tonalität: ${tone}, höchstens ${maxCharacters} Zeichen):
1. Erste Zeile exakt: "${AUTOTAL_GREETING}"
2. Leerzeile, dann der Fahrzeugname und darunter je eine Zeile "Kilometer: …", "Baujahr: …", "Leistung: … PS" – ausschließlich die Zeilen, für die ein Wert angegeben ist. Fehlt ein Wert, lasse die ganze Zeile weg. Keine weiteren Fahrzeugangaben: keine Ausstattung, keine Extras, keine Farbe, kein Getriebe, kein Kraftstoff, kein Preis.
3. Leerzeile, dann exakt diese drei Zeilen:
${AUTOTAL_SERVICE_LINES.join("\n")}
4. Leerzeile, dann exakt:
${AUTOTAL_CLOSING}
- Setze KEINE Hashtags in den Fließtext; die kommen separat.

HASHTAGS:
- Sechs bis zehn Stück, ohne Rautezeichen im Ausgabefeld.
- AutoTal, AutoTalWien und GebrauchtwagenWien sollen enthalten sein.
- Ergänze nur relevante Tags für die tatsächlich angegebene Marke, das Modell, die Fahrzeugart und die Region. Keine irreführenden Tags.`;
}

/**
 * Baut den Nutzer-Prompt aus den vier Werten, die der Beitrag braucht.
 *
 * Fahrzeugname, Kilometer, Baujahr und Leistung in PS – dieselben Zeilen, die
 * auch die Vorlage schreibt. Ein leerer Wert wird weggelassen statt mit
 * "unbekannt" gefüllt; so kann das Modell ihn auch nicht "vervollständigen".
 * Ausstattung, Preis, Farbe und alles Weitere gehen bewusst nicht mit: Was
 * nicht im Prompt steht, kann der Text nicht enthalten.
 */
export function buildVehiclePrompt(
  vehicle: VehicleDetail,
  company: { displayName: string; city: string },
  options: CaptionStyleOptions = {},
): string {
  const { exampleText } = resolveStyleOptions(options);
  const facts = [
    `Fahrzeugname: ${buildVehicleName(vehicle)}`,
    ...buildVehicleFactLines(vehicle),
  ];

  return [
    `Autohaus: ${company.displayName}`,
    company.city ? `Standort: ${company.city}` : null,
    "",
    "FAHRZEUGDATEN (nur diese verwenden, nichts ergänzen):",
    ...facts.map((fact) => `- ${fact}`),
    "",
    "STILREFERENZ (nur Stil und Aufbau, keine Fakten übernehmen):",
    exampleText,
    "",
    "WICHTIG: Der fertige Text muss eigenständig formuliert sein. Aussagen aus der Stilreferenz dürfen nur erscheinen, wenn sie zusätzlich in den Fahrzeugdaten stehen.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    caption: {
      type: "string",
      description: "Der Beitragstext ohne Hashtags.",
    },
    hashtags: {
      type: "array",
      description: "6 bis 10 relevante Hashtags ohne Rautezeichen.",
      items: { type: "string" },
      minItems: 6,
      maxItems: 10,
    },
  },
  required: ["caption", "hashtags"],
  additionalProperties: false,
} as const;

export async function generateInstagramCaption(
  vehicle: VehicleDetail,
  company: { displayName: string; city: string },
  styleOptions: CaptionStyleOptions = {},
  dependencies: CaptionGenerationDependencies = {},
): Promise<GeneratedCaption> {
  if (!dependencies.createCompletion && !isOpenAIConfigured()) {
    throw new UserFacingError(
      "Die KI-Funktion ist nicht eingerichtet. Bitte hinterlegen Sie einen " +
        "OpenAI-API-Key in den Umgebungsvariablen.",
      "NOT_CONFIGURED",
    );
  }

  const model = dependencies.model ?? env().OPENAI_MODEL;
  const { maxCharacters } = resolveStyleOptions(styleOptions);
  const createCompletion =
    dependencies.createCompletion ??
    ((request: CaptionCompletionRequest) =>
      getClient().chat.completions.create(request));

  try {
    const response = await createCompletion({
      model,
      // Niedrige Temperatur: Hier ist Genauigkeit wichtiger als Kreativität.
      temperature: 0.35,
      max_tokens: 500,
      messages: [
        { role: "system", content: buildInstagramSystemPrompt(styleOptions) },
        {
          role: "user",
          content: buildVehiclePrompt(vehicle, company, styleOptions),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "instagram_caption",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new UserFacingError(
        "Die KI hat keinen Text zurückgegeben. Bitte versuchen Sie es erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }

    const parsed = JSON.parse(content) as {
      caption?: unknown;
      hashtags?: unknown;
    };

    const caption =
      typeof parsed.caption === "string" ? parsed.caption.trim() : "";

    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.replace(/^#+/, "").trim())
          .filter(Boolean)
          .filter((tag, index, all) => all.indexOf(tag) === index)
          .slice(0, 10)
      : [];

    if (!caption) {
      throw new UserFacingError(
        "Die KI hat einen leeren Text zurückgegeben. Bitte versuchen Sie es erneut.",
        "SERVICE_UNAVAILABLE",
      );
    }

    if (caption.length > maxCharacters) {
      throw new UserFacingError(
        `Die KI-Antwort war länger als ${maxCharacters} Zeichen. Bitte versuchen Sie es erneut.`,
        "SERVICE_UNAVAILABLE",
      );
    }

    logger.info("Instagram-Caption erzeugt", {
      vehicleId: vehicle.id,
      model,
      captionLength: caption.length,
    });

    return { caption, hashtags, model };
  } catch (error) {
    if (error instanceof UserFacingError) throw error;

    // Die Fehlermeldung von OpenAI kann Kontingent- und Kontodetails
    // enthalten – sie bleibt im Log.
    logger.error("Caption-Generierung fehlgeschlagen", {
      vehicleId: vehicle.id,
      model,
      error,
    });

    throw new UserFacingError(
      "Der KI-Dienst ist gerade nicht erreichbar. Bitte versuchen Sie es in " +
        "ein paar Minuten erneut.",
      "SERVICE_UNAVAILABLE",
    );
  }
}

// ---------------------------------------------------------------------------
// Faktenprüfung
// ---------------------------------------------------------------------------

export type FactCheckIssue = {
  field: "Preis" | "Kilometerstand";
  found: string;
  expected: string;
};

/**
 * Prüft den erzeugten Text gegen die tatsächlichen Fahrzeugdaten.
 *
 * Es wird nicht versucht, "Halluzination" allgemein zu erkennen – das wäre
 * unzuverlässig. Geprüft werden die beiden Zahlen, bei denen ein Fehler
 * teuer wäre: Preis und Kilometerstand. Findet sich im Text ein Euro-Betrag
 * oder eine Kilometerangabe, muss sie exakt stimmen.
 *
 * Diese Prüfung ist der Grund, warum die Regel "keine erfundenen Daten" nicht
 * allein von der Formulierung des Prompts abhängt.
 */
export function verifyCaptionFacts(
  text: string,
  vehicle: { priceCents: number; mileageKm: number },
): FactCheckIssue[] {
  const issues: FactCheckIssue[] = [];

  const toNumber = (raw: string): number =>
    Number(raw.replace(/[.\s\u00a0\u202f']/g, "").replace(",", "."));

  // Eine Zahl beginnt und endet auf einer Ziffer; dazwischen sind Punkt,
  // Komma und Gruppierungs-Leerzeichen erlaubt ("34.900", "96 200").
  //
  // Die Ziffern an beiden Enden sind wesentlich: Wäre führender Leerraum
  // Teil der Zahl, könnte der zweite Zweig das Leerzeichen VOR dem Eurozeichen
  // matchen, es verbrauchen – und die eigentliche Zahl dahinter würde nie
  // geprüft. Die Preiskontrolle liefe dann ins Leere.
  const NUMBER = String.raw`\d(?:[\d.,\s\u00a0\u202f']*\d)?`;

  // Euro-Beträge: "€ 34.900", "34.900 €", "34900 EUR", "EUR 34.900"
  const priceMatches = [
    ...text.matchAll(
      new RegExp(
        `(?:€|EUR)\\s*(${NUMBER})|(${NUMBER})\\s*(?:€|EUR)`,
        "gi",
      ),
    ),
  ];

  const expectedPrice = vehicle.priceCents / 100;

  for (const match of priceMatches) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) continue;

    const value = toNumber(raw);
    if (!Number.isFinite(value) || value === 0) continue;

    // Monatsraten aus einer Finanzierung sind hier nicht gemeint – deshalb
    // wird nur beanstandet, was als Kaufpreis durchgehen könnte.
    if (value >= expectedPrice * 0.5 && value !== expectedPrice) {
      issues.push({
        field: "Preis",
        found: raw,
        expected: formatNumber(expectedPrice),
      });
    }
  }

  // Kilometerangaben: "96.200 km", "96200km"
  const mileageMatches = [
    ...text.matchAll(new RegExp(`(${NUMBER})\\s*km\\b`, "gi")),
  ];

  for (const match of mileageMatches) {
    const value = toNumber(match[1]);
    if (!Number.isFinite(value) || value === 0) continue;

    if (value !== vehicle.mileageKm) {
      issues.push({
        field: "Kilometerstand",
        found: match[1].trim(),
        expected: formatNumber(vehicle.mileageKm),
      });
    }
  }

  return issues;
}
