/**
 * Ermittelt die Datenbankverbindung, über die Prisma-Migrationen laufen.
 *
 * Eigenes Modul, damit die Logik testbar ist: prisma.config.ts wird beim
 * Import sofort ausgewertet und würde bei fehlerhafter Konfiguration werfen,
 * bevor ein Test überhaupt etwas prüfen kann.
 */

/** Beschreibt einen unbrauchbaren Wert, ohne ihn preiszugeben. */
export function describeProblem(value: string): string {
  if (value.trim() === "") return "besteht nur aus Leerzeichen";
  if (/^["']|["']$/.test(value.trim()))
    return "ist in Anführungszeichen eingeschlossen";
  if (value.includes("${"))
    return 'enthält eine "${...}"-Referenz (Vercel setzt solche Platzhalter nicht ein)';
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(value.trim()))
    return "beginnt mit einem Variablennamen und '=' – vermutlich wurde die ganze Zeile statt nur des Werts eingefügt";
  if (/^https?:\/\//.test(value.trim()))
    return "ist eine HTTP-Adresse, keine PostgreSQL-Verbindung";
  if (/^psql\b/.test(value.trim()))
    return "ist ein psql-Kommando statt einer Verbindungszeichenfolge";
  if (/[\r\n]/.test(value)) return "enthält einen Zeilenumbruch";
  return "beginnt nicht mit 'postgresql://' oder 'postgres://'";
}

/**
 * Wählt DATABASE_URL_UNPOOLED, sonst DIRECT_URL, sonst DATABASE_URL.
 *
 * Bewusst `||`-Semantik statt `??`: Eine in Vercel angelegte, aber leere
 * Variable ist praktisch "nicht gesetzt". Mit `??` gewönne der leere String
 * und Prisma bekäme gar keine Verbindung.
 *
 * Ein gesetzter, aber unbrauchbarer Wert wird NICHT stillschweigend
 * übersprungen – das wäre ein Konfigurationsfehler, der sich sonst als
 * scheinbar erfolgreiche Migration gegen die falsche Datenbank tarnt.
 * Ohne diese Prüfung meldet Prisma nur "P1013: The scheme is not recognized
 * in database URL" und verschweigt, welche Variable gemeint ist.
 */
export function resolveMigrationUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  for (const name of [
    "DATABASE_URL_UNPOOLED",
    "DIRECT_URL",
    "DATABASE_URL",
  ] as const) {
    const raw = environment[name];

    // Nicht gesetzt oder leer -> nächster Kandidat.
    if (raw === undefined || raw === "") continue;

    // Eingefügte Werte tragen häufig einen Zeilenumbruch am Ende.
    const value = raw.trim();

    if (/^postgres(ql)?:\/\//.test(value)) return value;

    throw new Error(
      `Die Umgebungsvariable ${name} ist gesetzt, taugt aber nicht als ` +
        `PostgreSQL-Verbindung: Sie ${describeProblem(raw)}. Erwartet wird ` +
        `der reine Connection String, beginnend mit "postgresql://" – ohne ` +
        `Anführungszeichen und ohne Variablennamen davor.`,
    );
  }

  throw new Error(
    "Weder DATABASE_URL_UNPOOLED noch DIRECT_URL noch DATABASE_URL ist " +
      "gesetzt – ohne Verbindung können keine Migrationen laufen.",
  );
}
