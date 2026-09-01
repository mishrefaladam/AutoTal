import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyCaptionFacts } from "@/integrations/openai";

/**
 * Die Vorgabe "die KI darf keine Fahrzeugdaten erfinden" (US-19) hängt nicht
 * allein an der Formulierung des Prompts. Preis und Kilometerstand im
 * erzeugten Text werden gegen die echten Werte geprüft; stimmen sie nicht,
 * wird der Entwurf verworfen.
 *
 * Diese Tests sichern genau diese Prüfung ab.
 */

// BMW 320d: 34.900 €, 96.200 km
const VEHICLE = { priceCents: 3_490_000, mileageKm: 96_200 };

describe("verifyCaptionFacts", () => {
  it("akzeptiert einen Text mit korrekten Angaben", () => {
    const text =
      "BMW 320d xDrive Touring M Sport. Kilometerstand 96.200 km, " +
      "Preis € 34.900. Vereinbaren Sie eine Probefahrt.";

    assert.deepEqual(verifyCaptionFacts(text, VEHICLE), []);
  });

  it("erkennt einen abweichenden Preis", () => {
    const text = "Jetzt für nur € 32.900 statt regulär mehr.";
    const issues = verifyCaptionFacts(text, VEHICLE);

    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, "Preis");
    assert.equal(issues[0].found, "32.900");
  });

  it("erkennt einen abweichenden Kilometerstand", () => {
    const text = "Gepflegter Kombi mit nur 69.200 km Laufleistung.";
    const issues = verifyCaptionFacts(text, VEHICLE);

    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, "Kilometerstand");
  });

  it("erkennt einen gerundeten Preis als Abweichung", () => {
    // "rund 35.000 €" wäre bequem, ist aber falsch.
    const issues = verifyCaptionFacts("Ihr Preis: rund 35.000 €", VEHICLE);

    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, "Preis");
  });

  it("versteht verschiedene Schreibweisen des Preises", () => {
    for (const text of [
      "Preis: € 34.900",
      "Preis: 34.900 €",
      "Preis: 34900 EUR",
      "Preis: EUR 34.900",
    ]) {
      assert.deepEqual(
        verifyCaptionFacts(text, VEHICLE),
        [],
        `Schreibweise nicht erkannt: ${text}`,
      );
    }
  });

  it("hält eine Monatsrate nicht für den Kaufpreis", () => {
    const text = "Ab € 389 pro Monat finanzierbar. Kaufpreis € 34.900.";

    assert.deepEqual(verifyCaptionFacts(text, VEHICLE), []);
  });

  it("stört sich nicht an Jahreszahlen und Sitzplätzen", () => {
    const text =
      "Erstzulassung 2020, 5 Sitze, 140 kW. Kilometerstand 96.200 km " +
      "zum Preis von € 34.900.";

    assert.deepEqual(verifyCaptionFacts(text, VEHICLE), []);
  });

  it("meldet mehrere Abweichungen gemeinsam", () => {
    const text = "Nur 50.000 km und günstige € 29.900!";
    const issues = verifyCaptionFacts(text, VEHICLE);

    assert.equal(issues.length, 2);
    assert.ok(issues.some((issue) => issue.field === "Preis"));
    assert.ok(issues.some((issue) => issue.field === "Kilometerstand"));
  });

  it("akzeptiert einen Text ganz ohne Zahlen", () => {
    const text = "Ein gepflegter Kombi für die Familie. Jetzt Probefahrt vereinbaren.";

    assert.deepEqual(verifyCaptionFacts(text, VEHICLE), []);
  });

  it("nennt in der Meldung den erwarteten Wert", () => {
    const issues = verifyCaptionFacts("Preis € 30.000", VEHICLE);

    assert.equal(issues[0].expected, "34.900");
  });
});
