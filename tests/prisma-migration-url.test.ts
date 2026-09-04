import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMigrationUrl } from "../prisma/migration-url";

const POOLED = "postgresql://user:pw@ep-x-pooler.eu-central-1.aws.neon.tech/db";
const DIRECT = "postgresql://user:pw@ep-x.eu-central-1.aws.neon.tech/db";

describe("Verbindungswahl für Migrationen", () => {
  it("bevorzugt DATABASE_URL_UNPOOLED", () => {
    assert.equal(
      resolveMigrationUrl({
        DATABASE_URL_UNPOOLED: DIRECT,
        DIRECT_URL: "postgresql://legacy:pw@legacy/db",
        DATABASE_URL: POOLED,
      }),
      DIRECT,
    );
  });

  it("fällt ohne DATABASE_URL_UNPOOLED auf DIRECT_URL zurück", () => {
    assert.equal(
      resolveMigrationUrl({ DIRECT_URL: DIRECT, DATABASE_URL: POOLED }),
      DIRECT,
    );
  });

  it("fällt ohne ungepoolte URLs auf DATABASE_URL zurück", () => {
    assert.equal(resolveMigrationUrl({ DATABASE_URL: POOLED }), POOLED);
  });

  it("behandelt eine leere DATABASE_URL_UNPOOLED wie 'nicht gesetzt'", () => {
    // Regression: mit `??` gewann hier der leere String und Prisma brach ab.
    assert.equal(
      resolveMigrationUrl({ DATABASE_URL_UNPOOLED: "", DIRECT_URL: DIRECT }),
      DIRECT,
    );
  });

  it("behandelt eine leere DIRECT_URL wie 'nicht gesetzt'", () => {
    assert.equal(
      resolveMigrationUrl({ DIRECT_URL: "", DATABASE_URL: POOLED }),
      POOLED,
    );
  });

  it("entfernt einen angehängten Zeilenumbruch", () => {
    assert.equal(
      resolveMigrationUrl({ DATABASE_URL_UNPOOLED: `${DIRECT}\n` }),
      DIRECT,
    );
  });

  it("akzeptiert auch das kurze postgres://-Schema", () => {
    const short = "postgres://user:pw@host/db";
    assert.equal(resolveMigrationUrl({ DATABASE_URL_UNPOOLED: short }), short);
  });
});

describe("Fehlerhafte Konfiguration wird benannt", () => {
  // Ohne diese Prüfungen meldete Prisma nur "P1013 – The scheme is not
  // recognized in database URL", ohne zu sagen, welche Variable schuld ist.
  const cases: [string, string, RegExp][] = [
    ["nur Whitespace", "   ", /nur aus Leerzeichen/],
    ["Anführungszeichen", `"${DIRECT}"`, /Anführungszeichen/],
    ["Variablenname davor", `DATABASE_URL_UNPOOLED=${DIRECT}`, /Variablennamen/],
    ["Platzhalter-Referenz", "${DATABASE_URL_UNPOOLED}", /\$\{\.\.\.\}.*Referenz/],
    ["HTTP-Adresse", "https://console.neon.tech/x", /HTTP-Adresse/],
    ["psql-Kommando", `psql ${DIRECT}`, /psql-Kommando/],
  ];

  for (const [label, value, expected] of cases) {
    it(`erkennt: ${label}`, () => {
      assert.throws(
        () =>
          resolveMigrationUrl({
            DATABASE_URL_UNPOOLED: value,
            DIRECT_URL: DIRECT,
            DATABASE_URL: POOLED,
          }),
        (error: Error) =>
          expected.test(error.message) &&
          /DATABASE_URL_UNPOOLED/.test(error.message),
      );
    });
  }

  it("weicht bei kaputter DATABASE_URL_UNPOOLED nicht heimlich aus", () => {
    // Sonst liefe die Migration unbemerkt über den falschen Endpunkt.
    assert.throws(() =>
      resolveMigrationUrl({
        DATABASE_URL_UNPOOLED: "kaputt",
        DIRECT_URL: DIRECT,
        DATABASE_URL: POOLED,
      }),
    );
  });

  it("weicht bei kaputter DIRECT_URL nicht heimlich auf DATABASE_URL aus", () => {
    assert.throws(() =>
      resolveMigrationUrl({ DIRECT_URL: "kaputt", DATABASE_URL: POOLED }),
    );
  });

  it("nennt DATABASE_URL, wenn diese das Problem ist", () => {
    assert.throws(
      () => resolveMigrationUrl({ DATABASE_URL: "kaputt" }),
      /DATABASE_URL ist gesetzt/,
    );
  });

  it("meldet, wenn gar nichts gesetzt ist", () => {
    assert.throws(
      () => resolveMigrationUrl({}),
      /Weder DATABASE_URL_UNPOOLED noch/,
    );
  });

  it("gibt den fehlerhaften Wert nicht preis", () => {
    // Die Meldung landet im Vercel-Build-Log; sie darf keine Zugangsdaten zeigen.
    try {
      resolveMigrationUrl({ DATABASE_URL_UNPOOLED: `"${DIRECT}"` });
      assert.fail("hätte werfen müssen");
    } catch (error) {
      assert.ok(!(error as Error).message.includes("pw@"));
      assert.ok(!(error as Error).message.includes("neon.tech"));
    }
  });
});
