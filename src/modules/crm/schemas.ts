import { z } from "zod";

import {
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadType,
} from "@/generated/prisma/enums";

/**
 * Validierung der CRM-Eingaben im Admin.
 *
 * Dieselbe Konvention wie bei den öffentlichen Formularen: `…FormValues`
 * (z.input) ist der Typ des Formularzustands, `…Input` (z.output) das, was
 * die Server Action bekommt. Die Serverprüfung ist die maßgebliche.
 */

const MAX_TEXT_LENGTH = 5000;

const name = z
  .string()
  .trim()
  .min(2, "Bitte geben Sie einen Namen an.")
  .max(120, "Der Name ist zu lang.");

/** Telefonnummern bewusst locker geprüft – Formate variieren stark. */
const optionalPhone = z
  .string()
  .trim()
  .max(40, "Die Telefonnummer ist zu lang.")
  .refine(
    (value) => value === "" || /^[+\d][\d\s/()\-.]{5,}$/.test(value),
    "Bitte geben Sie eine gültige Telefonnummer an.",
  )
  .transform((value) => (value === "" ? null : value));

const optionalEmail = z
  .string()
  .trim()
  .max(200, "Die E-Mail-Adresse ist zu lang.")
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Diese E-Mail-Adresse sieht nicht gültig aus.",
  )
  .transform((value) => (value === "" ? null : value.toLowerCase()));

const optionalText = z
  .string()
  .trim()
  .max(MAX_TEXT_LENGTH, "Der Text ist zu lang.");

/**
 * Enum-Feld direkt aus dem Prisma-Enum.
 *
 * Bewusst `z.enum(EnumObjekt)` statt `Object.values(...)`: Nur so bleibt der
 * Ausgabetyp der schmale Enum-Typ und nicht `string` – sonst müsste an jeder
 * Verwendungsstelle gecastet werden.
 */
function enumField<T extends Record<string, string>>(values: T, label: string) {
  return z.enum(values, { message: `Bitte ${label} auswählen.` });
}

/**
 * Manuell im Admin angelegter Lead.
 *
 * Mindestens eine Erreichbarkeit ist Pflicht: Ein Lead ohne Telefon und ohne
 * E-Mail wäre im Vertrieb wertlos – man könnte ihn nicht bearbeiten.
 */
export const crmLeadCreateSchema = z
  .object({
    name,
    phone: optionalPhone,
    email: optionalEmail,
    type: enumField(CrmLeadType, "ein Anliegen"),
    source: enumField(CrmLeadSource, "eine Quelle"),
    message: optionalText,
  })
  .refine((data) => data.phone !== null || data.email !== null, {
    message: "Bitte geben Sie eine Telefonnummer oder eine E-Mail-Adresse an.",
    path: ["phone"],
  });

/** Bearbeitung eines bestehenden Leads. Kundendaten bleiben unverändert. */
export const crmLeadUpdateSchema = z.object({
  id: z.string().min(1),
  status: enumField(CrmLeadStatus, "einen Status"),
  internalNotes: optionalText,
  /** Setzt lastContactAt auf jetzt – dokumentiert einen Kontaktversuch. */
  markContacted: z.boolean().default(false),
});

export type CrmLeadCreateFormValues = z.input<typeof crmLeadCreateSchema>;
export type CrmLeadCreateInput = z.output<typeof crmLeadCreateSchema>;
export type CrmLeadUpdateFormValues = z.input<typeof crmLeadUpdateSchema>;
export type CrmLeadUpdateInput = z.output<typeof crmLeadUpdateSchema>;
