/**
 * Erzeugung sprechender, stabiler URL-Segmente für Fahrzeugseiten.
 *
 * Der Slug muss über Syncs hinweg stabil bleiben, sonst brechen Links und
 * SEO-Rankings. Deshalb fließt die (unveränderliche) externe ID als Suffix
 * ein statt eines Zählers, der bei jedem Import anders ausfallen könnte.
 */

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  é: "e",
  è: "e",
  ê: "e",
  á: "a",
  à: "a",
  í: "i",
  ó: "o",
  ú: "u",
  ñ: "n",
  ç: "c",
  å: "a",
  ø: "o",
};

export function slugify(input: string): string {
  return input
    .replace(/[äöüßÄÖÜéèêáàíóúñçåø]/g, (char) => UMLAUT_MAP[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * "bmw-320d-xdrive-touring-m-sport-2020-mock-1002"
 *
 * Der Suffix aus der externen ID garantiert Eindeutigkeit auch bei zwei
 * identisch ausgestatteten Fahrzeugen im Bestand.
 */
export function buildVehicleSlug(input: {
  make: string;
  model: string;
  variant?: string | null;
  firstRegistration?: Date | null;
  externalId: string;
}): string {
  const year = input.firstRegistration?.getFullYear();

  const parts = [
    input.make,
    input.model,
    input.variant ?? "",
    year ? String(year) : "",
    input.externalId,
  ].filter(Boolean);

  const slug = slugify(parts.join(" "));

  // Sehr lange Varianten kürzen, ohne die eindeutige ID zu verlieren.
  if (slug.length <= 120) return slug;

  const idSuffix = slugify(input.externalId);
  return `${slug.slice(0, 120 - idSuffix.length - 1).replace(/-+$/, "")}-${idSuffix}`;
}

/** "BMW 320d xDrive Touring M Sport" */
export function buildVehicleTitle(input: {
  make: string;
  model: string;
  variant?: string | null;
}): string {
  return [input.make, input.model, input.variant].filter(Boolean).join(" ");
}
