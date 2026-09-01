import { z } from "zod";

/**
 * Validierung der Finanzierungseinstellungen (US-17).
 *
 * Im Formular werden Prozentwerte eingegeben ("5,99"), gespeichert wird in
 * Basispunkten (599). Die Umrechnung passiert hier, damit sie an genau einer
 * Stelle steht.
 */

/** "5,99" oder "5.99" -> 599 Basispunkte */
function percentToBpField(label: string, maxPercent: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein.`)
    .transform((value) => value.replace(",", "."))
    .refine(
      (value) => /^\d+(\.\d{1,2})?$/.test(value),
      `${label} bitte als Zahl angeben, z. B. 5,99.`,
    )
    .transform((value) => Math.round(Number(value) * 100))
    .refine(
      (value) => value <= maxPercent * 100,
      `${label} darf höchstens ${maxPercent} % betragen.`,
    );
}

function monthsField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein.`)
    .refine((value) => /^\d+$/.test(value), `${label} bitte als ganze Zahl angeben.`)
    .transform(Number)
    .refine((value) => value >= 1 && value <= 240, `${label} muss zwischen 1 und 240 Monaten liegen.`);
}

export const financeConfigSchema = z
  .object({
    defaultInterestRateBp: percentToBpField("Der Standardzinssatz", 30),
    minInterestRateBp: percentToBpField("Der Mindestzinssatz", 30),
    maxInterestRateBp: percentToBpField("Der Höchstzinssatz", 30),

    minTermMonths: monthsField("Die Mindestlaufzeit"),
    maxTermMonths: monthsField("Die Höchstlaufzeit"),
    defaultTermMonths: monthsField("Die Standardlaufzeit"),

    minDownPaymentBp: percentToBpField("Die Mindestanzahlung", 100),
    maxDownPaymentBp: percentToBpField("Die Höchstanzahlung", 100),
    defaultDownPaymentBp: percentToBpField("Die Standardanzahlung", 100),

    minBalloonBp: percentToBpField("Die Mindest-Schlussrate", 100),
    maxBalloonBp: percentToBpField("Die Höchst-Schlussrate", 100),
    defaultBalloonBp: percentToBpField("Die Standard-Schlussrate", 100),

    disclaimer: z
      .string()
      .trim()
      .min(20, "Der Rechtshinweis ist verpflichtend und darf nicht entfernt werden.")
      .max(2000, "Der Rechtshinweis ist zu lang."),
  })
  // Ein Standardwert außerhalb seiner eigenen Grenzen würde den Rechner beim
  // Laden sofort in einen ungültigen Zustand bringen.
  .refine((data) => data.minInterestRateBp <= data.maxInterestRateBp, {
    message: "Der Mindestzinssatz darf nicht über dem Höchstzinssatz liegen.",
    path: ["minInterestRateBp"],
  })
  .refine(
    (data) =>
      data.defaultInterestRateBp >= data.minInterestRateBp &&
      data.defaultInterestRateBp <= data.maxInterestRateBp,
    {
      message: "Der Standardzinssatz muss zwischen Mindest- und Höchstzinssatz liegen.",
      path: ["defaultInterestRateBp"],
    },
  )
  .refine((data) => data.minTermMonths <= data.maxTermMonths, {
    message: "Die Mindestlaufzeit darf nicht über der Höchstlaufzeit liegen.",
    path: ["minTermMonths"],
  })
  .refine(
    (data) =>
      data.defaultTermMonths >= data.minTermMonths &&
      data.defaultTermMonths <= data.maxTermMonths,
    {
      message: "Die Standardlaufzeit muss zwischen Mindest- und Höchstlaufzeit liegen.",
      path: ["defaultTermMonths"],
    },
  )
  .refine((data) => data.minDownPaymentBp <= data.maxDownPaymentBp, {
    message: "Die Mindestanzahlung darf nicht über der Höchstanzahlung liegen.",
    path: ["minDownPaymentBp"],
  })
  .refine(
    (data) =>
      data.defaultDownPaymentBp >= data.minDownPaymentBp &&
      data.defaultDownPaymentBp <= data.maxDownPaymentBp,
    {
      message: "Die Standardanzahlung muss zwischen Mindest- und Höchstanzahlung liegen.",
      path: ["defaultDownPaymentBp"],
    },
  )
  .refine((data) => data.minBalloonBp <= data.maxBalloonBp, {
    message: "Die Mindest-Schlussrate darf nicht über der Höchst-Schlussrate liegen.",
    path: ["minBalloonBp"],
  })
  .refine(
    (data) =>
      data.defaultBalloonBp >= data.minBalloonBp &&
      data.defaultBalloonBp <= data.maxBalloonBp,
    {
      message: "Die Standard-Schlussrate muss zwischen Mindest- und Höchstwert liegen.",
      path: ["defaultBalloonBp"],
    },
  );

export type FinanceConfigFormValues = z.input<typeof financeConfigSchema>;
export type FinanceConfigUpdate = z.output<typeof financeConfigSchema>;

// --- Finanzierungspartner --------------------------------------------------

export const financeProviderSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(2, "Der Name darf nicht leer sein.")
    .max(120, "Der Name ist zu lang."),
  description: z
    .string()
    .trim()
    .max(1000, "Die Beschreibung ist zu lang.")
    .transform((value) => (value === "" ? null : value)),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === "" || /^https:\/\/.+/.test(value),
      "Bitte eine vollständige Adresse angeben, die mit https:// beginnt.",
    )
    .transform((value) => (value === "" ? null : value)),
  websiteUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === "" || /^https:\/\/.+/.test(value),
      "Bitte eine vollständige Adresse angeben, die mit https:// beginnt.",
    )
    .transform((value) => (value === "" ? null : value)),
  interestRateBp: z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .refine(
      (value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value),
      "Bitte als Zahl angeben, z. B. 5,99.",
    )
    .transform((value) => (value === "" ? null : Math.round(Number(value) * 100)))
    .refine(
      (value) => value === null || value <= 3000,
      "Der Zinssatz darf höchstens 30 % betragen.",
    ),
  active: z.boolean(),
});

export const financeProvidersSchema = z.object({
  providers: z.array(financeProviderSchema).max(20),
});

export type FinanceProvidersFormValues = z.input<typeof financeProvidersSchema>;
export type FinanceProvidersUpdate = z.output<typeof financeProvidersSchema>;
