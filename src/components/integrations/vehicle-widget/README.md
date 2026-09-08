# Fahrzeugbörse

Der öffentliche Fahrzeugbestand wird **nicht** von dieser Website verwaltet.
Er kommt aus einem Widget, das willhaben bereitstellt und einbetten lässt.

```
/fahrzeuge  ->  VehicleWidget  ->  Widget Lite | Carport
```

Die Seite `/fahrzeuge` kennt den konkreten Anbieter nicht. Ein Wechsel betrifft
`config.ts` und das jeweilige Embed-Modul – nicht Seite, Navigation oder Layout.

## Dateien

| Datei | Zweck |
| --- | --- |
| `config.ts` | Welcher Anbieter aktiv ist, Typen, Beschriftungen |
| `VehicleWidget.tsx` | Abstraktion; wählt den Anbieter und behandelt den Fall „kein Code“ |
| `willhaben-lite.tsx` | **Hier gehört der Widget-Lite-Einbettungscode hinein** |
| `carport.tsx` | Vorbereitet für den späteren Wechsel |

## Warum keine Umgebungsvariable für den Anbieter

Der Anbieter wechselt genau einmal – und zwar zusammen mit einem Deployment,
weil der Einbettungscode selbst im Code liegt. Eine Umgebungsvariable würde
suggerieren, man könne zur Laufzeit umschalten. Kann man nicht, solange der
Code des jeweiligen Anbieters nicht hinterlegt ist.

Kundenspezifische Kennungen (Händler-ID o. ä.) gehören dagegen sehr wohl in
eine Umgebungsvariable. Welche Widget Lite überhaupt benötigt, ist noch nicht
bekannt – deshalb existiert dafür noch keine Variable.

## Zustände

`VehicleWidget` kennt drei Fälle:

| Fall | Anzeige |
| --- | --- |
| Code vorhanden | Das Widget |
| Code fehlt, Entwicklung | Platzhalter mit Hinweis, wo der Code einzusetzen ist |
| Code fehlt, **Produktion** | Neutrale Meldung für Besucher **plus** Fehlereintrag im Log |

In der Produktion wird ein fehlender Einbettungscode also nie stillschweigend
verschluckt. Der Besucher bekommt trotzdem keine technischen Details zu sehen.

## Sicherheit

- Nur offizieller Code von willhaben verwenden – nichts nachbauen, nichts raten
- Kein `dangerouslySetInnerHTML`
- Für ein `<script>` `next/script` mit `strategy="afterInteractive"` verwenden
- Keine URL-Parameter ungeprüft an das Widget weiterreichen
- Keine vom Nutzer eingegebenen Script-Tags ausführen

### Content Security Policy

`next.config.ts` setzt eine CSP, die bewusst **kein** `script-src`, `img-src`,
`connect-src` oder `style-src` enthält – nur `base-uri`, `object-src`,
`frame-ancestors` und `upgrade-insecure-requests`. Diese Direktiven sind für
das Widget folgenlos und trotzdem wirksam.

Der Grund für die Lücke: Widget Lite lädt Code und Daten von mehreren Hosts
nach, und die Liste ist aus dem Quelltext nicht vollständig ableitbar. Aus
`loader.js` und `widget.js` (Stand 08.09.2026) ist belegt:

| Zweck | Host | Direktive |
| --- | --- | --- |
| Loader, `splide.js`, `widget.js`, Platzhalterbild | `widget-lite.willhaben.at` | `script-src`, `img-src` |
| `version.txt`, Fahrzeugdaten als JSON | `widget-lite.willhaben.at`, `gms.autopro24.at` | `connect-src` |
| Matomo-Zählung (`disableCookies`, ohne Einwilligungsabfrage) | `stats.ap24-carports.at` | `script-src`, `connect-src` |
| Eingebettete Karte | `maps.google.com`, `www.google.com` | `frame-src` |
| Verlinkung ins Inserat | `www.willhaben.at`, `motornetzwerk.willhaben.at` | – (Navigation) |

Nicht belegbar sind die **Hostnamen der Fahrzeugfotos**: Sie stehen erst in
der JSON-Antwort (`vehicle.images`), nicht im Code. Eine unvollständige
`img-src`-Liste würde die Galerie still leeren.

Ebenfalls zu beachten: das Widget legt zur Laufzeit `<style>`- und
`<link>`-Elemente an (`style-src` bräuchte daher `'unsafe-inline'`), und der
Loader hängt weitere `<script>`-Elemente ein (ein reiner Host-Allowlist-Ansatz
genügt dafür, `strict-dynamic` ist nicht nötig). In `widget.js` steckt ein
`new Function`-Aufruf aus SweetAlert2; er wird nur erreicht, wenn ein
`<swal-function-param>`-Element im DOM steht – das passiert hier nicht,
`'unsafe-eval'` sollte also entbehrlich sein. Bestätigt ist das nicht.

**Bevor `script-src`/`img-src`/`connect-src`/`style-src` scharf geschaltet
werden**, gehört die Policy zuerst als `Content-Security-Policy-Report-Only`
ausgeliefert und `/fahrzeuge` im Browser durchgeklickt (Liste, Detailansicht,
Bildergalerie, Karte) – die Konsole nennt dann die fehlenden Hosts. Erst
danach umstellen. Blind gesetzt bricht die Fahrzeugliste, und das fällt
möglicherweise erst auf, wenn jemand anruft.

## Layout

Der Container gibt nur die Breite vor und kapselt horizontalen Überlauf
(`overflow-x-auto`), damit ein zu breites Widget nicht die ganze Seite
verschiebt. Das Widget selbst wird **nicht** per CSS manipuliert; in ein
fremdes iframe hineinzugestalten ist ohnehin nicht möglich und wäre auch nicht
gewollt – Design und Funktionsumfang von Widget Lite sind laut willhaben nicht
anpassbar.

## Offene Punkte

Von willhaben werden noch benötigt:

1. Der **Einbettungscode** für Widget Lite
2. Die **Art der Einbettung** – iframe, Script, HTML-Container oder Kombination
3. Die **Domains**, die das Widget kontaktiert (für die CSP)
4. Ob eine **kundenspezifische Kennung** nötig ist (dann als Umgebungsvariable)
5. Ob das Widget eine **feste Höhe** braucht oder sich selbst anpasst
6. Verhalten auf **Mobilgeräten**
