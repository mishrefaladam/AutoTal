import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Fahrzeugauswahl im Beitragsassistenten (US-18, US-19, US-23).
 *
 * Die Auswahl lief einmal an der Sichtbarkeit statt am Bestand: Ein im Admin
 * ausgeblendetes Fahrzeug verschwand aus dem Assistenten, der daraufhin „keine
 * Fahrzeuge hinterlegt“ meldete – obwohl unter /admin/fahrzeuge eines stand.
 *
 * Geprüft wird deshalb die Bedingung selbst. Die Abfragen brauchen eine
 * Datenbank; ihre Regeln stehen aber im Quelltext und sind dort nachprüfbar.
 */

const repository = readFileSync("src/modules/social/repository.ts", "utf8");
const actions = readFileSync("src/modules/social/actions.ts", "utf8");
const manager = readFileSync(
  "src/components/admin/social-media-manager.tsx",
  "utf8",
);

/** Rumpf einer Funktion ab ihrer Signatur bis zum nächsten Export. */
function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} nicht gefunden`);

  const rest = source.slice(start + signature.length);
  const end = rest.indexOf("\nexport ");

  return end === -1 ? rest : rest.slice(0, end);
}

describe("Fahrzeuge für den Beitragsassistenten", () => {
  const query = bodyOf(repository, "export async function listVehiclesForSocial");

  it("wählt nach Bestandsstatus aus", () => {
    assert.match(query, /where:\s*\{\s*status:\s*"IN_STOCK"\s*\}/);
  });

  it("schließt ausgeblendete Fahrzeuge nicht aus", () => {
    // `active` darf sortieren, aber nicht filtern.
    // `[^}]` schließt Zeilenumbrüche ein, ein dotAll-Flag braucht es nicht.
    assert.ok(!/where:[^}]*active:\s*true/.test(query));
  });

  it("setzt kein Bild voraus", () => {
    // Ein Bild-Filter wäre ein `some`/`none` auf der Bildrelation im where.
    assert.ok(!/images:\s*\{\s*(some|none)/.test(query));
  });

  it("filtert nicht auf eine bestimmte Herkunft", () => {
    assert.ok(!/externalSource/.test(query));
  });

  it("liefert die Gesamtzahl für den leeren Zustand mit", () => {
    assert.match(query, /prisma\.vehicle\.count\(\)/);
    assert.match(query, /totalCount/);
  });
});

describe("Textentwurf ohne Bild", () => {
  const generate = bodyOf(actions, "export async function generateCaption");

  it("erzeugt den Entwurf aus den Fahrzeugdaten, nicht aus Bildern", () => {
    // Kein Abbruch wegen fehlender Bilder – nur die vorhandenen werden
    // übernommen.
    assert.match(generate, /imageUrls:\s*vehicle\.images\.slice\(0,\s*1\)/);
    assert.ok(!/kein Bild/i.test(generate));
  });

  it("legt ausschließlich einen Entwurf an, veröffentlicht nie", () => {
    assert.match(generate, /status:\s*"DRAFT"/);
    assert.ok(!/publishImagePost/.test(generate));
  });

  it("nennt den Satz zum fehlenden Bild wörtlich", () => {
    assert.match(
      manager,
      /Bild fehlt – Text kann erstellt werden, Veröffentlichung auf Instagram "\s*\+\s*"erst nach Bild-Upload möglich\./,
    );
  });
});

describe("Veröffentlichung", () => {
  const publish = bodyOf(actions, "export async function publishDraft");

  it("lässt nur freigegebene Beiträge durch", () => {
    assert.match(publish, /draft\.status\s*!==\s*"APPROVED"/);
  });

  it("bricht ohne Bild ab", () => {
    assert.match(publish, /if\s*\(!imageUrl\)/);
    assert.match(publish, /return fail\(/);
  });

  it("berücksichtigt ein nachträglich hochgeladenes Bild", () => {
    // Sonst bliebe ein vor dem Upload erzeugter Entwurf dauerhaft gesperrt.
    assert.match(
      publish,
      /draft\.imageUrls\[0\]\s*\?\?\s*draft\.vehicle\.images\[0\]\?\.url/,
    );
  });

  it("sperrt die Schaltfläche in der Oberfläche ebenfalls", () => {
    assert.match(manager, /disabled=\{pending \|\| !instagramConnected \|\| !hasImage\}/);
  });
});

describe("Leerer Zustand", () => {
  it("unterscheidet „nichts angelegt“ von „nichts im Bestand“", () => {
    assert.match(manager, /totalVehicleCount === 0/);
    assert.match(manager, /Es sind noch keine Fahrzeuge angelegt\./);
    assert.match(manager, /Kein Fahrzeug steht derzeit im Bestand\./);
  });

  it("meldet fehlende Bilder nicht als fehlende Fahrzeuge", () => {
    assert.match(manager, /vehicles\.length > 0 && vehiclesWithImage === 0/);
  });
});

describe("Keine willhaben-Daten", () => {
  it("holt nirgends Fahrzeugdaten von außen", () => {
    // Der öffentliche Bestand kommt aus dem eingebetteten Widget. Er wird
    // weder abgerufen noch ausgelesen – die Auswahl speist sich allein aus
    // den im Admin gepflegten Datensätzen.
    const forbidden = /fetch\(|axios|willhaben\.at|autopro24/i;

    for (const [name, source] of [
      ["repository", repository],
      ["actions", actions],
      ["manager", manager],
    ] as const) {
      assert.ok(
        !forbidden.test(source),
        `${name} darf keine externen Fahrzeugdaten holen`,
      );
    }
  });
});
