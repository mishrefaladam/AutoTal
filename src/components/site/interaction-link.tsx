"use client";

import type { ComponentPropsWithRef } from "react";

import type { InteractionChannel } from "@/generated/prisma/enums";

/**
 * Ausgehender Link, dessen Klick gezählt wird.
 *
 * Ersetzt ein gewöhnliches `<a>` überall dort, wo die Website den Besucher
 * hinausschickt: Telefon, WhatsApp, E-Mail, Fahrzeugplattformen, Instagram.
 *
 * WAS GEZÄHLT WIRD: dass die Schaltfläche gedrückt wurde. Sonst nichts. Es
 * entsteht kein CRM-Lead, es wird nichts Personenbezogenes übertragen – die
 * Meldung besteht aus einem einzigen Wort, dem Kanal. Siehe
 * src/modules/interactions/channels.ts und den Endpunkt unter
 * src/app/api/interactions/route.ts.
 *
 * WARUM `sendBeacon`: Der Klick führt weg von der Seite. Ein `fetch` würde vom
 * Browser beim Verlassen abgebrochen, und ein `await` davor würde die
 * Navigation verzögern – der Besucher soll nicht auf eine Statistik warten.
 * `sendBeacon` stellt die Meldung in eine Warteschlange, die der Browser noch
 * abarbeitet, nachdem die Seite verlassen wurde.
 *
 * Fehlt die Funktion oder schlägt sie fehl, passiert nichts weiter: Der Link
 * funktioniert unverändert. Ohne JavaScript ebenso – dann wird eben nicht
 * gezählt. Der Zähler darf nie zwischen Besucher und Telefonnummer stehen.
 */
export function InteractionLink({
  channel,
  onClick,
  ...props
}: ComponentPropsWithRef<"a"> & {
  /**
   * `null` zählt nichts und rendert ein gewöhnliches `<a>`. Erlaubt Listen,
   * in denen nur ein Teil der Einträge zu einem bekannten Kanal gehört – etwa
   * die Social-Media-Links, von denen nur Instagram gezählt wird.
   */
  channel: InteractionChannel | null;
}) {
  return (
    <a
      {...props}
      onClick={(event) => {
        if (channel === null) {
          onClick?.(event);
          return;
        }

        // Erst die eigene Zählung, dann das übergebene Verhalten – falls ein
        // Aufrufer den Klick abbricht, wurde immerhin nichts Falsches gezählt:
        // Der Besucher hat die Schaltfläche ja tatsächlich gedrückt.
        try {
          navigator.sendBeacon?.(
            "/api/interactions",
            new Blob([JSON.stringify({ channel })], {
              type: "application/json",
            }),
          );
        } catch {
          // Zählen ist Beiwerk. Ein Fehler hier darf den Link nicht stören.
        }

        onClick?.(event);
      }}
    />
  );
}
