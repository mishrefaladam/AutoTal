import { z } from "zod";

/**
 * Validierungsschemata aller öffentlichen Formulare.
 *
 * Dieselben Schemata laufen im Browser (react-hook-form) und am Server. Die
 * Serverprüfung ist die maßgebliche – die Clientprüfung dient nur der
 * schnellen Rückmeldung und lässt sich trivial umgehen.
 *
 * TYPEN: Weil einige Felder transformiert werden (Zahlenfelder kommen als
 * String aus dem Formular und gehen als `number` heraus), unterscheiden sich
 * Eingabe- und Ausgabetyp. Deshalb exportiert jedes Formular beides:
 *   `…FormValues` = z.input  -> Typ des Formularzustands
 *   `…Input`      = z.output -> Typ, den die Server Action erhält
 *
 * Alle Meldungen sind auf Deutsch und benennen konkret, was zu tun ist.
 */

const MAX_MESSAGE_LENGTH = 5000;

const name = z
  .string()
  .trim()
  .min(2, "Bitte geben Sie Ihren Namen an.")
  .max(120, "Der Name ist zu lang.");

const email = z
  .string()
  .trim()
  .min(1, "Bitte geben Sie Ihre E-Mail-Adresse an.")
  .max(200, "Die E-Mail-Adresse ist zu lang.")
  .email("Diese E-Mail-Adresse sieht nicht gültig aus.");

/** Telefonnummern werden bewusst locker geprüft – Formate variieren stark. */
const phoneRequired = z
  .string()
  .trim()
  .min(6, "Bitte geben Sie eine Telefonnummer an, unter der wir Sie erreichen.")
  .max(40, "Die Telefonnummer ist zu lang.")
  .regex(/^[+\d][\d\s/()\-.]*$/, "Bitte geben Sie eine gültige Telefonnummer an.");

const phoneOptional = z
  .string()
  .trim()
  .max(40, "Die Telefonnummer ist zu lang.")
  .refine(
    (value) => value === "" || /^[+\d][\d\s/()\-.]{5,}$/.test(value),
    "Bitte geben Sie eine gültige Telefonnummer an.",
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const message = z
  .string()
  .trim()
  .min(10, "Bitte beschreiben Sie Ihr Anliegen in ein paar Worten.")
  .max(MAX_MESSAGE_LENGTH, "Die Nachricht ist zu lang.");

const optionalText = z
  .string()
  .trim()
  .max(MAX_MESSAGE_LENGTH, "Der Text ist zu lang.")
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/**
 * Pflicht-Ankreuzfeld.
 *
 * Bewusst `boolean` + `refine` statt `z.literal(true)`: Der Eingabetyp bleibt
 * damit `boolean`, sodass das Formular sauber mit `false` starten kann – ein
 * vorangekreuztes Kästchen wäre datenschutzrechtlich ohnehin unzulässig.
 */
function requiredConsent(message: string) {
  return z.boolean().refine((value) => value === true, { message });
}

/**
 * Zahlenfeld: kommt als String aus dem Formular, geht als `number` heraus.
 */
function numericField(options: {
  required: string;
  min: number;
  max: number;
  minMessage: string;
  maxMessage: string;
}) {
  return z
    .string()
    .trim()
    .min(1, options.required)
    .regex(/^\d+$/, "Bitte geben Sie nur Ziffern ohne Punkt oder Komma ein.")
    .transform(Number)
    .refine((value) => value >= options.min, options.minMessage)
    .refine((value) => value <= options.max, options.maxMessage);
}

/** Optionales Zahlenfeld – leer bedeutet "keine Angabe". */
function optionalNumericField(max: number) {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Bitte geben Sie nur Ziffern ohne Punkt oder Komma ein.",
    )
    .transform((value) => (value === "" ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || value <= max,
      "Bitte prüfen Sie diesen Wert.",
    )
    .optional();
}

/**
 * Honeypot: ein für Menschen unsichtbares Feld. Füllt es jemand aus, war es
 * ein Bot. Kostet nichts und fängt den Großteil des automatisierten Spams ab.
 */
const honeypot = z
  .string()
  .max(0, "Diese Anfrage wurde als automatisiert eingestuft.")
  .optional();

const privacyConsent = requiredConsent(
  "Bitte stimmen Sie der Verarbeitung Ihrer Daten zu.",
);

// --- Kontaktformular -------------------------------------------------------

export const contactSchema = z.object({
  name,
  email,
  phone: phoneOptional,
  subject: z
    .string()
    .trim()
    .min(3, "Bitte geben Sie einen Betreff an.")
    .max(150, "Der Betreff ist zu lang."),
  message,
  privacyConsent,
  website: honeypot,
});

export type ContactFormValues = z.input<typeof contactSchema>;
export type ContactInput = z.output<typeof contactSchema>;

// --- Fahrzeugankauf (US-11) ------------------------------------------------

const currentYear = new Date().getFullYear();

export const SELL_CAR_FUEL_OPTIONS = [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUGIN_HYBRID",
  "ELECTRIC",
  "LPG",
  "CNG",
  "OTHER",
] as const;

export const SELL_CAR_TRANSMISSION_OPTIONS = [
  "MANUAL",
  "AUTOMATIC",
  "SEMI_AUTOMATIC",
] as const;

export const sellCarSchema = z.object({
  name,
  email,
  phone: phoneRequired,

  make: z
    .string()
    .trim()
    .min(2, "Bitte geben Sie die Marke an.")
    .max(60, "Die Angabe ist zu lang."),
  model: z
    .string()
    .trim()
    .min(1, "Bitte geben Sie das Modell an.")
    .max(80, "Die Angabe ist zu lang."),

  firstRegistrationYear: numericField({
    required: "Bitte geben Sie das Jahr der Erstzulassung an.",
    min: 1950,
    max: currentYear + 1,
    minMessage: "Bitte geben Sie ein Jahr ab 1950 an.",
    maxMessage: `Das Jahr kann nicht nach ${currentYear + 1} liegen.`,
  }),

  mileageKm: numericField({
    required: "Bitte geben Sie den Kilometerstand an.",
    min: 0,
    max: 2_000_000,
    minMessage: "Der Kilometerstand kann nicht negativ sein.",
    maxMessage: "Bitte prüfen Sie den Kilometerstand.",
  }),

  fuel: z.enum(SELL_CAR_FUEL_OPTIONS, {
    message: "Bitte wählen Sie eine Kraftstoffart.",
  }),
  transmission: z.enum(SELL_CAR_TRANSMISSION_OPTIONS, {
    message: "Bitte wählen Sie eine Getriebeart.",
  }),

  vin: z
    .string()
    .trim()
    .max(20, "Die Fahrgestellnummer ist zu lang.")
    .transform((value) => (value === "" ? undefined : value))
    .optional(),

  priceExpectationEuro: optionalNumericField(1_000_000),

  condition: optionalText,

  privacyConsent,
  website: honeypot,
});

export type SellCarFormValues = z.input<typeof sellCarSchema>;
export type SellCarInput = z.output<typeof sellCarSchema>;

/** Wandelt Zod-Fehler in das Format von react-hook-form / ActionResult. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (result[key] ??= []).push(issue.message);
  }

  return result;
}
