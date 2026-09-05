"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  applyBasisPoints,
  centsToEuros,
  clamp,
  eurosToCents,
  formatEuro,
  formatEuroPrecise,
  formatNumber,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  FINANCING_TERM_STEP_MONTHS,
  NO_FINANCING_TERM_AVAILABLE_MESSAGE,
  getAllowedTermMonths,
  getMaxFinancingMonths,
} from "@/modules/financing/age-limit";
import { calculateFinancing } from "@/modules/financing/calculator";
import type { FinanceConfigDto } from "@/modules/financing/repository";

/**
 * Unverbindlicher Finanzierungsrechner (US-12).
 *
 * Einstellbar sind Fahrzeugpreis, Erstzulassungsjahr, Anzahlung, Laufzeit und
 * Schlusszahlung. Der Zinssatz ist bewusst NICHT einstellbar – er ist eine
 * interne, im Admin gepflegte Vorgabe (Kundenvorgabe) und fließt nur noch
 * unsichtbar in die Berechnung ein.
 *
 * Laufzeiten sind ausschließlich in vollen 12-Monats-Schritten wählbar und
 * zusätzlich durch die AutoTal-Finanzierungsrichtlinie begrenzt: Ein
 * Fahrzeug darf am Laufzeitende nicht älter sein als
 * AUTOTAL_FINANCING_MAX_VEHICLE_AGE_YEARS (siehe
 * src/modules/financing/age-limit.ts). Das ist keine Bankenregel, sondern
 * eine unternehmerische Vorgabe für diesen Rechner.
 *
 * Rechnet vollständig im Browser – kein Server-Roundtrip beim Schieben eines
 * Reglers. Die Grenzwerte kommen aus der Admin-Konfiguration, sodass das
 * Autohaus den Rahmen vorgibt.
 *
 * Der Rechner stellt ausdrücklich keine Kreditzusage dar; der Hinweistext
 * darunter ist verpflichtender Bestandteil und wird nicht ausgeblendet.
 */
export function FinanceCalculator({
  config,
  initialPriceCents,
  className,
}: {
  config: FinanceConfigDto;
  initialPriceCents: number;
  className?: string;
}) {
  const currentYear = new Date().getFullYear();

  const [priceCents, setPriceCents] = useState(initialPriceCents);
  const [downPaymentCents, setDownPaymentCents] = useState(() =>
    applyBasisPoints(initialPriceCents, config.defaultDownPaymentBp),
  );
  const [termMonths, setTermMonths] = useState(config.defaultTermMonths);
  const [balloonCents, setBalloonCents] = useState(() =>
    applyBasisPoints(initialPriceCents, config.defaultBalloonBp),
  );

  // Erstzulassungsjahr des zu finanzierenden Fahrzeugs. Ohne Eingabe wird das
  // laufende Jahr angenommen – die am wenigsten einschränkende Annahme.
  // Erst ein tatsächlich eingetragenes (älteres) Baujahr aktiviert die
  // AutoTal-Altersgrenze. Der Rohtext bleibt als eigener State erhalten,
  // damit while Tippen ("2", "20", "201" …) das Feld nicht zwischenzeitlich
  // auf eine geratene Zahl springt.
  const [yearInput, setYearInput] = useState(String(currentYear));
  const parsedYear = Number(yearInput);
  const firstRegistrationYear =
    yearInput.length === 4 && Number.isInteger(parsedYear)
      ? parsedYear
      : currentYear;

  const handleYearChange = (raw: string) => {
    setYearInput(raw.replace(/[^\d]/g, "").slice(0, 4));
  };

  // Der Zinssatz ist Kundenvorgabe, keine Besucher-Eingabe – er kommt
  // unverändert aus der Admin-Konfiguration.
  const interestRateBp = config.defaultInterestRateBp;

  // Verfügbare Laufzeiten: volle 12-Monats-Schritte, begrenzt durch die
  // Admin-Konfiguration UND das Fahrzeugalter. Ist die Schnittmenge leer,
  // bietet der Rechner für dieses Baujahr keine reguläre Finanzierung an.
  const maxTermByVehicleAge = getMaxFinancingMonths(
    firstRegistrationYear,
    currentYear,
  );
  const allowedTermMonths = getAllowedTermMonths(
    config.minTermMonths,
    Math.min(config.maxTermMonths, maxTermByVehicleAge),
  );
  const hasAvailableTerm = allowedTermMonths.length > 0;
  const minTerm = allowedTermMonths[0] ?? config.minTermMonths;
  const maxTerm = allowedTermMonths.at(-1) ?? config.minTermMonths;
  const effectiveTermMonths = hasAvailableTerm
    ? clamp(termMonths, minTerm, maxTerm)
    : termMonths;

  // Obergrenzen hängen am Preis: Wird der Preis gesenkt, dürfen Anzahlung und
  // Schlussrate nicht darüber stehen bleiben.
  const maxDownPayment = applyBasisPoints(priceCents, config.maxDownPaymentBp);
  const maxBalloon = hasAvailableTerm
    ? Math.min(
        applyBasisPoints(priceCents, config.maxBalloonBp),
        Math.max(0, priceCents - downPaymentCents),
      )
    : 0;

  const effectiveDownPayment = clamp(downPaymentCents, 0, maxDownPayment);
  const effectiveBalloon = clamp(balloonCents, 0, maxBalloon);

  const result = useMemo(
    () =>
      calculateFinancing({
        priceCents,
        downPaymentCents: effectiveDownPayment,
        termMonths: effectiveTermMonths,
        interestRateBp,
        balloonCents: effectiveBalloon,
      }),
    [
      priceCents,
      effectiveDownPayment,
      effectiveTermMonths,
      interestRateBp,
      effectiveBalloon,
    ],
  );

  const handlePriceChange = (euros: string) => {
    const digits = euros.replace(/[^\d]/g, "").slice(0, 8);
    const nextPrice = eurosToCents(Number(digits || 0));
    setPriceCents(nextPrice);

    // Anzahlung und Schlussrate mitziehen, damit sie nie über dem Preis liegen.
    setDownPaymentCents((current) =>
      clamp(current, 0, applyBasisPoints(nextPrice, config.maxDownPaymentBp)),
    );
    setBalloonCents((current) =>
      clamp(current, 0, applyBasisPoints(nextPrice, config.maxBalloonBp)),
    );
  };

  return (
    <div className={cn("space-y-7", className)}>
      {/* --- Ergebnis ------------------------------------------------------ */}
      <div className="bg-ink text-ink-foreground rounded-xl p-6">
        <p className="text-ink-muted text-sm">Ihre monatliche Rate</p>

        {hasAvailableTerm ? (
          <>
            {/* Die Rate ist die einzige Zahl, die auf den ersten Blick zählen
                soll – deshalb deutlich größer als alles andere in der Box. */}
            <p
              className="font-display tabular mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl"
              aria-live="polite"
            >
              {formatEuroPrecise(result.monthlyPaymentCents)}
            </p>

            <dl className="border-ink-border mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 text-sm">
              <div>
                <dt className="text-ink-muted">Finanzierungsbetrag</dt>
                <dd className="tabular mt-0.5 font-semibold">
                  {formatEuro(result.financedAmountCents)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Laufzeit</dt>
                <dd className="tabular mt-0.5 font-semibold">
                  {effectiveTermMonths} Monate
                </dd>
              </div>
              {effectiveBalloon > 0 && (
                <div>
                  <dt className="text-ink-muted">Schlussrate</dt>
                  <dd className="tabular mt-0.5 font-semibold">
                    {formatEuro(effectiveBalloon)}
                  </dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <div aria-live="polite">
            <p className="text-ink-muted mt-2 leading-relaxed">
              {NO_FINANCING_TERM_AVAILABLE_MESSAGE}
            </p>
            <Button asChild variant="brand" size="xl" className="mt-5">
              <Link href="/kontakt">Individuelle Beratung anfragen</Link>
            </Button>
          </div>
        )}
      </div>

      {/* --- Eingaben ------------------------------------------------------ */}
      <div className="space-y-6">
        {/* Fahrzeugpreis und Erstzulassung nebeneinander: Das Baujahr ist eine
            Randbedingung, kein zweiter Preis – die Zweispaltigkeit hält es
            bewusst kleiner als die Hauptfrage "Wie teuer ist das Fahrzeug". */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fin-price" className="text-muted-foreground font-normal">
              Fahrzeugpreis
            </Label>
            <div className="relative">
              <Input
                id="fin-price"
                inputMode="numeric"
                autoComplete="off"
                className="tabular pr-9"
                // formatNumber statt toLocaleString: sonst gruppiert ICU hier
                // mit geschütztem Leerzeichen ("31 400") und wiche von der
                // Preisanzeige darüber ab.
                value={formatNumber(Math.round(centsToEuros(priceCents)))}
                onChange={(event) => handlePriceChange(event.target.value)}
              />
              <span
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
              >
                €
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fin-year" className="text-muted-foreground font-normal">
              Erstzulassung
            </Label>
            <Input
              id="fin-year"
              inputMode="numeric"
              autoComplete="off"
              placeholder={`z. B. ${currentYear - 3}`}
              className="tabular"
              value={yearInput}
              onChange={(event) => handleYearChange(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {hasAvailableTerm
                ? `Maximale Laufzeit: ${maxTerm} Monate`
                : "Aktuell keine Laufzeit verfügbar."}
            </p>
          </div>
        </div>

        {hasAvailableTerm && (
          <>
            <SliderField
              id="fin-down"
              label="Anzahlung"
              value={effectiveDownPayment}
              min={applyBasisPoints(priceCents, config.minDownPaymentBp)}
              max={maxDownPayment}
              step={50_000}
              display={formatEuro(effectiveDownPayment)}
              hint={
                priceCents > 0
                  ? `${Math.round((effectiveDownPayment / priceCents) * 100)} % des Kaufpreises`
                  : undefined
              }
              onChange={setDownPaymentCents}
            />

            <SliderField
              id="fin-term"
              label="Laufzeit"
              value={effectiveTermMonths}
              min={minTerm}
              max={maxTerm}
              step={FINANCING_TERM_STEP_MONTHS}
              display={`${effectiveTermMonths} Monate`}
              hint={`${(effectiveTermMonths / 12).toLocaleString("de-AT", { maximumFractionDigits: 1 })} Jahre`}
              onChange={setTermMonths}
            />

            {config.maxBalloonBp > 0 && (
              <SliderField
                id="fin-balloon"
                label="Schlussrate"
                value={effectiveBalloon}
                min={0}
                max={maxBalloon}
                step={50_000}
                display={
                  effectiveBalloon === 0 ? "keine" : formatEuro(effectiveBalloon)
                }
                hint="Am Laufzeitende fällig – wahlweise ablösen oder weiterfinanzieren"
                onChange={setBalloonCents}
              />
            )}
          </>
        )}
      </div>

      {/* --- Pflichthinweis ------------------------------------------------
          Bewusst als ruhige Fußnote statt als Hinweis-Box: eine graue Fläche
          mit Symbol wirkt wie eine Systemmeldung. Eine feine Trennlinie und
          kleiner Text lesen sich wie das branchenübliche Kleingedruckte, das
          es ja auch ist – der Wortlaut selbst ist unverändert Pflichttext. */}
      <p className="text-muted-foreground border-border border-t pt-4 text-xs leading-relaxed">
        {config.disclaimer}
      </p>
    </div>
  );
}

/**
 * Regler mit Beschriftung und Werteanzeige.
 *
 * Wird der Bereich zu einem einzigen Wert (min === max, etwa Anzahlung bei
 * Preis 0), wäre der Regler nicht bedienbar – dann wird nur der Wert gezeigt.
 */
function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const disabled = max <= min;

  return (
    <div className="space-y-3">
      {/* Label zurückhaltend, Wert kräftig – der Wert ist es, den man beim
          Schieben im Blick behält. */}
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-muted-foreground font-normal">
          {label}
        </Label>
        <output htmlFor={id} className="tabular text-base font-semibold">
          {display}
        </output>
      </div>

      <Slider
        id={id}
        value={[clamp(value, min, Math.max(min, max))]}
        min={min}
        max={Math.max(min + step, max)}
        step={step}
        disabled={disabled}
        aria-label={label}
        onValueChange={([next]) => onChange(next)}
      />

      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
