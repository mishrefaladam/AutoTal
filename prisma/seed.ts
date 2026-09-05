import "dotenv/config";

import bcrypt from "bcryptjs";

import { COMPANY_ID } from "@/modules/company/repository";
import { FINANCE_CONFIG_ID } from "@/modules/financing/repository";
import { FINANCE_DISCLAIMER } from "@/modules/financing/calculator";
import { MANUAL_SOURCE } from "@/modules/vehicles/constants";
import { buildVehicleSlug } from "@/modules/vehicles/slug";
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
// Firmenname, Anschrift, Telefonnummer und Öffnungszeiten sind die echten
// Daten von AutoTal e.U. Noch offene Angaben sind unten mit
// TODO(firmendaten) markiert und bewusst leer gelassen statt geraten –
// Impressumsangaben sind nach § 5 ECG und § 25 MedienG verpflichtend und
// müssen stimmen. Nachtragen am besten unter /admin/unternehmen.
// ---------------------------------------------------------------------------

const COMPANY_DATA = {
  // Schreibweise exakt wie im Firmenbuch/GISA – dort "Autotal e.U."
  // mit kleinem t. Die Marke schreibt sich "AutoTal", der
  // Firmenwortlaut im Impressum muss aber dem Register folgen.
  legalName: "Autotal e.U.",
  displayName: "AutoTal",
  tagline: "Geprüfte Gebrauchtwagen nahe Wien",
  aboutText:
    "AutoTal ist ein inhabergeführtes Autohaus in Strasshof an der Nordbahn. " +
    "Wir kaufen, prüfen und verkaufen Gebrauchtwagen – jedes Fahrzeug wird " +
    "vor der Übergabe technisch durchgesehen und kommt mit gültiger " +
    "§57a-Begutachtung. Was wir über ein Auto wissen, sagen wir Ihnen. " +
    "Auch das, was nicht im Prospekt steht.",

  street: "Hauptstraße 147",
  postalCode: "2231",
  city: "Strasshof an der Nordbahn",
  country: "Österreich",

  // International notiert (+43) statt 0043 – gleiche Nummer, aber die für
  // tel:-Links und ausländische Anrufer korrekte Schreibweise.
  phone: "+43 664 3833120",

  // Bestätigt: dieselbe Nummer wie oben. Format für wa.me: nur Ziffern
  // inklusive Ländervorwahl, ohne + und ohne Leerzeichen.
  whatsappNumber: "436643833120",

  email: "autotal.office@gmail.com",

  // Aus dem GISA-Auszug vom 21.08.2026.
  commercialRegisterNumber: "FN 648226z",
  businessPurpose: "Handelsgewerbe mit Ausnahme der reglementierten Handelsgewerbe",
  supervisoryAuthority: "Bezirkshauptmannschaft Gänserndorf",
  gisaNumber: "38118555",

  // TODO(firmendaten): Beide stehen NICHT im Gewerbeschein.
  //   vatId                   – kommt vom Finanzamt. Ein e.U. unterhalb der
  //                             Kleinunternehmergrenze hat unter Umständen
  //                             gar keine UID.
  //   commercialRegisterCourt – steht im Firmenbuchauszug. Für den Bezirk
  //                             Gänserndorf ist es voraussichtlich das
  //                             Landesgericht Korneuburg; das ist aber zu
  //                             bestätigen und wird deshalb nicht geraten.
  vatId: null as string | null,
  commercialRegisterCourt: null as string | null,

  // Bei einem e.U. ist der Inhaber zugleich das Unternehmen.
  contactPersonName: "Erolcan Avcı",
  contactPersonRole: "Inhaber",
  contactPersonEmail: null as string | null,
  contactPersonPhone: null as string | null,

  latitude: null as number | null,
  longitude: null as number | null,
};

/**
 * Öffnungszeiten Verkauf – durchgehend, ohne Mittagspause.
 * Das Datenmodell erlaubt zwei Zeitfenster pro Tag; hier wird nur das erste
 * genutzt (position 0).
 */
const OPENING_HOURS = [
  { weekday: 1, opensAt: "08:30", closesAt: "18:00", closed: false, position: 0 },
  { weekday: 2, opensAt: "08:30", closesAt: "18:00", closed: false, position: 0 },
  { weekday: 3, opensAt: "08:30", closesAt: "18:00", closed: false, position: 0 },
  { weekday: 4, opensAt: "08:30", closesAt: "18:00", closed: false, position: 0 },
  { weekday: 5, opensAt: "08:00", closesAt: "16:00", closed: false, position: 0 },
  { weekday: 6, opensAt: "09:00", closesAt: "12:00", closed: false, position: 0 },
  // Sonntag war in den Angaben nicht genannt – daher geschlossen.
  { weekday: 7, opensAt: null, closesAt: null, closed: true, position: 0 },
];

// TODO(firmendaten): Social-Media-Profile eintragen, sobald bekannt.
// Bewusst leer statt auf instagram.com/facebook.com allgemein zu verlinken –
// ein Link, der nicht zum Autohaus führt, ist schlechter als keiner.
const SOCIAL_LINKS: { platform: string; url: string; position: number }[] = [];

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
      ...COMPANY_DATA,
      openingHours: { create: OPENING_HOURS },
      socialLinks: { create: SOCIAL_LINKS },
    },
  });

  console.log(
    "✓ Unternehmensdaten angelegt. Offen: E-Mail-Adresse, UID und " +
      "Firmenbuchnummer – bitte unter /admin/unternehmen ergänzen.",
  );
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

/**
 * Beispielfahrzeuge für die Entwicklung.
 *
 * Seit der Umstellung auf die eingebettete willhaben-Fahrzeugbörse speisen
 * Fahrzeuge in der Datenbank NICHT mehr den öffentlichen Bestand – der kommt
 * vollständig aus dem Widget. Sie dienen ausschließlich als Datenbasis für die
 * Social-Media-Funktion (Fahrzeug auswählen, Caption generieren).
 *
 * Deshalb werden sie nur außerhalb der Produktion angelegt. Im Livebetrieb
 * pflegt das Autohaus die Fahrzeuge, über die es posten möchte, selbst unter
 * /admin/fahrzeuge.
 */
const DEV_VEHICLES = [
  {
    make: "Volkswagen",
    model: "Golf",
    variant: "2.0 TDI Life DSG",
    priceCents: 2_290_000,
    mileageKm: 78_500,
    firstRegistration: new Date("2021-03-15"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "SEDAN",
    powerKw: 110,
    color: "Urangrau Metallic",
    description:
      "Gepflegter Golf aus erster Hand mit lückenlos geführtem Serviceheft.",
    features: ["Navigationssystem", "Rückfahrkamera", "Sitzheizung vorne"],
  },
  {
    make: "BMW",
    model: "320d",
    variant: "xDrive Touring M Sport",
    priceCents: 3_490_000,
    mileageKm: 96_200,
    firstRegistration: new Date("2020-06-08"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "ESTATE",
    powerKw: 140,
    color: "Saphirschwarz Metallic",
    description:
      "Vollausgestatteter 3er Touring mit xDrive-Allradantrieb und M Sportpaket.",
    features: ["xDrive Allradantrieb", "Head-up Display", "Panorama-Glasdach"],
  },
  {
    make: "Skoda",
    model: "Octavia Combi",
    variant: "1.5 TSI Ambition",
    priceCents: 2_480_000,
    mileageKm: 42_100,
    firstRegistration: new Date("2022-04-11"),
    fuel: "PETROL",
    transmission: "MANUAL",
    bodyType: "ESTATE",
    powerKw: 110,
    color: "Energieblau Metallic",
    description:
      "Der Octavia Combi bleibt der Maßstab beim Kofferraum – erst 42.000 km gelaufen.",
    features: ["Voll-LED-Scheinwerfer", "Klimaautomatik", "Dachreling"],
  },
] as const;

async function seedDevelopmentVehicles() {
  if (process.env.NODE_ENV === "production") {
    console.log(
      "→ Produktion: keine Beispielfahrzeuge. Fahrzeuge für Social Media " +
        "werden unter /admin/fahrzeuge gepflegt.",
    );
    return;
  }

  const existing = await prisma.vehicle.count();

  if (existing > 0) {
    console.log(`→ Es sind bereits ${existing} Fahrzeuge erfasst.`);
    return;
  }

  for (const [index, vehicle] of DEV_VEHICLES.entries()) {
    const externalId = `dev-${String(index + 1).padStart(3, "0")}`;

    await prisma.vehicle.create({
      data: {
        ...vehicle,
        features: [...vehicle.features],
        externalSource: MANUAL_SOURCE,
        externalId,
        slug: buildVehicleSlug({ ...vehicle, externalId }),
      },
    });
  }

  console.log(
    `✓ ${DEV_VEHICLES.length} Beispielfahrzeuge angelegt (nur Entwicklung, ` +
      "Datenbasis für Social Media – ohne Bilder).",
  );
}

async function main() {
  console.log("Seed startet …\n");

  await seedCompany();
  await seedFinance();
  await seedAdminUser();
  await seedDevelopmentVehicles();

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
