# Fahrzeugquellen (VehicleProvider)

Die Anwendung bezieht Fahrzeugdaten **ausschließlich** über das Interface
`VehicleProvider` (`types.ts`). Kein Seiten-, Komponenten- oder Sync-Code kennt
einen konkreten Anbieter.

```
listVehicles(options?) -> { vehicles, nextCursor, isCompleteInventory }
getVehicleById(externalId) -> ProviderVehicle | null
isConfigured() -> boolean
```

## Warum diese Trennung

Der Fahrzeugbestand wechselt im Laufe der Zeit die Quelle – heute eine
Fahrzeugverwaltung, morgen ein Marktplatz, dazwischen eine CSV-Übergabe. Ohne
die Abstraktion würde jeder Wechsel die halbe Anwendung berühren. Mit ihr ist
eine neue Quelle eine Datei plus ein Eintrag in `index.ts`.

## Aktive Quelle wählen

Über die Umgebungsvariable:

```bash
VEHICLE_PROVIDER="mock"       # Testdaten, Standard
VEHICLE_PROVIDER="autopro24"  # vorbereitet, noch nicht angebunden
VEHICLE_PROVIDER="willhaben"  # vorbereitet, noch nicht angebunden
```

Der Status jeder Quelle steht im Admin unter **Integrationen**.

## Stand der Anbindungen

| Quelle | Status | Was fehlt |
| --- | --- | --- |
| `mock` | einsatzbereit | – |
| `autopro24` | Adapter vorbereitet | Offizielle API-Dokumentation und Händler-Zugangsdaten |
| `willhaben` | Adapter vorbereitet | Offizieller Schnittstellenzugang über den Händlervertrag |

### Kein Scraping

Willhaben untersagt das automatisierte Auslesen der Website. Unabhängig davon
wäre ein Scraper die instabilste denkbare Grundlage für einen Fahrzeugbestand:
Jede Layout-Änderung beim Anbieter würde die Website leeren.

Deshalb sind für `autopro24` und `willhaben` **keine API-Endpunkte erfunden**
worden. Beide Adapter melden über `isConfigured() === false`, dass sie nicht
einsatzbereit sind, und werfen bei Benutzung eine erklärende Fehlermeldung.
In der Praxis läuft die Bestandspflege österreichischer Händler ohnehin meist
über eine Fahrzeugverwaltung wie autoPro24, die dann selbst auf Willhaben
publiziert – die Anbindung an autoPro24 ist daher der wahrscheinlichere Weg.

## Einen echten Provider anbinden

1. `pending-provider.ts` als Basis verlassen und `VehicleProvider` direkt
   implementieren.
2. `isConfigured()` prüft, ob alle Umgebungsvariablen gesetzt sind.
3. `listVehicles()` paginiert über den Bestand des Anbieters.
   `isCompleteInventory` darf **nur dann `true`** sein, wenn der komplette
   Bestand geliefert wurde – nur dann deaktiviert der Sync fehlende
   Fahrzeuge (US-07). Bei einem Teilergebnis würde er sonst den halben
   Bestand von der Website nehmen.
4. Die Anbieterfelder auf `ProviderVehicle` abbilden. Dabei beachten:
   - Preise in **Cent** (`priceCents`), nicht in Euro.
   - Erstzulassung als `Date`, nicht als String.
   - Kraftstoff und Getriebe auf die Enums `FuelType` / `TransmissionType`
     abbilden; unbekannte Werte auf `OTHER` statt auf einen Rateversuch.
   - `externalId` muss über Syncs hinweg **stabil** sein – daraus entsteht
     die öffentliche URL des Fahrzeugs.
   - `status` steuert die Sichtbarkeit: nur `"available"` bleibt online.
5. Den Bildhost in `next.config.ts` unter `images.remotePatterns` ergänzen,
   sonst blockiert `next/image` die Auslieferung.
6. In `index.ts` registrieren.

Alles Übrige – Übersicht, Filter, Detailseite, Sitemap, Sync-Protokoll –
funktioniert danach unverändert.

## Testdaten

`mock/data.ts` enthält 14 Fahrzeuge (13 verfügbar, 1 verkauft). Das verkaufte
Fahrzeug ist Absicht: Damit lässt sich prüfen, dass entfernte Fahrzeuge
tatsächlich von der Website verschwinden (US-07).

Die Bilder sind generische Automobil-Aufnahmen von Unsplash und zeigen **nicht**
das jeweils beschriebene Fahrzeug. Für den Echtbetrieb liefert der angebundene
Provider die tatsächlichen Fotos.
