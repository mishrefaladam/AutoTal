import { z } from "zod";

import {
  BodyType,
  FuelType,
  TransmissionType,
  VehicleCondition,
} from "@/generated/prisma/enums";

/**
 * Validierung der Fahrzeugpflege im Adminbereich.
 *
 * Eingabe- und Ausgabetyp unterscheiden sich: Im Formular stehen überall
 * Strings, gespeichert werden Zahlen in Cent bzw. Datumswerte. Deshalb wie
 * bei den öffentlichen Formularen zwei exportierte Typen.
 */

const currentYear = new Date().getFullYear();

const requiredText = (label: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein.`)
    .max(max, `${label} ist zu lang.`);

const optionalText = (max = 120) =>
  z
    .string()
    .trim()
    .max(max, "Die Eingabe ist zu lang.")
    .transform((value) => (value === "" ? null : value));

/** Pflicht-Zahlenfeld: kommt als String, geht als number heraus. */
function requiredNumber(options: {
  label: string;
  min: number;
  max: number;
}) {
  return z
    .string()
    .trim()
    .min(1, `${options.label} darf nicht leer sein.`)
    // Tausenderpunkte und Leerzeichen sind beim Abtippen üblich.
    .transform((value) => value.replace(/[.\s ]/g, ""))
    .refine((value) => /^\d+$/.test(value), `${options.label} bitte als Zahl angeben.`)
    .transform(Number)
    .refine(
      (value) => value >= options.min && value <= options.max,
      `${options.label} muss zwischen ${options.min} und ${options.max} liegen.`,
    );
}

/** Optionales Zahlenfeld – leer bedeutet "keine Angabe". */
function optionalNumber(max: number) {
  return z
    .string()
    .trim()
    .transform((value) => value.replace(/[.\s ]/g, ""))
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Bitte als Zahl angeben.",
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || value <= max,
      "Bitte prüfen Sie diesen Wert.",
    );
}

/** Monatsfeld "JJJJ-MM" aus <input type="month"> -> Date (Monatserster). */
const monthField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
    "Bitte im Format JJJJ-MM angeben.",
  )
  .transform((value) => {
    if (value === "") return null;
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  })
  .refine(
    (value) => value === null || value.getUTCFullYear() >= 1900,
    "Das Jahr liegt zu weit zurück.",
  )
  .refine(
    (value) => value === null || value.getUTCFullYear() <= currentYear + 1,
    `Das Jahr kann nicht nach ${currentYear + 1} liegen.`,
  );

/** Tagesdatum "JJJJ-MM-TT" aus <input type="date">. */
const dateField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Bitte ein gültiges Datum angeben.",
  )
  .transform((value) => (value === "" ? null : new Date(`${value}T00:00:00Z`)))
  .refine(
    (value) => value === null || !Number.isNaN(value.getTime()),
    "Bitte ein gültiges Datum angeben.",
  );

export const vehicleFormSchema = z.object({
  make: requiredText("Die Marke", 60),
  model: requiredText("Das Modell", 80),
  variant: optionalText(140),

  /** Eingabe in Euro, gespeichert wird in Cent. */
  priceEuro: requiredNumber({ label: "Der Preis", min: 1, max: 5_000_000 }),
  vatDeductible: z.boolean(),

  mileageKm: requiredNumber({
    label: "Der Kilometerstand",
    min: 0,
    max: 2_000_000,
  }),
  firstRegistration: monthField,

  fuel: z.enum(Object.values(FuelType) as [string, ...string[]], {
    message: "Bitte eine Kraftstoffart wählen.",
  }),
  transmission: z.enum(Object.values(TransmissionType) as [string, ...string[]], {
    message: "Bitte eine Getriebeart wählen.",
  }),
  bodyType: z.enum(Object.values(BodyType) as [string, ...string[]], {
    message: "Bitte einen Aufbau wählen.",
  }),
  condition: z.enum(Object.values(VehicleCondition) as [string, ...string[]], {
    message: "Bitte eine Fahrzeugart wählen.",
  }),

  powerKw: optionalNumber(2000),
  displacementCcm: optionalNumber(10_000),
  color: optionalText(60),
  doors: optionalNumber(9),
  seats: optionalNumber(99),
  previousOwners: optionalNumber(99),
  inspectionValidUntil: dateField,

  description: z
    .string()
    .trim()
    .max(6000, "Die Beschreibung ist zu lang."),

  /**
   * Ausstattung: eine Zeile je Merkmal. Das ist für Abtipper deutlich
   * angenehmer als Komma-Trennung, weil Ausstattungsnamen selbst Kommas
   * enthalten können ("Sitzheizung vorne, beheizbares Lenkrad").
   */
  features: z
    .string()
    .max(4000, "Die Ausstattungsliste ist zu lang.")
    .transform((value) =>
      value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 100),
    ),

  active: z.boolean(),
});

export type VehicleFormValues = z.input<typeof vehicleFormSchema>;
export type VehicleFormInput = z.output<typeof vehicleFormSchema>;

/** Leeres Formular für "Fahrzeug anlegen". */
export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
  make: "",
  model: "",
  variant: "",
  priceEuro: "",
  vatDeductible: false,
  mileageKm: "",
  firstRegistration: "",
  fuel: "DIESEL",
  transmission: "MANUAL",
  bodyType: "SEDAN",
  condition: "USED",
  powerKw: "",
  displacementCcm: "",
  color: "",
  doors: "",
  seats: "",
  previousOwners: "",
  inspectionValidUntil: "",
  description: "",
  features: "",
  active: true,
};
