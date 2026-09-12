export type EquipmentCategory = { name: string; options: readonly string[] };

/** Suggestions only: nothing is selected automatically for a vehicle. */
export const EQUIPMENT_CATALOG: readonly EquipmentCategory[] = [
  { name: "Komfort", options: [
    "Klimaanlage", "Klimaautomatik", "2-Zonen-Klimaautomatik", "3-Zonen-Klimaautomatik",
    "4-Zonen-Klimaautomatik", "Sitzheizung vorne", "Sitzheizung hinten", "Sitzbelüftung",
    "Elektrische Sitze", "Memory-Sitze", "Lenkradheizung", "Standheizung",
    "Elektrische Heckklappe", "Keyless Go", "Keyless Entry", "Soft-Close-Türen",
    "Massagesitze", "Elektrische Fensterheber vorne", "Elektrische Fensterheber hinten",
    "Regensensor", "Lichtsensor", "Zentralverriegelung", "Servolenkung",
    "Elektrische Parkbremse", "Auto-Hold", "Beheizbare Frontscheibe",
    "Beheizbare Außenspiegel", "Elektrisch verstellbare Außenspiegel",
    "Innenspiegel automatisch abblendend", "Außenspiegel automatisch abblendend",
    "Funkfernbedienung", "Berganfahrhilfe", "Bergabfahrhilfe", "Start-Stopp-System",
    "Elektrisch verstellbares Lenkrad", "Fernstart der Klimatisierung",
  ] },
  { name: "Infotainment", options: [
    "Navigationssystem", "Online-Navigation", "Apple CarPlay", "Android Auto", "Bluetooth",
    "Freisprecheinrichtung", "DAB", "USB", "USB-C", "Touchscreen", "Sprachsteuerung",
    "Soundsystem", "Harman Kardon", "Bose", "Bang & Olufsen", "CD-Player", "Radio",
    "AUX-Anschluss", "WLAN-Hotspot", "Induktives Laden", "Bordcomputer",
    "Connected Services", "Fond-Entertainment", "Kabelloses Apple CarPlay",
    "Kabelloses Android Auto", "12V-Steckdose", "230V-Steckdose",
  ] },
  { name: "Fahrerassistenz", options: [
    "Tempomat", "Adaptiver Tempomat / ACC", "Abstandstempomat", "Geschwindigkeitsbegrenzer",
    "Spurhalteassistent", "Spurwechselassistent", "Totwinkelassistent",
    "Verkehrszeichenerkennung", "Müdigkeitserkennung", "Notbremsassistent",
    "Parkassistent", "Einparkhilfe vorne", "Einparkhilfe hinten", "Selbstlenkender Parkassistent",
    "Ausparkassistent", "Querverkehrswarner", "Stauassistent", "Ausweichassistent",
    "Abbiegeassistent", "Ausstiegswarnung", "Anhängerassistent", "Nachtsichtassistent",
    "Abstandswarner", "Kollisionswarner", "Fußgängererkennung",
  ] },
  { name: "Kamera", options: ["Rückfahrkamera", "360° Kamera", "Frontkamera", "Seitenkameras"] },
  { name: "Licht", options: [
    "LED-Scheinwerfer", "Matrix-LED", "Xenon", "Bi-Xenon", "Fernlichtassistent",
    "Kurvenlicht", "Tagfahrlicht", "LED-Tagfahrlicht", "Ambientebeleuchtung",
    "Nebelscheinwerfer", "LED-Rückleuchten", "Scheinwerferreinigungsanlage",
    "Adaptives Licht", "Abbiegelicht", "Automatische Leuchtweitenregulierung",
  ] },
  { name: "Innenraum", options: [
    "Lederausstattung", "Teilleder", "Alcantara", "Stoffausstattung", "Kunstleder",
    "Sportsitze", "Komfortsitze", "Multifunktionslenkrad", "Sportlenkrad", "Lederlenkrad",
    "Schaltwippen", "Digitaler Tacho", "Head-Up Display", "Lendenwirbelstütze",
    "Armlehne vorne", "Armlehne hinten", "Geteilte Rücksitzbank", "Umklappbare Rücksitze",
    "Dritte Sitzreihe", "Durchladesystem", "Gepäckraumabdeckung", "Gepäckraumtrennnetz",
    "Sonnenrollos hinten", "Höhenverstellbarer Fahrersitz", "Beifahrersitz umklappbar",
    "Verschiebbare Rücksitzbank", "Variabler Ladeboden", "Innenraumbeleuchtung LED",
  ] },
  { name: "Außen", options: [
    "Panoramadach", "Panorama-Glasdach", "Schiebedach", "Elektrisches Schiebedach",
    "Dachreling", "Anhängerkupplung", "Elektrische Anhängerkupplung",
    "Abnehmbare Anhängerkupplung", "Abgedunkelte Scheiben", "Elektrisch anklappbare Außenspiegel",
    "Metallic-Lackierung", "Perleffekt-Lackierung", "Wärmeschutzverglasung",
    "Akustikverglasung", "Windschott", "Elektrisches Verdeck", "Trittbretter",
    "Heckspoiler", "Elektrische Schiebetüren", "Schiebetür rechts", "Schiebetür links",
  ] },
  { name: "Sicherheit", options: [
    "ABS", "ESP", "Traktionskontrolle", "Isofix", "Fahrerairbag", "Beifahrerairbag",
    "Seitenairbags", "Kopfairbags", "Knieairbag", "Beifahrerairbag abschaltbar",
    "Reifendruckkontrolle", "Alarmanlage", "Wegfahrsperre", "Notrufsystem",
    "Kindersicherung", "Gurtwarner", "Reifenpannenset", "Reserverad", "Notrad",
    "Anhängerstabilisierung", "Multikollisionsbremse",
  ] },
  { name: "Fahrwerk", options: [
    "Sportfahrwerk", "Adaptives Fahrwerk", "Luftfederung", "Niveauregulierung",
    "Fahrprofilauswahl", "Allradlenkung", "Differenzialsperre", "Adaptive Dämpfer",
  ] },
  { name: "Räder", options: ["Alufelgen", "Stahlfelgen", "Sommerreifen", "Winterreifen", "Ganzjahresreifen", "Runflat-Reifen"] },
  { name: "Elektro & Hybrid", options: [
    "Ladekabel Typ 2", "Schuko-Ladekabel", "CCS-Schnellladeanschluss", "Wärmepumpe",
    "Batterievorkonditionierung", "Rekuperation", "One-Pedal-Driving", "Vehicle-to-Load",
  ] },
];

// The same catalog is useful for optional equipment; no arbitrary taxonomy.
export const EXTRAS_CATALOG = EQUIPMENT_CATALOG;
