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

Derzeit ist **keine** CSP gesetzt (`next.config.ts` enthält nur
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` und HSTS).

Das ist Absicht: Welche Domains das Widget lädt, ist unbekannt. Eine CSP
aufzusetzen, bevor der Code vorliegt, würde das Widget beim Einbau blockieren.

Sobald der Code da ist, gehören mindestens diese Direktiven geprüft und um die
tatsächlich verwendeten willhaben-Domains ergänzt:

```
frame-src    <Widget-Domains>    falls iframe
script-src   <Widget-Domains>    falls externes Script
img-src      <Bild-Domains>      Fahrzeugfotos
connect-src  <API-Domains>       falls das Widget nachlädt
style-src    <Style-Domains>     falls externes CSS
```

Die konkreten Hostnamen sind bei willhaben zu erfragen – siehe „Offene Punkte“.

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
