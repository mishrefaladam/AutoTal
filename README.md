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

Die Website läuft ohne einen einzigen externen Dienst: Der Fahrzeugbestand
kommt aus dem `MockVehicleProvider` (14 Testfahrzeuge). Resend, OpenAI und
Instagram sind optional – fehlt ein Key, blendet die Oberfläche die Funktion
aus oder meldet es verständlich, statt stillschweigend zu scheitern.

---

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbuild (inkl. `prisma generate`) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (ohne Datenbank) |
| `npm run test:db:setup` | Testdatenbank anlegen und migrieren |
| `npm run test:db` | Alle Tests inkl. Sync-Integrationstests |
| `npm run check` | Typecheck + Lint + Tests + Build |
| `npm run db:migrate` | Migration erstellen und anwenden |
| `npm run db:seed` | Grunddaten und Testfahrzeuge |
| `npm run db:studio` | Prisma Studio |
| `npm run vehicles:sync` | Fahrzeugsynchronisierung von der Kommandozeile |

---

## Architektur

```
src/
  app/
    (public)/          Öffentliche Seiten mit Kopf- und Fußzeile
    admin/
      login/           Anmeldung (außerhalb des geschützten Layouts)
      (protected)/     Alles hinter requireAdmin()
    api/               Auth.js, Instagram-Callback, Cron
  components/
    ui/                shadcn/ui-Primitiven
    site/              Kopfzeile, Fußzeile, Layoutbausteine
    vehicles/          Fahrzeugkarte, Galerie, Filter
    forms/             Formulare und Formularbausteine
    admin/             Oberfläche des Adminbereichs
    financing/         Finanzierungsrechner
  modules/             Fachlogik, unabhängig von der UI
    vehicles/          Typen, Repository, Filter, Sync
    financing/         Rechner, Konfiguration
    company/           Unternehmensdaten, Öffnungszeiten
    social/            KI-Entwürfe, Freigabe, Veröffentlichung
    forms/             Schemata und Server Actions
    admin/             Autorisierung, An- und Abmeldung
  integrations/        Externe Dienste, jeweils hinter einer Schnittstelle
    vehicles/          VehicleProvider (Mock, autoPro24, Willhaben)
    resend/            E-Mail
    openai/            Caption-Generierung
    instagram/         Graph API
  lib/                 Querschnitt: Prisma, Env, Geld, Krypto, Rate Limiting
```

**Die Trennung ist keine Kosmetik.** `modules/` kennt kein React, `components/`
kein Prisma, und `integrations/` ist über Interfaces austauschbar. Eine neue
Fahrzeugquelle ist deshalb eine Datei plus ein Registry-Eintrag – nicht ein
Umbau der halben Anwendung.

### Fahrzeugquellen

Die Anwendung ist **nicht** von Willhaben oder autoPro24 abhängig. Sämtliche
Fahrzeugdaten laufen über das Interface `VehicleProvider`
([Details](src/integrations/vehicles/README.md)):

```ts
listVehicles(options?) -> { vehicles, nextCursor, isCompleteInventory }
getVehicleById(externalId) -> ProviderVehicle | null
isConfigured() -> boolean
```

| Quelle | Status |
| --- | --- |
| `mock` | einsatzbereit, Standard |
| `autopro24` | Adapter vorbereitet – wartet auf API-Dokumentation und Zugangsdaten |
| `willhaben` | Adapter vorbereitet – wartet auf offiziellen Schnittstellenzugang |

Es wird **nicht gescrapt**, und es wurden keine API-Endpunkte erfunden. Beide
noch nicht angebundenen Provider melden über `isConfigured() === false`, dass
sie nicht einsatzbereit sind. Der Status steht im Admin unter *Integrationen*.

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

- **Autorisierung serverseitig.** Die Middleware prüft nur das signierte
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
3. **Migrationen** beim Deployment ausführen – Build Command:
   ```
   prisma migrate deploy && npm run build
   ```
4. **Ersten Admin anlegen**: `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD`
   setzen und `npm run db:seed` einmalig ausführen. Passwort danach ändern.
5. **Cron** ist in `vercel.json` hinterlegt (alle 4 Stunden). Dafür
   `SYNC_CRON_SECRET` setzen – ohne diesen Wert ist der Endpunkt bewusst
   deaktiviert.
6. **Bildhosts** des Fahrzeug-Providers in `next.config.ts` unter
   `images.remotePatterns` eintragen.

### Vor dem Livegang

- [ ] Echte Firmendaten unter `/admin/unternehmen` eintragen – alle mit
      `[PLATZHALTER]` markierten Werte aus `prisma/seed.ts` ersetzen.
      **Impressumsangaben sind nach § 5 ECG verpflichtend und müssen stimmen.**
- [ ] Impressum und Datenschutzerklärung juristisch prüfen lassen
      (Gewerbewortlaut, Aufsichtsbehörde, Kammerzugehörigkeit).
- [ ] Auftragsverarbeitungsverträge mit Resend und dem Hoster abschließen.
- [ ] Finanzierungspartner durch die tatsächlichen ersetzen – die Platzhalter
      behaupten bewusst keine Geschäftsbeziehung.
- [ ] Resend-Domain verifizieren, `RESEND_FROM_EMAIL` und
      `CONTACT_INBOX_EMAIL` setzen und einen Testversand durchführen.
- [ ] `SEED_ADMIN_PASSWORD` nach dem ersten Login ändern.

---

## Bekannte Einschränkungen

- **`prisma` CLI (dev-only)** zieht `deepmerge-ts` mit einer bekannten
  Schwachstelle nach. Betroffen ist ausschließlich das Config-Parsing der
  CLI, nicht das Laufzeit-Bundle. Ein Downgrade würde `prisma` und
  `@prisma/client` auf unterschiedliche Hauptversionen zwingen. Beobachten und
  mit dem nächsten Prisma-Release aktualisieren.
- **Instagram-Token** wird nicht automatisch verlängert. Der Admin warnt sieben
  Tage vor Ablauf; die Verbindung ist dann neu herzustellen.
- **Mock-Bilder** stammen von Unsplash und zeigen nicht das jeweils
  beschriebene Fahrzeug. Für den Echtbetrieb liefert der Provider die Fotos.
- **Rate Limiting** ist ein Fixed-Window-Zähler in der Datenbank. Für sehr
  hohes Aufkommen wäre ein spezialisierter Dienst (etwa Upstash) sinnvoller.
