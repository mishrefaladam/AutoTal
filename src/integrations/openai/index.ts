import "server-only";

import OpenAI from "openai";

import { env, isOpenAIConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  formatEuro,
  formatKilometers,
  formatNumber,
  formatPower,
} from "@/lib/money";
import { UserFacingError } from "@/lib/result";
import {
  BODY_TYPE_LABELS,
  CONDITION_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  formatRegistration,
} from "@/modules/vehicles/labels";
import type { VehicleDetail } from "@/modules/vehicles/types";

/**
 * Erzeugung von Instagram-Texten aus Fahrzeugdaten (US-19).
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

const SYSTEM_PROMPT = `Du bist Social-Media-Redakteur eines österreichischen Autohauses und schreibst Instagram-Beiträge für Gebrauchtwagen.

ABSOLUTE REGELN:
- Verwende AUSSCHLIESSLICH die Fahrzeugdaten, die dir im Nutzer-Prompt übergeben werden.
- Erfinde NIEMALS Angaben. Keine Ausstattung, keine Garantien, keine Verbrauchs- oder CO2-Werte, keine Unfallfreiheit, keine Vorbesitzerzahl, keine Zusagen zur Finanzierung – nichts, was nicht ausdrücklich dasteht.
- Wenn eine Angabe fehlt, erwähne sie gar nicht. Schreibe niemals "ca.", "vermutlich" oder Platzhalter.
- Übernimm Preis und Kilometerstand exakt so, wie sie angegeben sind. Runde nicht, schätze nicht, formuliere sie nicht um.
- Nenne keine Rabatte, Aktionen oder Preisnachlässe.
- Formuliere keine rechtsverbindlichen Aussagen und keine Kreditzusagen.

STIL:
- Deutsch, Sie-Form, professioneller Autohaus-Ton: sachlich, freundlich, ohne Werbefloskeln und Superlative.
- 60 bis 120 Wörter.
- Beginne mit dem Fahrzeug, nicht mit einer Begrüßungsfloskel.
- Höchstens drei Emojis, sparsam eingesetzt.
- Schließe mit einer konkreten Handlungsaufforderung (Besichtigung, Probefahrt oder Anruf).
- Setze KEINE Hashtags in den Fließtext; die kommen separat.

HASHTAGS:
- 8 bis 12 Stück, ohne Rautezeichen im Ausgabefeld.
- Relevant für Marke, Modell, Fahrzeugart und Region. Keine irreführenden Tags.`;

/**
 * Baut den Nutzer-Prompt ausschließlich aus tatsächlich vorhandenen Feldern.
 * Ein leeres Feld wird weggelassen statt mit "unbekannt" gefüllt – das
 * reduziert die Versuchung des Modells, es zu ergänzen.
 */
function buildVehiclePrompt(
  vehicle: VehicleDetail,
  company: { displayName: string; city: string },
): string {
  const facts: string[] = [
    `Marke: ${vehicle.make}`,
    `Modell: ${vehicle.model}`,
  ];

  if (vehicle.variant) facts.push(`Variante: ${vehicle.variant}`);

  facts.push(`Preis: ${formatEuro(vehicle.priceCents)}`);
  if (vehicle.vatDeductible) {
    facts.push("Preisangabe: Nettopreis, vorsteuerabzugsberechtigt");
  }

  facts.push(`Kilometerstand: ${formatKilometers(vehicle.mileageKm)}`);

  if (vehicle.firstRegistration) {
    facts.push(`Erstzulassung: ${formatRegistration(vehicle.firstRegistration)}`);
  }

  facts.push(`Kraftstoff: ${FUEL_LABELS[vehicle.fuel]}`);
  facts.push(`Getriebe: ${TRANSMISSION_LABELS[vehicle.transmission]}`);
  facts.push(`Aufbau: ${BODY_TYPE_LABELS[vehicle.bodyType]}`);
  facts.push(`Fahrzeugart: ${CONDITION_LABELS[vehicle.condition]}`);

  if (vehicle.powerKw !== null) facts.push(`Leistung: ${formatPower(vehicle.powerKw)}`);
  if (vehicle.color) facts.push(`Farbe: ${vehicle.color}`);
  if (vehicle.doors !== null) facts.push(`Türen: ${vehicle.doors}`);
  if (vehicle.seats !== null) facts.push(`Sitze: ${vehicle.seats}`);

  if (vehicle.features.length > 0) {
    facts.push(`Ausstattung: ${vehicle.features.join(", ")}`);
  }

  if (vehicle.description) {
    facts.push(`Beschreibung des Händlers: ${vehicle.description}`);
  }

  return [
    `Autohaus: ${company.displayName}`,
    company.city ? `Standort: ${company.city}` : null,
    "",
    "FAHRZEUGDATEN (nur diese verwenden):",
    ...facts.map((fact) => `- ${fact}`),
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
      description: "8 bis 12 Hashtags ohne Rautezeichen.",
      items: { type: "string" },
    },
  },
  required: ["caption", "hashtags"],
  additionalProperties: false,
} as const;

export async function generateInstagramCaption(
  vehicle: VehicleDetail,
  company: { displayName: string; city: string },
): Promise<GeneratedCaption> {
  if (!isOpenAIConfigured()) {
    throw new UserFacingError(
      "Die KI-Funktion ist nicht eingerichtet. Bitte hinterlegen Sie einen " +
        "OpenAI-API-Key in den Umgebungsvariablen.",
      "NOT_CONFIGURED",
    );
  }

  const model = env().OPENAI_MODEL;

  try {
    const response = await getClient().chat.completions.create({
      model,
      // Niedrige Temperatur: Hier ist Genauigkeit wichtiger als Kreativität.
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildVehiclePrompt(vehicle, company) },
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
          .slice(0, 15)
      : [];

    if (!caption) {
      throw new UserFacingError(
        "Die KI hat einen leeren Text zurückgegeben. Bitte versuchen Sie es erneut.",
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
