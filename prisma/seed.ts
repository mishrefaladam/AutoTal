import "dotenv/config";

import bcrypt from "bcryptjs";

import { COMPANY_ID } from "@/modules/company/repository";
import { FINANCE_CONFIG_ID } from "@/modules/financing/repository";
import { FINANCE_DISCLAIMER } from "@/modules/financing/calculator";
import { syncVehicles } from "@/modules/vehicles/sync";
import { prisma } from "@/lib/prisma";

/**
 * Grunddatenbestand für Entwicklung und Erstinbetriebnahme.
 *
 * Idempotent: Der Seed kann beliebig oft laufen. Bereits gepflegte
 * Unternehmensdaten werden NICHT überschrieben – sonst würde ein Deployment
 * die im Admin eingetragenen echten Daten wieder auf Platzhalter zurücksetzen.
 *
 * Ausführen mit:  npm run db:seed
 */

// ---------------------------------------------------------------------------
// TODO(echtdaten): Alle mit [PLATZHALTER] markierten Werte durch die echten
// Firmendaten ersetzen – entweder hier oder komfortabler unter
// /admin/unternehmen. Bis dahin darf die Website nicht öffentlich gehen:
// Impressumsangaben sind in Österreich nach § 5 ECG und § 25 MedienG
// verpflichtend und müssen korrekt sein.
// ---------------------------------------------------------------------------

const COMPANY_PLACEHOLDER = {
  legalName: "AutoTal Handels GmbH", // [PLATZHALTER]
  displayName: "AutoTal",
  tagline: "Geprüfte Gebrauchtwagen aus Oberösterreich",
  aboutText:
    "AutoTal ist ein familiengeführtes Autohaus. Wir kaufen, prüfen und " +
    "verkaufen Gebrauchtwagen – jedes Fahrzeug wird vor der Übergabe " +
    "technisch durchgesehen und kommt mit gültiger §57a-Begutachtung. " +
    "Was wir über ein Auto wissen, sagen wir Ihnen. Auch das, was nicht " +
    "im Prospekt steht.",

  street: "Bahnhofstraße 12", // [PLATZHALTER]
  postalCode: "4600", // [PLATZHALTER]
  city: "Wels", // [PLATZHALTER]
  country: "Österreich",

  phone: "+43 7242 123456", // [PLATZHALTER]
  whatsappNumber: "436641234567", // [PLATZHALTER] nur Ziffern inkl. Ländervorwahl
  email: "office@autotal.at", // [PLATZHALTER]

  vatId: "ATU12345678", // [PLATZHALTER]
  commercialRegisterNumber: "FN 123456a", // [PLATZHALTER]
  commercialRegisterCourt: "Landesgericht Wels", // [PLATZHALTER]

  contactPersonName: "Max Mustermann", // [PLATZHALTER]
  contactPersonRole: "Verkaufsleitung",
  contactPersonEmail: "verkauf@autotal.at", // [PLATZHALTER]
  contactPersonPhone: "+43 7242 123456", // [PLATZHALTER]

  latitude: 48.1575, // [PLATZHALTER] Koordinaten des Standorts
  longitude: 14.0289, // [PLATZHALTER]
};

/** Mo–Fr mit Mittagspause, Samstag vormittags, Sonntag geschlossen. */
const OPENING_HOURS = [
  ...[1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, opensAt: "08:00", closesAt: "12:00", closed: false, position: 0 },
    { weekday, opensAt: "13:00", closesAt: "18:00", closed: false, position: 1 },
  ]),
  { weekday: 6, opensAt: "09:00", closesAt: "13:00", closed: false, position: 0 },
  { weekday: 7, opensAt: null, closesAt: null, closed: true, position: 0 },
];

const SOCIAL_LINKS = [
  { platform: "instagram", url: "https://www.instagram.com/", position: 0 }, // [PLATZHALTER]
  { platform: "facebook", url: "https://www.facebook.com/", position: 1 }, // [PLATZHALTER]
];

// TODO(echtdaten): Durch die tatsächlichen Finanzierungspartner ersetzen.
// Bewusst KEINE echten Banknamen vorbelegt – sonst behauptet die Website eine
// Geschäftsbeziehung, die (noch) nicht besteht.
const FINANCE_PROVIDERS = [
  {
    name: "Finanzierungspartner 1", // [PLATZHALTER]
    description:
      "Klassische Ratenfinanzierung mit fixer Rate über die gesamte Laufzeit. " +
      "Antrag direkt bei uns im Haus, Zusage meist innerhalb eines Werktags.",
    interestRateBp: 599,
    position: 0,
  },
  {
    name: "Finanzierungspartner 2", // [PLATZHALTER]
    description:
      "Ballonfinanzierung mit niedriger Monatsrate und Schlussrate am " +
      "Laufzeitende. Am Ende wahlweise ablösen, weiterfinanzieren oder das " +
      "Fahrzeug zurückgeben.",
    interestRateBp: 649,
    position: 1,
  },
  {
    name: "Finanzierungspartner 3", // [PLATZHALTER]
    description:
      "Leasing für Gewerbekunden mit vorsteuerabzugsberechtigter " +
      "Rechnungslegung und flexibler Restwertgestaltung.",
    interestRateBp: 549,
    position: 2,
  },
];

async function seedCompany() {
  const existing = await prisma.companySettings.findUnique({
    where: { id: COMPANY_ID },
  });

  if (existing) {
    console.log("→ Unternehmensdaten bestehen bereits, werden nicht verändert.");
    return;
  }

  await prisma.companySettings.create({
    data: {
      id: COMPANY_ID,
      ...COMPANY_PLACEHOLDER,
      openingHours: { create: OPENING_HOURS },
      socialLinks: { create: SOCIAL_LINKS },
    },
  });

  console.log("✓ Unternehmensdaten angelegt (Platzhalter – bitte im Admin ersetzen).");
}

async function seedFinance() {
  const existingConfig = await prisma.financeConfig.findUnique({
    where: { id: FINANCE_CONFIG_ID },
  });

  if (!existingConfig) {
    await prisma.financeConfig.create({
      data: { id: FINANCE_CONFIG_ID, disclaimer: FINANCE_DISCLAIMER },
    });
    console.log("✓ Finanzierungskonfiguration angelegt.");
  } else {
    console.log("→ Finanzierungskonfiguration besteht bereits.");
  }

  const providerCount = await prisma.financeProvider.count();

  if (providerCount === 0) {
    await prisma.financeProvider.createMany({ data: FINANCE_PROVIDERS });
    console.log(
      `✓ ${FINANCE_PROVIDERS.length} Finanzierungspartner angelegt (Platzhalter).`,
    );
  } else {
    console.log("→ Finanzierungspartner bestehen bereits.");
  }
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "→ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD nicht gesetzt – kein Admin angelegt.",
    );
    return;
  }

  if (password.length < 10) {
    throw new Error(
      "SEED_ADMIN_PASSWORD muss mindestens 10 Zeichen haben. " +
        "Der Admin-Zugang schützt Unternehmensdaten und Instagram-Tokens.",
    );
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    console.log(`→ Admin-Benutzer ${email} besteht bereits.`);
    return;
  }

  await prisma.adminUser.create({
    data: {
      email,
      name: "Administrator",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
  });

  console.log(`✓ Admin-Benutzer ${email} angelegt – Passwort nach dem ersten Login ändern.`);
}

async function seedVehicles() {
  const result = await syncVehicles({ triggeredBy: "seed" });

  if (result.status === "FAILED") {
    console.warn(`⚠ Fahrzeug-Sync fehlgeschlagen: ${result.errorMessage}`);
    return;
  }

  console.log(
    `✓ Fahrzeuge synchronisiert (${result.source}): ` +
      `${result.vehiclesFound} gefunden, ${result.vehiclesCreated} neu, ` +
      `${result.vehiclesUpdated} aktualisiert, ` +
      `${result.vehiclesDeactivated} deaktiviert.`,
  );
}

async function main() {
  console.log("Seed startet …\n");

  await seedCompany();
  await seedFinance();
  await seedAdminUser();
  await seedVehicles();

  console.log("\nSeed abgeschlossen.");
}

main()
  .catch((error) => {
    console.error("Seed fehlgeschlagen:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
