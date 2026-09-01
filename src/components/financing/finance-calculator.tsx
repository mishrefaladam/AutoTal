"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  applyBasisPoints,
  bpToPercent,
  centsToEuros,
  clamp,
  eurosToCents,
  formatEuro,
  formatEuroPrecise,
  formatNumber,
  formatPercent,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { calculateFinancing } from "@/modules/financing/calculator";
import type { FinanceConfigDto } from "@/modules/financing/repository";

/**
 * Unverbindlicher Finanzierungsrechner (US-12).
 *
 * Alle fünf geforderten Parameter sind einstellbar: Fahrzeugpreis,
 * Anzahlung, Laufzeit, Zinssatz und Schlusszahlung.
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
  priceEditable = true,
  className,
}: {
  config: FinanceConfigDto;
  initialPriceCents: number;
  /** Auf der Fahrzeugdetailseite steht der Preis fest. */
  priceEditable?: boolean;
  className?: string;
}) {
  const [priceCents, setPriceCents] = useState(initialPriceCents);
  const [downPaymentCents, setDownPaymentCents] = useState(() =>
    applyBasisPoints(initialPriceCents, config.defaultDownPaymentBp),
  );
  const [termMonths, setTermMonths] = useState(config.defaultTermMonths);
  const [interestRateBp, setInterestRateBp] = useState(
    config.defaultInterestRateBp,
  );
  const [balloonCents, setBalloonCents] = useState(() =>
    applyBasisPoints(initialPriceCents, config.defaultBalloonBp),
  );

  // Obergrenzen hängen am Preis: Wird der Preis gesenkt, dürfen Anzahlung und
  // Schlussrate nicht darüber stehen bleiben.
  const maxDownPayment = applyBasisPoints(priceCents, config.maxDownPaymentBp);
  const maxBalloon = Math.min(
    applyBasisPoints(priceCents, config.maxBalloonBp),
    Math.max(0, priceCents - downPaymentCents),
  );

  const effectiveDownPayment = clamp(downPaymentCents, 0, maxDownPayment);
  const effectiveBalloon = clamp(balloonCents, 0, maxBalloon);

  const result = useMemo(
    () =>
      calculateFinancing({
        priceCents,
        downPaymentCents: effectiveDownPayment,
        termMonths,
        interestRateBp,
        balloonCents: effectiveBalloon,
      }),
    [
      priceCents,
      effectiveDownPayment,
      termMonths,
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
        <p
          className="font-display tabular mt-1 text-4xl font-extrabold tracking-tight"
          aria-live="polite"
        >
          {formatEuroPrecise(result.monthlyPaymentCents)}
        </p>
        <p className="text-ink-muted mt-1.5 text-sm">
          {termMonths} Monate · {formatPercent(interestRateBp)} Sollzins p. a.
          {effectiveBalloon > 0 && (
            <> · Schlussrate {formatEuro(effectiveBalloon)}</>
          )}
        </p>

        <dl className="border-ink-border mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 text-sm">
          <div>
            <dt className="text-ink-muted">Finanzierungsbetrag</dt>
            <dd className="tabular mt-0.5 font-semibold">
              {formatEuro(result.financedAmountCents)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Zinsen gesamt</dt>
            <dd className="tabular mt-0.5 font-semibold">
              {formatEuro(result.totalInterestCents)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Effektiver Jahreszins</dt>
            <dd className="tabular mt-0.5 font-semibold">
              ca. {formatPercent(result.effectiveRateBp)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Gesamtbetrag</dt>
            <dd className="tabular mt-0.5 font-semibold">
              {formatEuro(result.totalCostCents)}
            </dd>
          </div>
        </dl>
      </div>

      {/* --- Eingaben ------------------------------------------------------ */}
      <div className="space-y-6">
        {priceEditable ? (
          <div className="space-y-2">
            <Label htmlFor="fin-price">Fahrzeugpreis</Label>
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
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Fahrzeugpreis</span>
            <span className="tabular font-semibold">{formatEuro(priceCents)}</span>
          </div>
        )}

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
          value={termMonths}
          min={config.minTermMonths}
          max={config.maxTermMonths}
          step={6}
          display={`${termMonths} Monate`}
          hint={`${(termMonths / 12).toLocaleString("de-AT", { maximumFractionDigits: 1 })} Jahre`}
          onChange={setTermMonths}
        />

        <SliderField
          id="fin-rate"
          label="Sollzinssatz p. a."
          value={interestRateBp}
          min={config.minInterestRateBp}
          max={config.maxInterestRateBp}
          step={10}
          display={formatPercent(interestRateBp)}
          hint={`Richtwert: ${formatPercent(config.defaultInterestRateBp)}`}
          onChange={setInterestRateBp}
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
      </div>

      {/* --- Pflichthinweis ------------------------------------------------ */}
      <p className="text-muted-foreground bg-muted/50 flex gap-2.5 rounded-lg p-4 text-xs leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{config.disclaimer}</span>
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
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <output htmlFor={id} className="tabular text-sm font-semibold">
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

/** Kompakte Variante für die Fahrzeugdetailseite. */
export function FinanceTeaser({
  config,
  priceCents,
}: {
  config: FinanceConfigDto;
  priceCents: number;
}) {
  const result = calculateFinancing({
    priceCents,
    downPaymentCents: applyBasisPoints(priceCents, config.defaultDownPaymentBp),
    termMonths: config.defaultTermMonths,
    interestRateBp: config.defaultInterestRateBp,
    balloonCents: applyBasisPoints(priceCents, config.defaultBalloonBp),
  });

  return (
    <p className="text-muted-foreground text-sm">
      Finanzierung ab{" "}
      <span className="text-foreground tabular font-semibold">
        {formatEuroPrecise(result.monthlyPaymentCents)}
      </span>{" "}
      pro Monat – bei {config.defaultTermMonths} Monaten Laufzeit,{" "}
      {formatEuro(result.financedAmountCents)} Finanzierungsbetrag und{" "}
      {bpToPercent(config.defaultInterestRateBp).toLocaleString("de-AT", {
        minimumFractionDigits: 2,
      })}{" "}
      % Sollzins p. a.
    </p>
  );
}
