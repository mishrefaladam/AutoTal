import type { DrivetrainType } from "@/generated/prisma/enums";

import { buildImportFingerprint } from "./import-plan";
import type { VehicleListCard } from "./vehicle-list-pdf";

/**
 * Fahrzeuglisten-PDF mit dem Bestand zusammenführen.
 *
 * ROLLENVERTEILUNG: Die CSV ist der Bestand – sie legt Fahrzeuge an und
 * hält sie aktuell. Die PDF ergänzt: Leistung, Hubraum, Antrieb, Farbe, ein
 * Foto, eine genauere Erstzulassung. Sie legt nichts an und löscht nichts.
 *
 * ZUORDNUNG, in dieser Reihenfolge:
 *   1. FIN – wenn beide Seiten eine haben (diese Liste führt keine).
 *   2. GW-Nr – ebenso.
 *   3. Ersatzkennung aus Marke, Modell, Baujahr und Kilometerstand – dieselbe
 *      wie beim CSV-Import. Vier Merkmale, die zusammen an echten Exporten
 *      49 von 50 Fahrzeugen eindeutig machen.
 *
 * Marke und Modell allein reichen nicht: Der Bestand hat drei BMW X5 und
 * zwei VW Golf.
 *
 * Genau ein Treffer heißt "sicher" und wird vorgeschlagen. Mehrere Treffer
 * heißen "unsicher": Dann entscheidet der Händler, nicht der Import. Kein
 * Treffer: Es werden nur noch lose Kandidaten gezeigt (gleiche Marke und
 * gleiches Modell mit passendem Jahr, Preis oder Kilometerstand), und auch
 * die übernimmt niemand ungefragt.
 *
 * FELDREGELN: Ein leerer PDF-Wert ändert nichts. Ein fehlender Bestandswert
 * wird ergänzt (vorausgewählt). Ein gleicher Wert bleibt gleich. Zwei
 * verschiedene Werte sind ein Konflikt – sichtbar, mit Wahl, nie still
 * überschrieben.
 *
 * Alles hier ist rein: keine Datenbank, kein Server-Import.
 */

// ---------------------------------------------------------------------------
// Ziele: Fahrzeuge, wie sie nach dem CSV-Import bestehen werden
// ---------------------------------------------------------------------------

export type EnrichmentTargetRef =
  | { kind: "existing"; id: string }
  | { kind: "create"; line: number };

export type EnrichmentTarget = {
  ref: EnrichmentTargetRef;
  title: string;
  make: string;
  model: string;
  variant: string | null;
  firstRegistration: Date | null;
  mileageKm: number | null;
  priceCents: number | null;
  powerKw: number | null;
  displacementCcm: number | null;
  color: string | null;
  drivetrain: DrivetrainType | null;
  vin: string | null;
  stockNumber: string | null;
  imageCount: number;
};

export function sameTargetRef(a: EnrichmentTargetRef, b: EnrichmentTargetRef): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "existing"
    ? a.id === (b as { id: string }).id
    : a.line === (b as { line: number }).line;
}

export function targetRefKey(ref: EnrichmentTargetRef): string {
  return ref.kind === "existing" ? `existing:${ref.id}` : `create:${ref.line}`;
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

export const ENRICHMENT_FIELDS = [
  "variant",
  "firstRegistration",
  "mileageKm",
  "priceCents",
  "powerKw",
  "displacementCcm",
  "color",
  "drivetrain",
] as const;

export type EnrichmentField = (typeof ENRICHMENT_FIELDS)[number];

export type EnrichmentChangeKind =
  /** Bestand leer, PDF hat einen Wert – wird vorgeschlagen und vorausgewählt. */
  | "fill"
  /** Beide gleich – keine Änderung. */
  | "same"
  /** Beide belegt und verschieden – Wahl nötig, Bestand bleibt Vorgabe. */
  | "conflict"
  /** Bestand leer, PDF-Wert aber unsicher (gekürzt) – nur auf Wunsch. */
  | "suggest";

export type EnrichmentChange = {
  field: EnrichmentField;
  kind: EnrichmentChangeKind;
  current: string | number | Date | null;
  proposed: string | number | Date;
  preselected: boolean;
};

export type EnrichmentMatch =
  | { kind: "safe"; target: EnrichmentTarget; by: "vin" | "stockNumber" | "fingerprint" }
  | { kind: "ambiguous"; candidates: EnrichmentTarget[] }
  | { kind: "unmatched"; candidates: EnrichmentTarget[] };

export type EnrichmentEntry = {
  card: VehicleListCard;
  match: EnrichmentMatch;
  /** Nur bei sicherer Zuordnung vorab berechnet. */
  changes: EnrichmentChange[];
  image: { available: boolean; preselected: boolean } | null;
};

export type EnrichmentPlan = {
  entries: EnrichmentEntry[];
  counts: { safe: number; ambiguous: number; unmatched: number };
};

// ---------------------------------------------------------------------------
// Vergleiche
// ---------------------------------------------------------------------------

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function yearOf(date: Date | null): number | null {
  return date ? date.getUTCFullYear() : null;
}

function targetFingerprint(target: EnrichmentTarget): string | null {
  return buildImportFingerprint({
    make: target.make,
    model: target.model,
    year: yearOf(target.firstRegistration),
    mileageKm: target.mileageKm,
  });
}

function cardFingerprint(card: VehicleListCard): string | null {
  return buildImportFingerprint({
    make: card.make,
    model: card.model,
    year: card.year,
    mileageKm: card.mileageKm,
  });
}

// ---------------------------------------------------------------------------
// Zuordnung
// ---------------------------------------------------------------------------

function matchCard(card: VehicleListCard, targets: EnrichmentTarget[]): EnrichmentMatch {
  // 1. FIN
  if (card.vin) {
    const vin = card.vin.toUpperCase();
    const hits = targets.filter((t) => t.vin?.toUpperCase() === vin);
    if (hits.length === 1) return { kind: "safe", target: hits[0], by: "vin" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
  }

  // 2. GW-Nr
  if (card.stockNumber) {
    const hits = targets.filter((t) => t.stockNumber === card.stockNumber);
    if (hits.length === 1) return { kind: "safe", target: hits[0], by: "stockNumber" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
  }

  // 3. Ersatzkennung
  const fingerprint = cardFingerprint(card);
  if (fingerprint) {
    const hits = targets.filter((t) => targetFingerprint(t) === fingerprint);
    if (hits.length === 1) return { kind: "safe", target: hits[0], by: "fingerprint" };
    if (hits.length > 1) return { kind: "ambiguous", candidates: hits };
  }

  // Kein Treffer: lose Kandidaten, die der Händler zuordnen darf.
  const make = normalizeName(card.make);
  const model = normalizeName(card.model);
  const candidates = targets.filter((t) => {
    if (normalizeName(t.make) !== make || normalizeName(t.model) !== model) return false;
    return (
      (card.year !== null && yearOf(t.firstRegistration) === card.year) ||
      (card.priceCents !== null && t.priceCents === card.priceCents) ||
      (card.mileageKm !== null && t.mileageKm === card.mileageKm)
    );
  });

  return { kind: "unmatched", candidates };
}

// ---------------------------------------------------------------------------
// Feldvergleich
// ---------------------------------------------------------------------------

function change(
  field: EnrichmentField,
  kind: EnrichmentChangeKind,
  current: EnrichmentChange["current"],
  proposed: EnrichmentChange["proposed"],
): EnrichmentChange {
  return { field, kind, current, proposed, preselected: kind === "fill" };
}

function numberChange(
  field: EnrichmentField,
  current: number | null,
  proposed: number | null,
): EnrichmentChange | null {
  if (proposed === null) return null;
  if (current === null) return change(field, "fill", null, proposed);
  if (current === proposed) return change(field, "same", current, proposed);
  return change(field, "conflict", current, proposed);
}

/**
 * Was sich am Ziel ändern würde, wenn die Karte übernommen wird.
 *
 * Für jedes Feld genau eine Regel – siehe Kopfkommentar. Nur Felder, für die
 * die PDF einen Wert hat, tauchen überhaupt auf.
 */
export function diffCardAgainstTarget(
  card: VehicleListCard,
  target: EnrichmentTarget,
): EnrichmentChange[] {
  const changes: (EnrichmentChange | null)[] = [];

  // Bezeichnung: Die Liste kürzt lange Texte. Ein gekürzter Text ist keine
  // sichere Angabe und wird nur auf Wunsch übernommen. Ist der Bestand
  // länger und beginnt mit dem PDF-Text, sagt beides dasselbe.
  if (card.variant) {
    const current = target.variant?.trim() || null;
    if (!current) {
      changes.push(change("variant", card.variantTruncated ? "suggest" : "fill", null, card.variant));
    } else if (
      normalizeName(current) === normalizeName(card.variant) ||
      (card.variantTruncated && normalizeName(current).startsWith(normalizeName(card.variant)))
    ) {
      changes.push(change("variant", "same", current, card.variant));
    } else {
      changes.push(change("variant", "conflict", current, card.variant));
    }
  }

  // Erstzulassung: Die CSV kennt nur das Jahr und speichert den 1. Jänner.
  // Nennt die PDF im selben Jahr einen Monat, ist das kein Widerspruch,
  // sondern genauer – und wird wie ein fehlender Wert ergänzt.
  if (card.firstRegistration) {
    const current = target.firstRegistration;
    if (!current) {
      changes.push(change("firstRegistration", "fill", null, card.firstRegistration));
    } else if (current.getTime() === card.firstRegistration.getTime()) {
      changes.push(change("firstRegistration", "same", current, card.firstRegistration));
    } else if (
      current.getUTCFullYear() === card.year &&
      current.getUTCMonth() === 0 &&
      current.getUTCDate() === 1
    ) {
      changes.push(change("firstRegistration", "fill", current, card.firstRegistration));
    } else {
      changes.push(change("firstRegistration", "conflict", current, card.firstRegistration));
    }
  }

  changes.push(numberChange("mileageKm", target.mileageKm, card.mileageKm));
  changes.push(numberChange("priceCents", target.priceCents, card.priceCents));
  changes.push(numberChange("powerKw", target.powerKw, card.powerKw));
  changes.push(numberChange("displacementCcm", target.displacementCcm, card.displacementCcm));

  if (card.color) {
    const current = target.color?.trim() || null;
    if (!current) changes.push(change("color", "fill", null, card.color));
    else if (normalizeName(current) === normalizeName(card.color)) {
      changes.push(change("color", "same", current, card.color));
    } else changes.push(change("color", "conflict", current, card.color));
  }

  if (card.drivetrain) {
    if (!target.drivetrain) changes.push(change("drivetrain", "fill", null, card.drivetrain));
    else if (target.drivetrain === card.drivetrain) {
      changes.push(change("drivetrain", "same", target.drivetrain, card.drivetrain));
    } else changes.push(change("drivetrain", "conflict", target.drivetrain, card.drivetrain));
  }

  return changes.filter((entry): entry is EnrichmentChange => entry !== null);
}

/**
 * Das Foto der Karte: Fehlt dem Fahrzeug ein Bild, wird es vorausgewählt und
 * zum Titelbild. Hat es schon welche, bleibt es Angebot – dann kommt es
 * hinten dazu und ersetzt nichts.
 */
export function imageOffer(
  card: VehicleListCard,
  target: EnrichmentTarget | null,
): EnrichmentEntry["image"] {
  if (!card.image) return null;
  return { available: true, preselected: target !== null && target.imageCount === 0 };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function planEnrichment(
  cards: VehicleListCard[],
  targets: EnrichmentTarget[],
): EnrichmentPlan {
  const matches = cards.map((card) => ({ card, match: matchCard(card, targets) }));

  // Zwei Karten, die auf dasselbe Fahrzeug zeigen, sind kein sicherer
  // Treffer mehr – eine davon wäre falsch, und welche, weiß nur der Händler.
  const claims = new Map<string, number>();
  for (const { match } of matches) {
    if (match.kind !== "safe") continue;
    const key = targetRefKey(match.target.ref);
    claims.set(key, (claims.get(key) ?? 0) + 1);
  }

  const entries: EnrichmentEntry[] = matches.map(({ card, match }) => {
    let resolved = match;
    if (match.kind === "safe" && (claims.get(targetRefKey(match.target.ref)) ?? 0) > 1) {
      resolved = { kind: "ambiguous", candidates: [match.target] };
    }

    const target = resolved.kind === "safe" ? resolved.target : null;

    return {
      card,
      match: resolved,
      changes: target ? diffCardAgainstTarget(card, target) : [],
      image: imageOffer(card, target),
    };
  });

  return {
    entries,
    counts: {
      safe: entries.filter((e) => e.match.kind === "safe").length,
      ambiguous: entries.filter((e) => e.match.kind === "ambiguous").length,
      unmatched: entries.filter((e) => e.match.kind === "unmatched").length,
    },
  };
}

// ---------------------------------------------------------------------------
// Entscheidungen des Händlers
// ---------------------------------------------------------------------------

/**
 * Was der Händler im Review festgelegt hat – je Karte.
 *
 * `target` null heißt: diese Karte überspringen. Ohne Entscheidung gilt für
 * sichere Treffer die Vorauswahl; unsichere Karten werden ohne ausdrückliche
 * Entscheidung nie übernommen.
 */
export type EnrichmentDecision = {
  cardKey: string;
  target: EnrichmentTargetRef | null;
  acceptedFields: EnrichmentField[];
  useImage: boolean;
};

export type ResolvedEnrichment = {
  card: VehicleListCard;
  target: EnrichmentTarget;
  /** Akzeptierte Änderungen mit ihrem PDF-Wert. */
  accepted: EnrichmentChange[];
  useImage: boolean;
};

/** Vorgabe für einen sicheren Treffer, wenn der Händler nichts geändert hat. */
export function defaultDecision(entry: EnrichmentEntry): EnrichmentDecision {
  if (entry.match.kind !== "safe") {
    return { cardKey: entry.card.key, target: null, acceptedFields: [], useImage: false };
  }
  return {
    cardKey: entry.card.key,
    target: entry.match.target.ref,
    acceptedFields: entry.changes.filter((c) => c.preselected).map((c) => c.field),
    useImage: entry.image?.preselected ?? false,
  };
}

/**
 * Entscheidungen gegen den Plan auflösen.
 *
 * Nur Ziele, die im Plan als Treffer oder Kandidat vorkommen, sind zulässig –
 * eine Entscheidung kann kein beliebiges Fahrzeug benennen. Was gleich ist,
 * wird nicht geschrieben, auch wenn es angekreuzt wurde.
 */
export function resolveEnrichmentDecisions(
  plan: EnrichmentPlan,
  decisions: EnrichmentDecision[],
): ResolvedEnrichment[] {
  const byKey = new Map(decisions.map((d) => [d.cardKey, d]));
  const resolved: ResolvedEnrichment[] = [];

  for (const entry of plan.entries) {
    const decision = byKey.get(entry.card.key) ?? defaultDecision(entry);
    if (!decision.target) continue;

    const allowed: EnrichmentTarget[] =
      entry.match.kind === "safe" ? [entry.match.target] : entry.match.candidates;
    const target = allowed.find((t) => sameTargetRef(t.ref, decision.target!));
    if (!target) continue;

    const changes = diffCardAgainstTarget(entry.card, target);
    const accepted = changes.filter(
      (c) => c.kind !== "same" && decision.acceptedFields.includes(c.field),
    );
    const useImage = decision.useImage && entry.card.image !== null;

    if (accepted.length === 0 && !useImage) continue;
    resolved.push({ card: entry.card, target, accepted, useImage });
  }

  return resolved;
}
