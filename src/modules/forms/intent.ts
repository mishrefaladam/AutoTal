import type { CrmLeadType } from "@/generated/prisma/enums";

/**
 * Anliegen, das ein Besucher aus der Seite mitbringt, aus der er kommt.
 *
 * Das Kontaktformular ist bewusst EIN Formular. Wer von /finanzierung auf
 * „Beratung anfragen“ klickt, landet im selben Formular wie jemand, der über
 * die Navigation kommt – der Kontext ginge dabei verloren, und im CRM entstünde
 * ein GENERAL-Lead, obwohl es um eine Finanzierung geht.
 *
 * Deshalb wird das Anliegen als URL-Parameter mitgegeben:
 *
 *     /kontakt?anliegen=finanzierung  ->  CrmLeadType FINANCING
 *     /kontakt?anliegen=probefahrt    ->  CrmLeadType TEST_DRIVE
 *     /kontakt                        ->  CrmLeadType GENERAL
 *
 * Der Parameter ist deutsch, weil er in der Adresszeile sichtbar ist. Die
 * Zuordnung zum Enum passiert genau hier, damit sie nicht an mehreren Stellen
 * nachgebaut wird.
 *
 * VERTRAUENSWÜRDIGKEIT: Der Wert kommt aus der URL und ist damit vom Besucher
 * frei wählbar. Das ist unkritisch – er ordnet lediglich seine eigene Anfrage
 * einer Kategorie zu. Etwas anderes hängt daran nicht: keine Berechtigung, kein
 * Preis, kein Versandziel. Ein unbekannter Wert wird still verworfen und fällt
 * auf GENERAL zurück, statt das Formular mit einem Validierungsfehler zu
 * blockieren – ein kaputter Link darf niemanden am Absenden hindern.
 *
 * Dieses Modul ist bewusst NICHT `server-only`: Das Formular ist eine
 * Client-Komponente und braucht dieselben Beschriftungen.
 */

/** Name des URL-Parameters. An einer Stelle definiert, überall verwendet. */
export const CONTACT_INTENT_PARAM = "anliegen";

/**
 * Erlaubte Werte als Tupel – damit `z.enum(...)` sie direkt übernehmen kann
 * und beim Ergänzen eines Anliegens nirgends eine Liste nachgezogen werden muss.
 */
export const CONTACT_INTENT_VALUES = ["finanzierung", "probefahrt"] as const;

export type ContactIntent = (typeof CONTACT_INTENT_VALUES)[number];

type ContactIntentConfig = {
  /** Anliegen im CRM. */
  leadType: CrmLeadType;
  /** Vorbelegter Betreff – der Besucher soll den Kontext sehen und ändern können. */
  subject: string;
  /** Kurzer Hinweis über dem Formular. */
  notice: string;
};

/**
 * Vollständiger Record: Kommt ein Wert zu `CONTACT_INTENT_VALUES` hinzu,
 * schlägt hier der Typecheck fehl, statt dass das Anliegen still auf GENERAL
 * fällt.
 */
export const CONTACT_INTENTS: Record<ContactIntent, ContactIntentConfig> = {
  finanzierung: {
    leadType: "FINANCING",
    subject: "Finanzierungsberatung",
    notice:
      "Sie fragen eine Finanzierungsberatung an. Betreff und Nachricht können " +
      "Sie natürlich anpassen.",
  },
  probefahrt: {
    leadType: "TEST_DRIVE",
    subject: "Probefahrt vereinbaren",
    notice:
      "Sie möchten eine Probefahrt vereinbaren. Schreiben Sie uns gerne dazu, " +
      "welches Fahrzeug Sie interessiert und wann es Ihnen passt.",
  },
};

/**
 * Liest das Anliegen aus einem rohen URL-Wert.
 *
 * Nimmt auch das Array entgegen, das Next.js bei mehrfach gesetztem Parameter
 * liefert (`?anliegen=a&anliegen=b`) – dann zählt der erste Wert.
 *
 * Alles Unbekannte ergibt `null`. Es wird ausdrücklich nicht geworfen: Ein
 * veralteter oder manipulierter Link soll das Formular nicht unbenutzbar machen.
 */
export function parseContactIntent(
  raw: string | string[] | undefined | null,
): ContactIntent | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value) return null;

  return (CONTACT_INTENT_VALUES as readonly string[]).includes(value)
    ? (value as ContactIntent)
    : null;
}

/**
 * Anliegen -> CRM-Typ. Ohne Kontext bleibt es bei GENERAL.
 *
 * Einzige Stelle, an der diese Zuordnung stattfindet.
 */
export function contactIntentLeadType(
  intent: ContactIntent | null | undefined,
): CrmLeadType {
  return intent ? CONTACT_INTENTS[intent].leadType : "GENERAL";
}

/** Fertiger Link auf das Kontaktformular mit Kontext. */
export function contactHrefForIntent(intent: ContactIntent): string {
  return `/kontakt?${CONTACT_INTENT_PARAM}=${intent}`;
}
