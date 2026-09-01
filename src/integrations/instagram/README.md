# Instagram-Integration

Veröffentlichung freigegebener Beiträge über die **Meta Graph API**.

## Voraussetzungen

Meta erlaubt automatisches Veröffentlichen **nur** für Instagram-Konten vom Typ
*Business* oder *Creator*, die mit einer Facebook-Seite verknüpft sind. Für
Privatkonten gibt es keine Veröffentlichungs-Schnittstelle – das ist eine
Vorgabe von Meta, keine Einschränkung dieser Anwendung.

Vorbereitung im Instagram-Konto:

1. Konto auf **Business** oder **Creator** umstellen
   (Einstellungen → Konto → Kontotyp wechseln).
2. Mit einer **Facebook-Seite** verknüpfen.

## Meta-App einrichten

1. Auf [developers.facebook.com](https://developers.facebook.com/apps) eine App
   vom Typ **Business** anlegen.
2. Produkt **Facebook Login** hinzufügen.
3. Unter *Facebook Login → Einstellungen* die Redirect-URI eintragen –
   exakt dieselbe wie in `INSTAGRAM_REDIRECT_URI`:
   ```
   https://ihre-domain.at/api/integrations/instagram/callback
   ```
4. Folgende Berechtigungen anfordern:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `business_management`
5. App-ID und App-Geheimnis in die Umgebungsvariablen übernehmen:
   ```bash
   INSTAGRAM_APP_ID="…"
   INSTAGRAM_APP_SECRET="…"
   INSTAGRAM_REDIRECT_URI="https://ihre-domain.at/api/integrations/instagram/callback"
   ```

> **App-Überprüfung:** Solange die App im Entwicklungsmodus ist, funktioniert
> sie nur mit Konten, die als Administrator, Entwickler oder Tester der App
> eingetragen sind. Für den Regelbetrieb muss die App von Meta überprüft
> werden. Damit sind mehrere Werktage Bearbeitungszeit einzuplanen.

## Verbinden

Im Admin unter **Integrationen → Instagram-Konto verbinden**. Der Ablauf:

1. Ein zufälliger `state`-Wert wird als HttpOnly-Cookie gesetzt (CSRF-Schutz).
2. Weiterleitung zum Meta-Anmeldedialog.
3. Beim Rücksprung wird geprüft: Ist ein Admin angemeldet? Stimmt der `state`?
4. Der Code wird gegen ein langlebiges Token (rund 60 Tage) getauscht.
5. Das Token wird **mit AES-256-GCM verschlüsselt** in `IntegrationCredential`
   abgelegt (siehe `src/lib/crypto.ts`) und niemals an den Browser geliefert.

Dafür muss `ENCRYPTION_KEY` gesetzt sein:

```bash
openssl rand -base64 32
```

> Wird `ENCRYPTION_KEY` gewechselt, sind alle gespeicherten Tokens unlesbar
> und die Integration muss neu verbunden werden.

## Veröffentlichen

Meta verlangt zwei Schritte:

1. `POST /{ig-user-id}/media` – Medien-Container mit `image_url` und `caption`
2. `POST /{ig-user-id}/media_publish` – Container veröffentlichen

Wichtige Randbedingungen:

- Das Bild muss unter einer **öffentlich erreichbaren URL** liegen; Meta lädt
  es selbst herunter. Ein Upload vom Server ist nicht vorgesehen.
- Format JPEG, maximal 8 MB.
- Höchstens 50 Beiträge in 24 Stunden pro Konto.
- Bildunterschrift maximal 2.200 Zeichen inklusive Hashtags.

## Das Freigabe-Gate

Veröffentlicht werden darf ausschließlich ein Entwurf mit dem Status
`APPROVED`. Diese Prüfung sitzt in `publishDraft()`
(`src/modules/social/actions.ts`) unmittelbar vor dem API-Aufruf – **nicht** in
der Oberfläche. Auch ein direkter Aufruf der Server Action kann sie nicht
umgehen.

Wird ein bereits freigegebener Text nachträglich bearbeitet, fällt er
automatisch auf `DRAFT` zurück und muss erneut freigegeben werden. Sonst ließe
sich ein geprüfter Text austauschen und mit alter Freigabe veröffentlichen.

Die KI veröffentlicht nie selbst: `generateCaption()` schreibt ausschließlich
einen Entwurf mit Status `DRAFT`.

## Wenn etwas schiefgeht

Fehlgeschlagene Veröffentlichungen erhalten den Status `FAILED` samt einer
verständlichen Meldung im Admin; ein erneuter Versuch ist über
„Erneut versuchen“ möglich (US-24). Die Rohantwort von Meta bleibt im
Serverlog – sie kann Kontodetails enthalten.

Häufige Ursachen:

| Symptom | Ursache |
| --- | --- |
| „Zugang wurde abgelehnt“ | Token abgelaufen oder entzogen → neu verbinden |
| „Veröffentlichungslimit erreicht“ | mehr als 50 Beiträge in 24 Stunden |
| „Bild konnte nicht geladen werden“ | Bild-URL nicht öffentlich erreichbar, kein JPEG oder über 8 MB |
| „Kein Instagram-Business-Konto gefunden“ | Konto ist privat oder nicht mit einer Facebook-Seite verknüpft |

## Token-Erneuerung

Langlebige Tokens gelten rund 60 Tage. Der Admin warnt, sobald weniger als
sieben Tage verbleiben.

TODO(betrieb): Eine automatische Verlängerung ist noch nicht umgesetzt.
Gebraucht würde ein geplanter Aufruf, der das Token über
`GET /oauth/access_token?grant_type=fb_exchange_token` erneuert. Bis dahin
genügt es, die Verbindung im Admin rechtzeitig neu herzustellen.
