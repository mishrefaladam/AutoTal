import type { ProviderVehicle } from "../types";

/**
 * Realistische Testfahrzeuge für die Entwicklung ohne Anbieterzugang (US-26).
 *
 * Die Bilder sind generische Automobil-Aufnahmen von Unsplash und zeigen
 * NICHT das jeweils beschriebene Fahrzeug. Für den Echtbetrieb liefert der
 * angebundene Provider die tatsächlichen Fotos.
 *
 * Der Datensatz enthält bewusst ein verkauftes Fahrzeug (`status: "sold"`),
 * damit sich das Deaktivieren entfernter Fahrzeuge (US-07) testen lässt.
 */

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1067;

/** Geprüfte Unsplash-Foto-IDs. */
const IMAGE_POOL = [
  "1552519507-da3b142c6e3d",
  "1503376780353-7e6692767b70",
  "1555215695-3004980ad54e",
  "1553440569-bcc63803a83d",
  "1541899481282-d53bffe3c35d",
  "1494976388531-d1058494cdd8",
  "1583121274602-3e2820c69888",
  "1568605117036-5fe5e7bab0b7",
  "1502877338535-766e1452684a",
  "1605559424843-9e4c228bf1c2",
  "1541443131876-44b03de101c5",
  "1544636331-e26879cd4d9b",
  "1580273916550-e323be2ae537",
  "1616788494707-ec28f08d05a1",
  "1617469767053-d3b523a0b982",
  "1549317661-bd32c8ce0db2",
  "1600712242805-5f78671b24da",
  "1606664515524-ed2f786a0bd6",
  "1519641471654-76ce0107ad1b",
  "1533473359331-0135ef1b58bf",
  "1607603750909-408e193868c7",
  "1626668893632-6f3a4466d22f",
  "1621007947382-bb3c3994e3fb",
  "1610768764270-790fbec18178",
  "1593941707882-a5bba14938c7",
  "1542362567-b07e54358753",
  "1550355291-bbee04a92027",
  "1536700503339-1e4b06520771",
];

function imageUrl(photoId: string): string {
  return (
    `https://images.unsplash.com/photo-${photoId}` +
    `?auto=format&fit=crop&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&q=80`
  );
}

/** Vergibt vier Bilder pro Fahrzeug, rotierend über den Pool. */
function imagesFor(index: number, title: string) {
  return Array.from({ length: 4 }, (_, offset) => {
    const photoId = IMAGE_POOL[(index * 3 + offset) % IMAGE_POOL.length];
    return {
      url: imageUrl(photoId),
      alt: `${title} – Ansicht ${offset + 1}`,
      position: offset,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      externalId: `${photoId}-${offset}`,
    };
  });
}

type MockSeed = Omit<ProviderVehicle, "images" | "externalId"> & {
  externalId: string;
};

const SEEDS: MockSeed[] = [
  {
    externalId: "MOCK-1001",
    status: "available",
    make: "Volkswagen",
    model: "Golf",
    variant: "2.0 TDI Life DSG",
    priceCents: 2_290_000,
    mileageKm: 78_500,
    firstRegistration: new Date("2021-03-15"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "SEDAN",
    condition: "USED",
    powerKw: 110,
    displacementCcm: 1968,
    color: "Urangrau Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2027-03-31"),
    description:
      "Gepflegter Golf aus erster Hand mit lückenlos geführtem Serviceheft. " +
      "Der 2.0 TDI überzeugt mit niedrigem Verbrauch auf der Langstrecke und " +
      "läuft dank DSG spürbar entspannter als die Handschaltung. Winterreifen " +
      "auf Alufelgen sind im Preis enthalten.",
    features: [
      "Navigationssystem Discover Media",
      "Adaptiver Tempomat (ACC)",
      "Rückfahrkamera",
      "LED-Scheinwerfer",
      "Sitzheizung vorne",
      "Klimaautomatik 2-Zonen",
      "Apple CarPlay / Android Auto",
      "Parksensoren vorne und hinten",
      "Winterreifen auf Alufelgen",
    ],
  },
  {
    externalId: "MOCK-1002",
    status: "available",
    make: "BMW",
    model: "320d",
    variant: "xDrive Touring M Sport",
    priceCents: 3_490_000,
    mileageKm: 96_200,
    firstRegistration: new Date("2020-06-08"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 140,
    displacementCcm: 1995,
    color: "Saphirschwarz Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 2,
    inspectionValidUntil: new Date("2026-11-30"),
    description:
      "Vollausgestatteter 3er Touring mit xDrive-Allradantrieb und M " +
      "Sportpaket. Scheckheftgepflegt bei BMW, letzter Service bei 92.000 km " +
      "inklusive neuer Bremsscheiben rundum. Das große Ladeabteil macht ihn " +
      "zum souveränen Begleiter für Familie und Beruf.",
    features: [
      "xDrive Allradantrieb",
      "M Sportpaket",
      "Live Cockpit Professional",
      "Head-up Display",
      "Harman/Kardon Soundsystem",
      "Panorama-Glasdach",
      "Elektrische Heckklappe",
      "Lederausstattung Vernasca",
      "LED-Scheinwerfer adaptiv",
      "Driving Assistant",
      "Anhängerkupplung schwenkbar",
    ],
  },
  {
    externalId: "MOCK-1003",
    status: "available",
    make: "Audi",
    model: "A4 Avant",
    variant: "40 TDI quattro S line S tronic",
    priceCents: 3_850_000,
    mileageKm: 68_400,
    firstRegistration: new Date("2021-09-22"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 150,
    displacementCcm: 1968,
    color: "Gletscherweiß Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2027-09-30"),
    description:
      "Sehr gepflegter A4 Avant mit quattro-Antrieb und S line Exterieur. " +
      "Erstbesitz, durchgehend bei Audi gewartet und unfallfrei. Die " +
      "Matrix-LED-Scheinwerfer und das Virtual Cockpit Plus machen auch lange " +
      "Nachtfahrten angenehm.",
    features: [
      "quattro Allradantrieb",
      "S line Exterieurpaket",
      "Matrix LED-Scheinwerfer",
      "Audi Virtual Cockpit Plus",
      "MMI Navigation plus",
      "Sportsitze in Leder/Alcantara",
      "Dreizonen-Klimaautomatik",
      "Elektrische Heckklappe",
      "Parklenkassistent",
      "Audi Sound System",
    ],
  },
  {
    externalId: "MOCK-1004",
    status: "available",
    make: "Škoda",
    model: "Octavia Combi",
    variant: "1.5 TSI Ambition",
    priceCents: 2_480_000,
    mileageKm: 42_100,
    firstRegistration: new Date("2022-04-11"),
    fuel: "PETROL",
    transmission: "MANUAL",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 110,
    displacementCcm: 1498,
    color: "Energieblau Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2028-04-30"),
    description:
      "Der Octavia Combi bleibt der Maßstab beim Kofferraum – 640 Liter bei " +
      "aufgestellten Rücksitzen. Dieses Exemplar ist erst 42.000 km gelaufen, " +
      "unfallfrei und kommt mit den bekannten Simply-Clever-Details.",
    features: [
      "Navigationssystem Amundsen",
      "Voll-LED-Scheinwerfer",
      "Tempomat",
      "Klimaautomatik Climatronic",
      "Parksensoren hinten",
      "Sitzheizung vorne",
      "Simply Clever Paket",
      "Smartlink (CarPlay / Android Auto)",
      "Dachreling",
    ],
  },
  {
    externalId: "MOCK-1005",
    status: "available",
    make: "Tesla",
    model: "Model 3",
    variant: "Long Range AWD",
    priceCents: 3_390_000,
    mileageKm: 51_300,
    firstRegistration: new Date("2022-01-27"),
    fuel: "ELECTRIC",
    transmission: "AUTOMATIC",
    bodyType: "SEDAN",
    condition: "USED",
    powerKw: 324,
    color: "Pearl White Multi-Coat",
    doors: 4,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2028-01-31"),
    description:
      "Model 3 Long Range mit Allradantrieb und rund 580 km WLTP-Reichweite. " +
      "Der Akku wurde beim letzten Service geprüft, die Kapazität liegt bei " +
      "über 93 Prozent. Autopilot ist ab Werk enthalten, das Fahrzeug erhält " +
      "weiterhin Software-Updates over the air.",
    features: [
      "Allradantrieb (Dual Motor)",
      "Autopilot",
      "Panorama-Glasdach",
      "Wärmepumpe",
      "Premium-Innenraum mit 14 Lautsprechern",
      "Sitzheizung vorne und hinten",
      "Navigation mit Supercharger-Routing",
      "Wallbox-fähig (11 kW)",
      "Mobiler Ladeziegel inkludiert",
    ],
  },
  {
    externalId: "MOCK-1006",
    status: "available",
    make: "Mercedes-Benz",
    model: "C 220 d",
    variant: "T-Modell Avantgarde 9G-Tronic",
    priceCents: 3_140_000,
    mileageKm: 112_800,
    firstRegistration: new Date("2020-02-19"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 143,
    displacementCcm: 1950,
    color: "Iridiumsilber Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 2,
    inspectionValidUntil: new Date("2026-08-31"),
    description:
      "Souveränes T-Modell mit der laufruhigen 9G-Tronic. Die Laufleistung " +
      "stammt überwiegend von Autobahnkilometern, der Wagen wurde durchgehend " +
      "in der Mercedes-Werkstatt betreut. Neue Sommerreifen wurden bei " +
      "110.000 km montiert.",
    features: [
      "9G-Tronic Automatik",
      "LED High Performance Scheinwerfer",
      "Navigation Garmin MAP PILOT",
      "Rückfahrkamera",
      "Sitzheizung vorne",
      "Elektrische Heckklappe EASY-PACK",
      "Totwinkel-Assistent",
      "Ambientebeleuchtung",
      "Anhängerkupplung abnehmbar",
    ],
  },
  {
    externalId: "MOCK-1007",
    status: "available",
    make: "Volkswagen",
    model: "T-Roc",
    variant: "1.5 TSI Style DSG",
    priceCents: 2_890_000,
    mileageKm: 35_600,
    firstRegistration: new Date("2022-07-05"),
    fuel: "PETROL",
    transmission: "AUTOMATIC",
    bodyType: "SUV",
    condition: "USED",
    powerKw: 110,
    displacementCcm: 1498,
    color: "Flash Rot",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2028-07-31"),
    description:
      "Kompaktes SUV mit erhöhter Sitzposition und angenehm sparsamem " +
      "1.5 TSI mit Zylinderabschaltung. Nur 35.600 km, Nichtraucherfahrzeug " +
      "und unfallfrei. Ideal als wendiges Alltagsauto mit SUV-Übersicht.",
    features: [
      "Digital Cockpit",
      "Navigationssystem Discover Media",
      "LED-Scheinwerfer",
      "Adaptiver Tempomat (ACC)",
      "Rückfahrkamera",
      "Klimaautomatik",
      "Sitzheizung vorne",
      "App-Connect",
      "17-Zoll Leichtmetallfelgen",
    ],
  },
  {
    externalId: "MOCK-1008",
    status: "available",
    make: "Hyundai",
    model: "Tucson",
    variant: "1.6 T-GDI Plug-in-Hybrid 4WD Prestige Line",
    priceCents: 3_670_000,
    mileageKm: 24_900,
    firstRegistration: new Date("2023-05-16"),
    fuel: "PLUGIN_HYBRID",
    transmission: "AUTOMATIC",
    bodyType: "SUV",
    condition: "USED",
    powerKw: 195,
    displacementCcm: 1598,
    color: "Dark Knight Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2029-05-31"),
    description:
      "Plug-in-Hybrid mit rund 60 km rein elektrischer Reichweite – für den " +
      "Arbeitsweg reicht das meist ohne einen Tropfen Benzin. Noch bis " +
      "Mai 2028 Herstellergarantie. Prestige Line mit nahezu voller " +
      "Ausstattung.",
    features: [
      "Allradantrieb HTRAC",
      "Rein elektrische Reichweite ca. 60 km",
      "Panorama-Glasdach",
      "Lederausstattung",
      "Belüftete Vordersitze",
      "360°-Kamera",
      "Krell Premium Soundsystem",
      "Head-up Display",
      "Elektrische Heckklappe",
      "Kabelloses Laden für Smartphones",
      "Herstellergarantie bis 05/2028",
    ],
  },
  {
    externalId: "MOCK-1009",
    status: "available",
    make: "Ford",
    model: "Focus Turnier",
    variant: "1.0 EcoBoost Titanium",
    priceCents: 1_890_000,
    mileageKm: 61_200,
    firstRegistration: new Date("2021-05-03"),
    fuel: "PETROL",
    transmission: "MANUAL",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 92,
    displacementCcm: 999,
    color: "Moondust Silber Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 2,
    inspectionValidUntil: new Date("2027-05-31"),
    description:
      "Praktischer Kombi mit dem sparsamen 1.0 EcoBoost – im Alltag sind " +
      "rund 5,5 Liter realistisch. Titanium-Ausstattung mit Navigation und " +
      "Sitzheizung. Ein ehrliches Auto zum fairen Preis.",
    features: [
      "Navigationssystem SYNC 3",
      "Sitzheizung vorne",
      "Lenkradheizung",
      "Klimaautomatik",
      "Parksensoren hinten",
      "Tempomat mit Geschwindigkeitsbegrenzer",
      "Spurhalteassistent",
      "Dachreling",
    ],
  },
  {
    externalId: "MOCK-1010",
    status: "available",
    make: "Renault",
    model: "Clio",
    variant: "TCe 90 Intens",
    priceCents: 1_590_000,
    mileageKm: 29_400,
    firstRegistration: new Date("2022-09-14"),
    fuel: "PETROL",
    transmission: "MANUAL",
    bodyType: "SMALL_CAR",
    condition: "USED",
    powerKw: 67,
    displacementCcm: 999,
    color: "Blau Iron Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2028-09-30"),
    description:
      "Sparsamer und wendiger Kleinwagen mit erst 29.400 km. Der Clio ist " +
      "innen deutlich hochwertiger verarbeitet, als man es in dieser Klasse " +
      "erwartet. Perfekt als Stadt- oder Zweitwagen.",
    features: [
      "EASY LINK Navigation 7 Zoll",
      "Voll-LED-Scheinwerfer",
      "Klimaautomatik",
      "Rückfahrkamera",
      "Tempomat",
      "Apple CarPlay / Android Auto",
      "Regen- und Lichtsensor",
      "16-Zoll Leichtmetallfelgen",
    ],
  },
  {
    externalId: "MOCK-1011",
    status: "available",
    make: "Volkswagen",
    model: "ID.4",
    variant: "Pro Performance 77 kWh",
    priceCents: 3_190_000,
    mileageKm: 38_700,
    firstRegistration: new Date("2022-03-08"),
    fuel: "ELECTRIC",
    transmission: "AUTOMATIC",
    bodyType: "SUV",
    condition: "USED",
    powerKw: 150,
    color: "Moonstone Grey",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2028-03-31"),
    description:
      "Elektro-SUV mit 77-kWh-Akku und rund 520 km WLTP-Reichweite. Lädt mit " +
      "bis zu 135 kW, damit ist der Akku unterwegs in etwa 30 Minuten wieder " +
      "auf 80 Prozent. Akkuzertifikat mit 94 Prozent Restkapazität liegt vor.",
    features: [
      "Wärmepumpe",
      "Navigationssystem Discover Pro",
      "Matrix LED-Scheinwerfer IQ.LIGHT",
      "Adaptiver Tempomat (ACC)",
      "Rückfahrkamera",
      "Elektrische Heckklappe",
      "Wärmepumpe für höhere Winterreichweite",
      "DC-Schnellladen bis 135 kW",
      "Akkuzertifikat 94 % vorhanden",
    ],
  },
  {
    externalId: "MOCK-1012",
    status: "available",
    make: "Mazda",
    model: "CX-5",
    variant: "2.2 CD150 AWD Revolution Aut.",
    priceCents: 2_940_000,
    mileageKm: 74_300,
    firstRegistration: new Date("2021-01-21"),
    fuel: "DIESEL",
    transmission: "AUTOMATIC",
    bodyType: "SUV",
    condition: "USED",
    powerKw: 110,
    displacementCcm: 2191,
    color: "Soul Red Crystal Metallic",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    inspectionValidUntil: new Date("2027-01-31"),
    description:
      "Der CX-5 in der auffälligen Lackierung Soul Red Crystal, mit " +
      "Allradantrieb und Automatik. Mazda-typisch sehr solide verarbeitet " +
      "und komplett scheckheftgepflegt. Anhängelast gebremst 2.000 kg.",
    features: [
      "Allradantrieb i-ACTIV AWD",
      "Bose Premium Soundsystem",
      "Lederausstattung schwarz",
      "Head-up Display",
      "360°-Kamera",
      "Elektrische Heckklappe",
      "Sitzheizung vorne und hinten",
      "Adaptiver Tempomat",
      "Anhängerkupplung",
    ],
  },
  {
    externalId: "MOCK-1013",
    status: "available",
    make: "Volkswagen",
    model: "Transporter T6.1",
    variant: "Kastenwagen 2.0 TDI",
    priceCents: 2_790_000,
    vatDeductible: true,
    mileageKm: 98_500,
    firstRegistration: new Date("2021-06-30"),
    fuel: "DIESEL",
    transmission: "MANUAL",
    bodyType: "TRANSPORTER",
    condition: "USED",
    powerKw: 110,
    displacementCcm: 1968,
    color: "Candyweiß",
    doors: 4,
    seats: 3,
    previousOwners: 1,
    inspectionValidUntil: new Date("2027-06-30"),
    description:
      "Gewerblich genutzter T6.1 Kastenwagen mit langem Radstand, " +
      "durchgehend gewartet. Preis netto zuzüglich 20 % USt – " +
      "vorsteuerabzugsberechtigt. Holzboden und Trennwand sind verbaut.",
    features: [
      "Langer Radstand",
      "Holzboden und Seitenverkleidung",
      "Trennwand mit Fenster",
      "Klimaanlage",
      "Parksensoren hinten",
      "Tempomat",
      "Bluetooth-Freisprecheinrichtung",
      "Anhängerkupplung",
    ],
  },
  {
    // Bereits verkauft – der Sync deaktiviert dieses Fahrzeug (US-07).
    externalId: "MOCK-1014",
    status: "sold",
    make: "Opel",
    model: "Astra Sports Tourer",
    variant: "1.2 Turbo Elegance",
    priceCents: 2_190_000,
    mileageKm: 47_800,
    firstRegistration: new Date("2022-02-10"),
    fuel: "PETROL",
    transmission: "MANUAL",
    bodyType: "ESTATE",
    condition: "USED",
    powerKw: 96,
    displacementCcm: 1199,
    color: "Kobaltblau",
    doors: 5,
    seats: 5,
    previousOwners: 1,
    description:
      "Dieses Fahrzeug wurde bereits verkauft und dient im Mock-Datensatz " +
      "als Beispiel für ein aus dem Bestand entferntes Inserat.",
    features: ["Navigationssystem", "LED-Scheinwerfer", "Sitzheizung vorne"],
  },
];

export const MOCK_VEHICLES: ProviderVehicle[] = SEEDS.map((seed, index) => ({
  ...seed,
  images: imagesFor(
    index,
    [seed.make, seed.model, seed.variant].filter(Boolean).join(" "),
  ),
}));
