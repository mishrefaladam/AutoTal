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

Meta verlangt zwei Schritte über `graph.instagram.com`. Welche Bilder
mitgehen, kann der Händler am Entwurf auswählen. Neue Entwürfe wählen alle
formal kompatiblen JPEG-/HTTPS-Bilder in Galerie-Reihenfolge bis zum Limit
aus (Position 0 zuerst, maximal 10). Die Auswahl bestehender Entwürfe bleibt
unverändert. Die tatsächliche Erreichbarkeit wird weiterhin vor Publishing geprüft.

**Ein Bild** (`publishInstagramImage`):

1. `POST /{instagram-user-id}/media` mit `image_url` und `caption`
2. Status-Polling am Container, bis `status_code = FINISHED`
3. `POST /{instagram-user-id}/media_publish` mit der Container-ID

**Zwei bis zehn Bilder – Carousel** (`publishInstagramCarousel`):

1. Je Bild `POST /{instagram-user-id}/media` mit `image_url` und
   `is_carousel_item=true` – ohne Caption, maximal drei Anfragen gleichzeitig.
   Die IDs bleiben trotz unterschiedlicher Antwortzeiten in Bildreihenfolge.
   Danach gemeinsame Polling-Runden, ebenfalls mit maximal drei Anfragen:
   nur offene Kinder prüfen, fertige entfernen, einmal pro Runde warten.
   Erst wenn alle `FINISHED` melden, geht es weiter. `ERROR`/`EXPIRED`
   bricht mit "Bild 3 von 5" ab, bevor ein Parent erstellt wird.
2. `POST /{instagram-user-id}/media` mit `media_type=CAROUSEL`,
   `children=<ids>` und der `caption`; wieder Polling bis `FINISHED`.
3. Genau ein `POST /{instagram-user-id}/media_publish` mit der
   Carousel-Container-ID.

Randbedingungen (laut Meta-Dokumentation, Content Publishing):

- Carousels sind auf **10 Elemente** begrenzt; die Zahl steht in
  `limits.ts` und wird in Oberfläche, Action und Protokoll geprüft.
- Nur JPEG wird angenommen; PNG/WebP-Bilder aus der Galerie werden vor der
  Veröffentlichung benannt abgewiesen.
- Jedes Bild muss über eine öffentliche HTTPS-URL abrufbar sein – vor dem
  ersten API-Aufruf prüft ein HEAD die Erreichbarkeit ("Bild 2 von 4 ist
  nicht erreichbar").
- Instagram lädt die Datei selbst; das Token wird nicht an die Bild-URL gehängt.
- Das aktuelle kontospezifische Limit wird über
  `/{instagram-user-id}/content_publishing_limit` gelesen. Ist die Abfrage
  vorübergehend nicht verfügbar, wird keine möglicherweise veraltete Zahl
  angezeigt oder erzwungen.
- Doppelpost-Schutz gilt für beide Wege: Die Media-ID wird sofort nach
  `media_publish` gespeichert; ein Entwurf mit `externalPostId` wird nie
  ein zweites Mal veröffentlicht, parallele Klicks blockiert eine Sperre am
  Entwurf. Ein Carousel wird nicht als halber Beitrag veröffentlicht.

### Performance-Diagnose

Vorher: Kind 1 erstellen und fertig abwarten, dann Kind 2 usw. Bei acht
Kindern mit jeweils 9 Sekunden Polling-Wartezeit waren so allein 72 Sekunden
künstliche Child-Wartezeit möglich. Jetzt reifen alle Kinder gemeinsam;
die gleiche Polling-Sequenz wartet insgesamt 9 Sekunden statt achtmal 9.
Creation-Anfragen laufen in einem Pool mit drei Workern. Das ist ein
Ablaufvergleich, keine gemessene Meta-Produktionsdauer oder Zeitgarantie.
Netzwerk, serielle HEAD-Vorprüfung, Parent und Meta-Verarbeitung kommen hinzu.

`Instagram carousel timings` protokolliert pro Versuch `durationsMs` mit
`quotaCheck`, `childCreation`, `childPolling`, `parentCreation`, `parentPolling`
und `mediaPublish` sowie `totalMs`, Bildanzahl, Parallelität und Ergebnis.
Auch abgebrochene Versuche protokollieren ihre bis dahin erreichten Phasen.
`mediaPublish` enthält gegebenenfalls den bestehenden kontrollierten
9007/2207027-Retry samt Statusprüfung. `totalMs` umfasst zusätzlich die
Persistierung und Permalink-Abfrage, nicht die vorgeschaltete HEAD-Prüfung
in der Server Action. Keine Tokens, Bild-URLs oder Caption in diesen Metriken.

Der Admin zeigt während des Aufrufs einen mehrstufigen Ablauftext. Die Server
Action liefert kein Live-Streaming; daher werden weder erfundene Prozentwerte
noch ein scheinbar aktueller Bildzähler angezeigt. Freigabe, Einzelbild-Flow,
Idempotenz und Reconcile bleiben unverändert. Keine neue Migration nötig.

## Auf Instagram gelöschte Beiträge

Löscht der Händler einen über AutoTal veröffentlichten Beitrag direkt in der
Instagram-App, gleicht AutoTal den lokalen Zustand ab – nie umgekehrt: Es gibt
bewusst keinen `DELETE /{media-id}`; Meta unterstützt das Löschen
veröffentlichter Feed-Medien über die API nicht verlässlich.

**Prüfung** (`getInstagramMediaExistence`): `GET /{media-id}?fields=id,permalink`.

- Antwort OK → der Beitrag existiert, `externalCheckedAt` wird gesetzt.
- HTTP 404, Code 100 mit Subcode 33 ("does not exist …") oder Code 803 →
  zusätzlich `GET /me`. Antwortet Instagram dort, ist der Zugang in Ordnung und
  der Beitrag fehlt wirklich → Status `DELETED_EXTERNALLY`. Scheitert `/me`,
  bleibt der Ausgang unbekannt – Metas Meldung nennt "does not exist" und
  "missing permissions" in einem Satz.
- Token-/Berechtigungsfehler (401, Code 190, Code 200), Limits (429, Code 4,
  Code 32), 5xx, Netzwerkfehler und alles Unbekannte → **keine** Änderung; die
  Prüfung wird beim nächsten Mal wiederholt.

**Wann:** Beim Öffnen von `/admin/social-media` (nur mit verbundenem Konto),
je Beitrag frühestens 10 Minuten nach der Veröffentlichung und danach höchstens
alle 30 Minuten, höchstens 20 Anfragen je Aufruf, neueste zuerst; bei Zugangs-
oder Limitproblemen bricht der Durchlauf ab. Zusätzlich sofort per
„Instagram-Status prüfen“ am Beitrag.

**Erneut veröffentlichen** (`republishDeletedDraft`): nur aus
`DELETED_EXTERNALLY`. Die Löschung wird bei Instagram noch einmal bestätigt,
dann wandert die alte Media-ID nach `previousExternalPostIds`, der Entwurf
fällt auf `APPROVED` zurück und geht den normalen Weg über `publishDraft` –
mit Sperre und sofortiger Speicherung der neuen `externalPostId`. Ein
`PUBLISHED`-Beitrag bleibt durch seine `externalPostId` weiterhin gegen jede
zweite Veröffentlichung gesperrt; Bearbeiten, Freigeben und direktes
Veröffentlichen eines extern gelöschten Beitrags werden abgewiesen.

## Freigabe und Fehler

Nur Entwürfe mit Status `APPROVED` dürfen veröffentlicht werden. Diese Prüfung
liegt in `src/modules/social/actions.ts` unmittelbar vor dem API-Aufruf und
kann nicht über die Oberfläche umgangen werden.

Die KI erstellt ausschließlich Entwürfe. Nach einer Textänderung fällt ein
Entwurf wieder auf `DRAFT` zurück und muss erneut freigegeben werden.

Fehlgeschlagene Veröffentlichungen erhalten den Status `FAILED`. Logs
enthalten nur Operation, Statuscodes und interne IDs, aber keine Access Tokens,
App Secrets, Request-Bodies oder Authorization-Header.
