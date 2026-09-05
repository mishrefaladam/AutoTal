import { Fragment } from "react";

/**
 * Langsam laufende Leiste als Übergang zwischen zwei großen Abschnitten.
 *
 * Rein in CSS gelöst – kein JavaScript, kein State, keine Server-Client-Grenze.
 * Der Streifen besteht aus zwei identischen Hälften; die Animation verschiebt
 * die Spur um genau eine Hälfte und springt dann zurück. Dadurch läuft sie
 * nahtlos, ohne dass beim Umschlag eine Lücke entsteht.
 *
 * Die zweite Hälfte ist aria-hidden: Sie wiederholt nur und soll nicht ein
 * zweites Mal vorgelesen werden.
 */
export function Marquee({ companyName }: { companyName: string }) {
  // Nur Aussagen, die die Website an anderer Stelle auch einlöst –
  // Fahrzeugprüfung, Finanzierungsrechner, Ankaufformular, Beratung.
  const items = [
    "Geprüfte Fahrzeuge",
    "Finanzierung möglich",
    "Fahrzeugankauf",
    "Persönliche Beratung",
    companyName,
  ];

  const half = (duplicate: boolean) => (
    <div className="marquee-half" aria-hidden={duplicate || undefined}>
      {items.map((item) => (
        <Fragment key={item}>
          <span className="marquee-item">{item}</span>
          <span aria-hidden="true" className="marquee-dot" />
        </Fragment>
      ))}
    </div>
  );

  return (
    <div className="bg-ink text-ink-foreground marquee">
      <div className="marquee-track">
        {half(false)}
        {half(true)}
      </div>
    </div>
  );
}
