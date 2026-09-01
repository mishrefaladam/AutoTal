import { z } from "zod";

/**
 * Validierung der Unternehmensdaten (US-15, US-16).
 *
 * Diese Daten erscheinen auf jeder Seite und im Impressum – deshalb wird hier
 * strenger geprüft als bei Besucherformularen. Ein leeres Pflichtfeld würde
 * zu einem unvollständigen Impressum führen, und das ist in Österreich
 * abmahnfähig.
 */

const requiredText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein.`)
    .max(max, `${label} ist zu lang.`);

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, "Die Eingabe ist zu lang.")
    .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .string()
  .trim()
  .max(500, "Die Adresse ist zu lang.")
  .refine(
    (value) => value === "" || /^https:\/\/.+/.test(value),
    "Bitte eine vollständige Adresse angeben, die mit https:// beginnt.",
  )
  .transform((value) => (value === "" ? null : value));

/** "HH:mm" – leer bedeutet, dass der Zeitraum nicht genutzt wird. */
const timeString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    "Bitte im Format HH:MM angeben, z. B. 08:30.",
  );

const optionalCoordinate = (label: string, limit: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || !Number.isNaN(Number(value)),
      `${label} muss eine Zahl sein.`,
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || Math.abs(value) <= limit,
      `${label} liegt außerhalb des gültigen Bereichs.`,
    );

export const openingHourSlotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    position: z.number().int().min(0).max(3),
    closed: z.boolean(),
    opensAt: timeString,
    closesAt: timeString,
  })
  .refine(
    (slot) =>
      slot.closed ||
      (slot.opensAt === "" && slot.closesAt === "") ||
      (slot.opensAt !== "" && slot.closesAt !== ""),
    {
      message: "Bitte Öffnungs- und Schließzeit gemeinsam angeben.",
      path: ["closesAt"],
    },
  )
  .refine(
    (slot) =>
      slot.closed ||
      slot.opensAt === "" ||
      slot.closesAt === "" ||
      slot.opensAt < slot.closesAt,
    {
      message: "Die Schließzeit muss nach der Öffnungszeit liegen.",
      path: ["closesAt"],
    },
  );

export const socialLinkSchema = z.object({
  platform: z.enum(["instagram", "facebook", "youtube", "linkedin", "tiktok"]),
  url: optionalUrl,
});

export const companySettingsSchema = z.object({
  legalName: requiredText("Der Firmenwortlaut"),
  displayName: requiredText("Der Anzeigename", 80),
  tagline: optionalText(160),
  aboutText: z.string().trim().max(4000, "Der Text ist zu lang."),

  street: requiredText("Die Straße"),
  postalCode: requiredText("Die Postleitzahl", 12),
  city: requiredText("Der Ort", 100),
  country: requiredText("Das Land", 80),

  phone: requiredText("Die Telefonnummer", 40).refine(
    (value) => /^[+\d][\d\s/()\-.]*$/.test(value),
    "Bitte eine gültige Telefonnummer angeben.",
  ),
  /** Nur Ziffern inkl. Ländervorwahl, z. B. 436641234567 */
  whatsappNumber: z
    .string()
    .trim()
    .max(20, "Die Nummer ist zu lang.")
    .refine(
      (value) => value === "" || /^\d{8,20}$/.test(value),
      "Nur Ziffern inklusive Ländervorwahl, z. B. 436641234567 – ohne + und Leerzeichen.",
    )
    .transform((value) => (value === "" ? null : value)),
  email: z
    .string()
    .trim()
    .min(1, "Die E-Mail-Adresse darf nicht leer sein.")
    .email("Bitte eine gültige E-Mail-Adresse angeben."),

  vatId: optionalText(30),
  commercialRegisterNumber: optionalText(40),
  commercialRegisterCourt: optionalText(120),

  contactPersonName: optionalText(120),
  contactPersonRole: optionalText(120),
  contactPersonEmail: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      "Bitte eine gültige E-Mail-Adresse angeben.",
    )
    .transform((value) => (value === "" ? null : value)),
  contactPersonPhone: optionalText(40),

  latitude: optionalCoordinate("Der Breitengrad", 90),
  longitude: optionalCoordinate("Der Längengrad", 180),

  openingHours: z.array(openingHourSlotSchema).max(21),
  socialLinks: z.array(socialLinkSchema).max(10),
});

export type CompanySettingsFormValues = z.input<typeof companySettingsSchema>;
export type CompanySettingsInput = z.output<typeof companySettingsSchema>;
