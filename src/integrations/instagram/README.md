# Instagram-Integration

Veröffentlichung freigegebener Beiträge über die **Instagram API mit Instagram
Login**. Dieser Flow verbindet das Instagram-Konto direkt und benötigt keine
verknüpfte Facebook-Seite.

Offizielle Dokumentation:

- [Instagram API mit Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
- [Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)

## Voraussetzungen

- Professionelles Instagram-Konto vom Typ **Business** oder **Creator**
- Meta-Developer-App mit dem Produkt **Instagram**
- Einrichtung **Instagram > API setup with Instagram login**
- Advanced Access beziehungsweise erfolgreicher App Review für den
  Produktivbetrieb
- Öffentlich erreichbare HTTPS-Callback-URL

Eine Facebook-Seite und das Produkt Facebook Login sind für diesen Flow nicht
erforderlich.

## Meta-App einrichten

1. Im [Meta App Dashboard](https://developers.facebook.com/apps) eine App öffnen
   oder anlegen.
2. Das Produkt **Instagram** hinzufügen.
3. **API setup with Instagram login** auswählen.
4. Als Redirect-URI exakt eintragen:
   ```
   https://autotal.at/api/integrations/instagram/callback
   ```
5. Diese Berechtigungen konfigurieren und für den Produktivbetrieb freigeben:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
6. Die im Instagram-Produkt angezeigte **Instagram App ID** und das
   **Instagram App Secret** in Vercel hinterlegen.

Die Variablennamen bleiben absichtlich stabil:

```bash
INSTAGRAM_APP_ID=""
INSTAGRAM_APP_SECRET=""
INSTAGRAM_REDIRECT_URI="https://autotal.at/api/integrations/instagram/callback"
```

Keine echten Secrets in `.env.example`, Git oder den Browser übernehmen.

## OAuth- und Token-Ablauf

1. Der Admin startet **Instagram verbinden**.
2. Ein zufälliger `state`-Wert wird als HttpOnly-Cookie gesetzt.
3. Weiterleitung zu `https://www.instagram.com/oauth/authorize` mit
   `enable_fb_login=0`.
4. Der Callback prüft Admin-Sitzung und `state`, bevor der Code verwendet wird.
5. Der Code wird über `https://api.instagram.com/oauth/access_token` gegen ein
   kurzlebiges Instagram-Token getauscht.
6. Über `https://graph.instagram.com/access_token` wird ein langlebiges Token
   erzeugt.
7. `GET /me?fields=user_id,username` ermittelt den Professional Account direkt.
8. Token, Konto-ID, Benutzername, Scopes, Ablaufzeit und Verbindungszeit werden
   gespeichert.

Das Token wird mit AES-256-GCM verschlüsselt in `IntegrationCredential`
abgelegt und nie an den Browser ausgeliefert. Dafür muss ein stabiler
`ENCRYPTION_KEY` gesetzt sein:

```bash
openssl rand -base64 32
```

Wird der Schlüssel gewechselt, können vorhandene Tokens nicht mehr
entschlüsselt werden und das Konto muss neu verbunden werden.

## Token-Erneuerung

Langlebige Instagram-Tokens gelten ungefähr 60 Tage und können erneuert werden,
wenn sie mindestens 24 Stunden alt und noch gültig sind.

AutoTal versucht die Erneuerung serverseitig:

- beim Laden des Instagram-Verbindungsstatus
- unmittelbar vor dem Publishing
- sobald weniger als 14 Tage Restlaufzeit bestehen

Das erneuerte Token wird wieder verschlüsselt gespeichert und die Ablaufzeit
aktualisiert. Bei einem vorübergehenden Fehler bleibt das noch gültige Token
nutzbar; ein abgelaufenes Token verlangt eine neue Verbindung.

## Legacy-Verbindungen

Credentials aus dem früheren Facebook-basierten Flow enthalten nicht die neuen
`instagram_business_*`-Scopes. Sie werden nicht automatisch gelöscht. Der
Admin zeigt **Neu verbinden erforderlich**; erst ein erfolgreich abgeschlossener
Instagram-Login überschreibt das alte Credential.

## Veröffentlichen

Meta verlangt zwei Schritte über `graph.instagram.com`:

1. `POST /{instagram-user-id}/media` mit `image_url` und `caption`
2. `POST /{instagram-user-id}/media_publish` mit der Container-ID

Randbedingungen:

- Das Bild muss über eine öffentliche HTTPS-URL abrufbar sein.
- Instagram lädt die Datei selbst; das Token wird nicht an die Bild-URL gehängt.
- Das aktuelle kontospezifische Limit wird über
  `/{instagram-user-id}/content_publishing_limit` gelesen. Ist die Abfrage
  vorübergehend nicht verfügbar, wird keine möglicherweise veraltete Zahl
  angezeigt oder erzwungen.
- Aktuell wird nur das erste Bild eines Social-Media-Entwurfs veröffentlicht.
- **Instagram Carousel / mehrere Bilder sind noch nicht implementiert.**

## Freigabe und Fehler

Nur Entwürfe mit Status `APPROVED` dürfen veröffentlicht werden. Diese Prüfung
liegt in `src/modules/social/actions.ts` unmittelbar vor dem API-Aufruf und
kann nicht über die Oberfläche umgangen werden.

Die KI erstellt ausschließlich Entwürfe. Nach einer Textänderung fällt ein
Entwurf wieder auf `DRAFT` zurück und muss erneut freigegeben werden.

Fehlgeschlagene Veröffentlichungen erhalten den Status `FAILED`. Logs
enthalten nur Operation, Statuscodes und interne IDs, aber keine Access Tokens,
App Secrets, Request-Bodies oder Authorization-Header.
