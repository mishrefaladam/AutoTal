# AutoTal – Autohaus-Webplattform

Fahrzeugbestand, Finanzierung, Kontakt- und Ankaufformulare, Adminbereich und
KI-gestützte Social-Media-Beiträge. Next.js 16, TypeScript, PostgreSQL.

---

## Schnellstart

```bash
# 1. Abhängigkeiten
npm install

# 2. Datenbank (macOS/Homebrew)
brew install postgresql@17
brew services start postgresql@17
createdb autotal

# 3. Konfiguration
cp .env.example .env
#    DATABASE_URL eintragen
#    AUTH_SECRET und ENCRYPTION_KEY erzeugen:
openssl rand -base64 32

# 4. Schema und Testdaten
npm run db:migrate
npm run db:seed

# 5. Los
npm run dev
```

Danach: <http://localhost:3000> – Adminbereich unter `/admin/login` mit den
Zugangsdaten aus `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

Die Website läuft auch ohne Resend, OpenAI und Instagram – fehlt ein Key,
blendet die Oberfläche die Funktion aus oder meldet es verständlich, statt
stillschweigend zu scheitern. Der öffentliche Fahrzeugbestand kommt aus dem
willhaben Widget Lite; solange der offizielle Einbettungscode fehlt, zeigt
`/fahrzeuge` eine neutrale Hinweismeldung.

---

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbuild (inkl. `prisma generate`) |
| `npm run typecheck` | Next-Routetypen erzeugen und TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (ohne Datenbank) |
| `npm run test:db:setup` | Testdatenbank anlegen und migrieren |
| `npm run test:db` | Alle Tests gegen die Testdatenbank |
| `npm run check` | Typecheck + Lint + Tests + Build |
| `npm run db:migrate` | Migration erstellen und anwenden |
| `npm run db:seed` | Grunddaten und optional ersten Admin anlegen |
| `npm run db:studio` | Prisma Studio |

---

## Architektur

```
src/
  app/
    (public)/          Öffentliche Seiten mit Kopf- und Fußzeile
    admin/
      login/           Anmeldung (außerhalb des geschützten Layouts)
      (protected)/     Alles hinter requireAdmin()
    api/               Auth.js, Instagram-Callback, Admin-Uploads
  components/
    integrations/
      vehicle-widget/  Fahrzeugbörse (willhaben Widget Lite)
    ui/                shadcn/ui-Primitiven
    site/              Kopfzeile, Fußzeile, Layoutbausteine
    forms/             Formulare und Formularbausteine
    admin/             Oberfläche des Adminbereichs
    financing/         Finanzierungsrechner
  modules/             Fachlogik, unabhängig von der UI
    vehicles/          Erfasste Fahrzeuge (Datenbasis Social Media)
    financing/         Rechner, Konfiguration
    company/           Unternehmensdaten, Öffnungszeiten
    social/            KI-Entwürfe, Freigabe, Veröffentlichung
    forms/             Schemata und Server Actions
    admin/             Autorisierung, An- und Abmeldung
  integrations/        Externe Dienste, jeweils hinter einer Schnittstelle
    resend/            E-Mail
    openai/            Caption-Generierung
    instagram/         Graph API
  lib/                 Querschnitt: Prisma, Env, Geld, Krypto, Rate Limiting
```

**Die Trennung ist keine Kosmetik.** `modules/` kennt kein React, `components/`
kein Prisma, und `integrations/` kapselt externe Dienste wie Resend, OpenAI,
Instagram und Speicher.

### Fahrzeugbörse / willhaben Integration

Der öffentliche Fahrzeugbestand wird **nicht** von dieser Website verwaltet.
Er kommt aus dem **willhaben Widget Lite**, das in `/fahrzeuge` eingebettet
wird.

```
/fahrzeuge  ->  VehicleWidget  ->  Widget Lite
```

Stand laut technischer Rückmeldung von willhaben Motornetzwerk:

- **Widget Lite ist im Vertrag des Kunden enthalten.**
- Den **Einbettungscode stellt willhaben bereit** – er liegt uns noch nicht vor.
- Design und Funktionsumfang von Widget Lite sind **nicht anpassbar**.
- Es gibt für diesen Händler **keinen individuellen API-Zugang**.
- Die im Vertrag erwähnte Export-Schnittstelle ist **keine API für diese
  Website** – sie dient dem Export aus willhabenPro zu anderen Plattformen.
- Änderungen auf willhaben erscheinen laut Anbieter **unmittelbar** im Widget.
- Deshalb gibt es hier **keine eigene Synchronisierung, keinen
  Zwischenspeicher, kein Scraping**.
- Ein späterer Wechsel auf das kostenpflichtige **Carport Widget** ist
  vorgesehen.

**Der echte Einbettungscode ist noch einzufügen** – in
[`willhaben-lite.tsx`](src/components/integrations/vehicle-widget/willhaben-lite.tsx),
markiert mit `TODO: Insert official willhaben Widget Lite embed code here`.
Danach `EMBED_AVAILABLE` auf `true` setzen.

Solange der Code fehlt:

| Umgebung | Anzeige |
| --- | --- |
| Entwicklung | Platzhalter mit Hinweis auf die Einfügestelle |
| Produktion | Neutrale Meldung für Besucher **plus** Fehlereintrag im Log |

**CSP:** Derzeit ist bewusst keine Content Security Policy gesetzt – welche
Domains das Widget lädt, ist unbekannt, und eine CSP vorab würde es
blockieren. Nach Erhalt des Codes anpassen; Details in
[der Integrations-README](src/components/integrations/vehicle-widget/README.md).

### Migration Widget Lite → Carport

Falls Widget Lite optisch oder funktional nicht ausreicht:

1. **Carport bei willhaben bestellen** (kostenpflichtig).
2. **Code und Integrationsinformationen** von willhaben erhalten – inklusive
   der Domains, die das Widget kontaktiert.
3. **Integration ersetzen:** Code in
   [`carport.tsx`](src/components/integrations/vehicle-widget/carport.tsx)
   einsetzen, `EMBED_AVAILABLE` auf `true` setzen und in
   [`config.ts`](src/components/integrations/vehicle-widget/config.ts)
   `VEHICLE_WIDGET_PROVIDER` auf `"carport"` umstellen.
4. **CSP prüfen** und die Domains des neuen Widgets freigeben.
5. **Responsives Verhalten testen** – vor allem auf dem Smartphone, und dass
   die Seite nicht horizontal scrollt.
6. **Smoke Test in der Produktion:** `/fahrzeuge` aufrufen, prüfen dass
   Fahrzeuge erscheinen und kein Konfigurationsfehler im Log steht.

Seite, Navigation, Layout und übrige Logik bleiben dabei unverändert.

### Fahrzeuge im Admin (Datenbasis für Social Media)

Unter `/admin/fahrzeuge` erfasste Fahrzeuge erscheinen **nicht** auf der
öffentlichen Website – dort zeigt ausschließlich das Widget den Bestand.

Sie dienen allein der **Social-Media-Funktion**: Fahrzeug auswählen, Caption
erzeugen lassen, prüfen, freigeben, veröffentlichen. Ohne strukturierten
Zugriff auf die Widget-Daten braucht die KI eine eigene, verlässliche
Datenquelle – und aus dem Widget zu lesen wäre Scraping.

> **Offene Integration:** Sobald willhaben eine offizielle strukturierte
> Datenquelle bereitstellt, kann sie diese manuelle Erfassung ersetzen. Bis
> dahin bleibt die doppelte Pflege für Social-Media-Beiträge bestehen.

### Bilder

Hochgeladene Fahrzeugbilder laufen über `src/integrations/storage`:

| Umgebung | Speicher | Voraussetzung |
| --- | --- | --- |
| Produktion | Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| Entwicklung | `public/uploads/` | – |

Auf Vercel ist das Dateisystem zur Laufzeit schreibgeschützt und bei jedem
Deployment leer. Ohne Blob-Store lassen sich dort also **keine** Bilder
hochladen; der Admin weist beim Bearbeiten eines Fahrzeugs darauf hin.

Der Upload läuft über einen Route Handler
(`/api/admin/vehicles/[id]/images`) statt über eine Server Action: Actions
haben ein knappes Body-Limit, Fahrzeugfotos liegen regelmäßig darüber.
Erlaubt sind JPEG, PNG und WebP bis 8 MB, höchstens 30 Bilder je Fahrzeug.
Das erste Bild ist das Titelbild.

### Konventionen

- **Geld** liegt als ganzzahlige **Cent**-Werte vor (`priceCents`).
- **Prozentsätze** als ganzzahlige **Basispunkte** (`599` = 5,99 %).
  Beides vermeidet Gleitkomma-Drift und Decimal-Objekte über die
  Server/Client-Grenze. Umrechnung in [`src/lib/money.ts`](src/lib/money.ts).
- **Filter stehen in der URL**, nicht im Client-State. Ergebnisse bleiben
  teilbar, der Zurück-Button funktioniert, die Liste wird serverseitig
  gerendert.
- **Server Actions geben nie Exceptions an den Client**, sondern ein
  `ActionResult` mit einer für Nutzer verständlichen Meldung
  ([`src/lib/result.ts`](src/lib/result.ts)).

---

## Sicherheit

- **Autorisierung serverseitig.** Der Next-Proxy prüft nur das signierte
  Token. Jede Adminseite und jede Admin-Action ruft zusätzlich
  `requireAdmin()` bzw. `requireAdminForAction()` auf und prüft gegen die
  Datenbank – sonst hätte ein gerade gesperrter Zugang bis zum Ablauf des
  Tokens weiter Zugriff.
- **Passwörter** als bcrypt-Hash (Kostenfaktor 12). Bei unbekannter
  E-Mail-Adresse wird trotzdem ein Hash-Vergleich durchgeführt, damit die
  Antwortzeit nicht verrät, welche Adressen existieren.
- **Integrations-Tokens** liegen AES-256-GCM-verschlüsselt in der Datenbank
  und werden nie an den Client ausgeliefert.
- **Rate Limiting** aller öffentlichen Formulare, datenbankgestützt – ein
  In-Memory-Zähler wäre auf serverless Instanzen wirkungslos.
- **Keine Secrets im Client.** Server-Module sind mit `server-only` markiert;
  ein versehentlicher Import in eine Client-Komponente bricht den Build.
- **Logs** filtern Passwörter, Tokens, E-Mail-Adressen und Telefonnummern
  ([`src/lib/logger.ts`](src/lib/logger.ts)).
- **Formulardaten werden nicht gespeichert**, sondern ausschließlich per
  Resend versendet. Wer das ändert, muss die Datenschutzerklärung anpassen.

---

## KI und Instagram

Der Ablauf ist bewusst eine Kette manueller Schritte:

```
Fahrzeug wählen → Text erzeugen → prüfen/bearbeiten → freigeben → veröffentlichen
```

Zwei Regeln sind im Code verankert, nicht in der Oberfläche:

1. **Die KI veröffentlicht nie selbst.** `generateCaption()` schreibt
   ausschließlich einen Entwurf mit Status `DRAFT`.
2. **Nur `APPROVED` darf raus.** Die Prüfung sitzt in `publishDraft()`
   unmittelbar vor dem API-Aufruf. Auch ein direkter Aufruf der Server Action
   kann sie nicht umgehen. Wird ein freigegebener Text nachträglich
   bearbeitet, fällt er automatisch auf `DRAFT` zurück.

**Keine erfundenen Fahrzeugdaten:** Neben Prompt-Regeln und der Beschränkung
auf tatsächlich vorhandene Felder wird die Ausgabe nachgeprüft. Enthält der
Text einen Euro-Betrag oder eine Kilometerangabe, muss diese exakt zum
Fahrzeug passen – sonst wird der Entwurf verworfen
(`verifyCaptionFacts`, abgesichert durch Tests).

Einrichtung von Instagram: [Anleitung](src/integrations/instagram/README.md).
Benötigt wird ein Instagram-**Business**-Konto mit verknüpfter Facebook-Seite;
für Privatkonten stellt Meta keine Veröffentlichungs-Schnittstelle bereit.

---

## Deployment (Vercel)

1. **Datenbank** bereitstellen (Neon, Supabase oder Vercel Postgres) und
   `DATABASE_URL` als Umgebungsvariable hinterlegen.
2. **Umgebungsvariablen** aus `.env.example` übernehmen. Pflicht sind
   `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` und
   `NEXT_PUBLIC_SITE_URL`.
3. **Migrationen** für die Produktionsdatenbank ausführen:
   ```
   npm run db:deploy
   ```
4. **Ersten Admin anlegen**: `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD`
   temporär setzen und `npm run db:seed` einmalig ausführen. Passwort danach
   ändern und die Seed-Variablen wieder entfernen. Beispielfahrzeuge werden in
   `NODE_ENV=production` nicht angelegt.
5. **Vercel Blob** anlegen, wenn Fahrzeugbilder im Admin hochgeladen werden
   sollen. Vercel setzt dann `BLOB_READ_WRITE_TOKEN`.
6. **willhaben Widget-Lite-Einbettungscode** einsetzen, sobald willhaben den
   offiziellen Code bereitstellt.

### Vor dem Livegang

Eingetragen sind: Firmenwortlaut (`Autotal e.U.` – Schreibweise laut
Firmenbuch), Anschrift, Telefon, WhatsApp, E-Mail, Öffnungszeiten,
Firmenbuchnummer `FN 648226z`, Gewerbewortlaut, Aufsichtsbehörde
(BH Gänserndorf), GISA-Zahl `38118555` und der Inhaber.

Noch offen:
- [ ] **willhaben Widget-Lite-Einbettungscode** einsetzen — ohne ihn zeigt
      `/fahrzeuge` keine Fahrzeuge. Siehe „Fahrzeugbörse / willhaben
      Integration“.
- [ ] **Resend einrichten** — ohne API-Key kommt keine Formularanfrage an.
      Empfänger (`CONTACT_INBOX_EMAIL`) ist bereits `autotal.office@gmail.com`.
      **Als Absender geht Gmail nicht:** Resend versendet nur über eine
      verifizierte eigene Domain. Es braucht also eine Domain (z. B.
      `autotal.at`), dort die DNS-Einträge von Resend hinterlegen und
      `RESEND_FROM_EMAIL` darauf setzen – etwa
      `AutoTal <website@autotal.at>`.
- [ ] **UID-Nummer** — steht nicht im Gewerbeschein, kommt vom Finanzamt. Ein
      e.U. unter der Kleinunternehmergrenze hat unter Umständen gar keine.
- [ ] **Firmenbuchgericht** — steht im Firmenbuchauszug. Für den Bezirk
      Gänserndorf voraussichtlich das Landesgericht Korneuburg; das ist zu
      bestätigen und wurde bewusst nicht geraten.
- [ ] **Kammerzugehörigkeit prüfen** — im Impressum noch pauschal als
      „Fachgruppe Fahrzeughandel“ angegeben.
- [ ] **Finanzierungspartner** ersetzen — stehen noch als „Finanzierungspartner
      1–3“, bewusst ohne echte Banknamen.
- [ ] Social-Media-Profile eintragen, falls vorhanden.
- [ ] Impressum und Datenschutz juristisch prüfen lassen.
- [ ] Auftragsverarbeitungsverträge mit Resend und dem Hoster abschließen.
- [ ] Produktionsdatenbank anlegen; in Vercel setzen: `DATABASE_URL`,
      `AUTH_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_SITE_URL`.
- [ ] `SEED_ADMIN_PASSWORD` nach dem ersten Login ändern.

> **Grundsatz:** Fehlende Angaben werden nirgends geraten. Ist ein Feld leer,
> entfällt die Zeile im Impressum bzw. der Kontaktweg auf der Website – statt
> eine erfundene Adresse, Nummer oder Behörde anzuzeigen.

Alle Angaben sind unter `/admin/unternehmen` pflegbar, auch Gewerbewortlaut,
Aufsichtsbehörde und GISA-Zahl. Ein Tippfehler im Impressum braucht damit
kein Deployment.

---

## Bekannte Einschränkungen

- **Prisma-Transitive geprüft am 01.09.2026:** `prisma`, `@prisma/client`
  und `@prisma/adapter-pg` laufen gemeinsam auf `7.10.0`. `npm audit` meldete
  ursprünglich `deepmerge-ts < 8.0.0` über `@prisma/config` sowie
  `mysql2 < 3.22.0` über `prisma`; ein `npm audit fix --force` hätte auf
  `prisma@6.19.3` heruntergestuft. Stattdessen erzwingen npm-Overrides
  `deepmerge-ts@8.0.2` und `mysql2@3.24.2`. `npm audit` und
  `prisma generate` sind danach grün.
- **Instagram-Token** wird nicht automatisch verlängert. Der Admin warnt sieben
  Tage vor Ablauf; die Verbindung ist dann neu herzustellen.
- **Mock-Bilder** stammen von Unsplash und zeigen nicht das jeweils
  beschriebene Fahrzeug. Für den Echtbetrieb liefert der Provider die Fotos.
- **Projektordner auf dem Desktop:** Wird der Ordner von iCloud Drive
  synchronisiert, entstehen gelegentlich Kopien wie `routes.d 2.ts` in
  `.next/` und `src/generated/`. TypeScript meldet dann `Duplicate identifier`.
  Abhilfe:
  ```bash
  find . -path ./node_modules -prune -o -name "* [0-9].*" -delete
  npx prisma generate
  ```
  Dauerhaft besser: das Projekt außerhalb des synchronisierten Desktops
  ablegen.
- **Rate Limiting** ist ein Fixed-Window-Zähler in der Datenbank. Für sehr
  hohes Aufkommen wäre ein spezialisierter Dienst (etwa Upstash) sinnvoller.
