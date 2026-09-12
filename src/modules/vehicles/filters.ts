import type { Prisma } from "@/generated/prisma/client";
import type { VehicleStatus } from "@/generated/prisma/enums";

/**
 * Suche und Filter für Fahrzeuglisten – ein Kern für zwei Stellen.
 *
 * Die Fahrzeugverwaltung (/admin/fahrzeuge) und die Fahrzeugauswahl im
 * Beitragsassistenten (/admin/social-media) filtern nach denselben Regeln:
 * gleiche Suchfelder, gleiche Schreibweise der Adressparameter, gleiche
 * Bedeutung von "Marke" und "Modell". Was hier steht, gilt an beiden Stellen;
 * eine zweite Suchlogik gibt es bewusst nicht.
 *
 * Alles in dieser Datei ist rein: keine Datenbank, kein Server-Import. So
 * lässt es sich aus Server- und Client-Komponenten verwenden und ohne
 * Datenbank testen.
 */

export type VehicleFilters = {
  /** Freitext, bereits getrimmt. Leer = keine Suche. */
  q: string;
  make: string | null;
  model: string | null;
  /** null = alle Stati. */
  status: VehicleStatus | null;
};

export const EMPTY_VEHICLE_FILTERS: VehicleFilters = {
  q: "",
  make: null,
  model: null,
  status: null,
};

/**
 * Adressparameter, klein geschrieben wie bisher in den Status-Tabs.
 *
 *   ?status=in_stock&make=BMW&model=X5&q=30d
 *
 * Nur ausdrücklich gesetzte Werte erscheinen in der Adresse; ein Reset entfernt
 * sie wieder. So bleibt die Adresse teilbar und ein Reload behält die Auswahl.
 */
export const VEHICLE_FILTER_PARAMS = {
  q: "q",
  make: "make",
  model: "model",
  status: "status",
} as const;

/** Erlaubte Werte des Status-Parameters. "all" hebt einen Vorgabestatus auf. */
const STATUS_BY_PARAM: Record<string, VehicleStatus> = {
  in_stock: "IN_STOCK",
  reserved: "RESERVED",
  sold: "SOLD",
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

/** Filterwerte werden nie leer gespeichert – "" und null bedeuten dasselbe. */
function optional(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * Liest die Filter aus den Adressparametern.
 *
 * Unbekannte Werte fallen still auf die Vorgabe zurück, statt eine leere Liste
 * ohne Erklärung zu zeigen. Der Beitragsassistent gibt "IN_STOCK" vor, weil
 * beworben wird, was im Bestand steht; "?status=all" hebt das ausdrücklich auf.
 */
export function parseVehicleFilters(
  params: RawParams,
  options: { defaultStatus?: VehicleStatus | null } = {},
): VehicleFilters {
  const defaultStatus = options.defaultStatus ?? null;
  const rawStatus = first(params[VEHICLE_FILTER_PARAMS.status]).toLowerCase();

  let status: VehicleStatus | null;
  if (rawStatus === "") {
    status = defaultStatus;
  } else if (rawStatus === "all") {
    status = null;
  } else {
    status = STATUS_BY_PARAM[rawStatus] ?? defaultStatus;
  }

  return {
    q: first(params[VEHICLE_FILTER_PARAMS.q]),
    make: optional(first(params[VEHICLE_FILTER_PARAMS.make])),
    model: optional(first(params[VEHICLE_FILTER_PARAMS.model])),
    status,
  };
}

/**
 * Schreibt die Filter in Adressparameter zurück.
 *
 * `defaultStatus` spiegelt die Vorgabe der Seite: Ein Status, der der Vorgabe
 * entspricht, braucht keinen Parameter; "alle" trotz Vorgabe wird zu
 * "status=all". Ohne Vorgabe (Fahrzeugverwaltung) heißt "alle" einfach: kein
 * Parameter.
 */
export function vehicleFiltersToSearchParams(
  filters: VehicleFilters,
  options: { defaultStatus?: VehicleStatus | null } = {},
): URLSearchParams {
  const defaultStatus = options.defaultStatus ?? null;
  const params = new URLSearchParams();

  if (filters.status !== defaultStatus) {
    params.set(
      VEHICLE_FILTER_PARAMS.status,
      filters.status ? filters.status.toLowerCase() : "all",
    );
  }
  if (filters.make) params.set(VEHICLE_FILTER_PARAMS.make, filters.make);
  if (filters.model) params.set(VEHICLE_FILTER_PARAMS.model, filters.model);
  if (filters.q) params.set(VEHICLE_FILTER_PARAMS.q, filters.q);

  return params;
}

/** Adresse einer Seite mit diesen Filtern – ohne "?" wenn nichts gesetzt ist. */
export function vehicleFiltersHref(
  basePath: string,
  filters: VehicleFilters,
  options: { defaultStatus?: VehicleStatus | null } = {},
): string {
  const query = vehicleFiltersToSearchParams(filters, options).toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Stimmt, wenn außer dem Status nichts gefiltert wird. */
export function hasActiveVehicleFilters(filters: VehicleFilters): boolean {
  return filters.q !== "" || filters.make !== null || filters.model !== null;
}

/**
 * Ein Modell gilt nur zusammen mit seiner Marke.
 *
 * Wechselt die Marke, passt das zuvor gewählte Modell meist nicht mehr –
 * "A-Klasse" gibt es bei BMW nicht. Statt einer leeren Liste ohne Erklärung
 * fällt das Modell dann still auf "alle" zurück. Die Oberfläche macht das
 * beim Wechsel sofort; hier geschieht es zusätzlich gegen die tatsächlichen
 * Modelle, damit auch eine von Hand eingegebene Adresse sauber landet.
 */
export function dropInvalidModel(
  filters: VehicleFilters,
  availableModels: readonly string[],
): VehicleFilters {
  if (filters.model === null) return filters;
  if (availableModels.includes(filters.model)) return filters;
  return { ...filters, model: null };
}

/**
 * Felder, die die Freitextsuche durchsucht.
 *
 * Marke, Modell und Variante beschreiben das Fahrzeug; GW-Nr und FIN sind die
 * Kennungen, nach denen ein Händler mit dem Zettel in der Hand sucht. Die
 * Farbe ist dabei, weil "der rote Golf" eine übliche Frage ist.
 */
const SEARCH_FIELDS = [
  "make",
  "model",
  "variant",
  "stockNumber",
  "vin",
  "color",
] as const;

/**
 * Suchbegriff in einzelne Wörter zerlegen.
 *
 * Jedes Wort muss in irgendeinem Feld vorkommen – so findet "BMW X5" ein
 * Fahrzeug, dessen Marke "BMW" und dessen Modell "X5" ist, obwohl beides in
 * verschiedenen Feldern steht. Ein Wort in mehreren Feldern zählt einmal.
 */
export function searchTerms(q: string): string[] {
  return q
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

/**
 * Prisma-Bedingung für die Filter.
 *
 * Ausschließlich über den Query-Builder – kein Roh-SQL, keine Verkettung von
 * Nutzereingaben. `mode: "insensitive"` übersetzt Prisma in ILIKE; der
 * Suchtext wird dabei als Parameter gebunden, nicht in die Abfrage kopiert.
 */
export function buildVehicleWhere(
  filters: VehicleFilters,
): Prisma.VehicleWhereInput {
  const and: Prisma.VehicleWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.make) and.push({ make: filters.make });
  if (filters.model) and.push({ model: filters.model });

  for (const term of searchTerms(filters.q)) {
    and.push({
      OR: SEARCH_FIELDS.map((field) => ({
        [field]: { contains: term, mode: "insensitive" as const },
      })),
    });
  }

  return and.length === 0 ? {} : { AND: and };
}

/**
 * Dieselben Regeln auf einer geladenen Liste – für Tests und für Stellen, die
 * die Daten schon haben. Bewusst ein Abbild von `buildVehicleWhere`, nicht
 * dessen Ersatz: Listen werden serverseitig gefiltert.
 */
export function matchesVehicleFilters(
  vehicle: {
    make: string;
    model: string;
    variant: string | null;
    stockNumber: string | null;
    vin: string | null;
    color: string | null;
    status: VehicleStatus;
  },
  filters: VehicleFilters,
): boolean {
  if (filters.status && vehicle.status !== filters.status) return false;
  if (filters.make && vehicle.make !== filters.make) return false;
  if (filters.model && vehicle.model !== filters.model) return false;

  const haystack = SEARCH_FIELDS.map((field) =>
    (vehicle[field] ?? "").toLowerCase(),
  );

  return searchTerms(filters.q).every((term) => {
    const needle = term.toLowerCase();
    return haystack.some((value) => value.includes(needle));
  });
}
