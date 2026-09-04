import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_VEHICLE_FORM,
  vehicleFormSchema,
} from "@/modules/vehicles/admin-schemas";
import { sellCarSchema } from "@/modules/forms/schemas";

/**
 * Die Fahrzeugpflege im Admin nimmt abgetippte Werte entgegen – dort landen
 * Tausenderpunkte, Leerzeichen und leere Felder. Geprüft wird deshalb vor
 * allem, dass typische Eingaben durchgehen und Unsinn sauber abgewiesen wird.
 */

function raw(overrides: Record<string, unknown> = {}) {
  return {
    ...EMPTY_VEHICLE_FORM,
    make: "Volkswagen",
    model: "Passat Variant",
    priceEuro: "24900",
    mileageKm: "112400",
    description: "Ein gepflegtes Fahrzeug.",
    ...overrides,
  };
}

describe("vehicleFormSchema", () => {
  it("nimmt eine vollständige Eingabe an", () => {
    const result = vehicleFormSchema.safeParse(raw());
    assert.equal(result.success, true);
  });

  it("rechnet Euro in Cent um", () => {
    const parsed = vehicleFormSchema.parse(raw({ priceEuro: "24900" }));
    // Die Datenbank speichert Cent – 24.900 € sind 2.490.000 Cent.
    assert.equal(parsed.priceEuro * 100, 2_490_000);
  });

  it("toleriert Tausenderpunkte und Leerzeichen beim Abtippen", () => {
    const parsed = vehicleFormSchema.parse(
      raw({ priceEuro: "24.900", mileageKm: "112 400" }),
    );
    assert.equal(parsed.priceEuro, 24_900);
    assert.equal(parsed.mileageKm, 112_400);
  });

  it("wandelt das Monatsfeld in ein Datum um", () => {
    const parsed = vehicleFormSchema.parse(raw({ firstRegistration: "2021-05" }));

    assert.ok(parsed.firstRegistration);
    assert.equal(parsed.firstRegistration.getUTCFullYear(), 2021);
    // Monat ist nullbasiert: 4 = Mai.
    assert.equal(parsed.firstRegistration.getUTCMonth(), 4);
  });

  it("lässt die Erstzulassung weg, wenn das Feld leer ist", () => {
    const parsed = vehicleFormSchema.parse(raw({ firstRegistration: "" }));
    assert.equal(parsed.firstRegistration, null);
  });

  it("weist eine Erstzulassung in ferner Zukunft ab", () => {
    const result = vehicleFormSchema.safeParse(
      raw({ firstRegistration: "2099-01" }),
    );
    assert.equal(result.success, false);
  });

  it("macht aus der Ausstattung eine Liste – eine Zeile je Merkmal", () => {
    const parsed = vehicleFormSchema.parse(
      raw({
        features: "Navigationssystem\n  Rückfahrkamera  \n\nSitzheizung vorne\n",
      }),
    );

    assert.deepEqual(parsed.features, [
      "Navigationssystem",
      "Rückfahrkamera",
      "Sitzheizung vorne",
    ]);
  });

  it("behält Kommas innerhalb eines Ausstattungsmerkmals", () => {
    // Genau deshalb wird zeilen- und nicht kommagetrennt.
    const parsed = vehicleFormSchema.parse(
      raw({ features: "Sitzheizung vorne, beheizbares Lenkrad" }),
    );
    assert.deepEqual(parsed.features, ["Sitzheizung vorne, beheizbares Lenkrad"]);
  });

  it("lässt optionale Zahlenfelder leer statt sie auf 0 zu setzen", () => {
    const parsed = vehicleFormSchema.parse(raw({ powerKw: "", doors: "" }));

    assert.equal(parsed.powerKw, null);
    assert.equal(parsed.doors, null);
  });

  it("verlangt Marke, Modell, Preis und Kilometerstand", () => {
    for (const field of ["make", "model", "priceEuro", "mileageKm"]) {
      const result = vehicleFormSchema.safeParse(raw({ [field]: "" }));
      assert.equal(result.success, false, `${field} müsste Pflicht sein`);
    }
  });

  it("weist einen Preis von null ab", () => {
    assert.equal(vehicleFormSchema.safeParse(raw({ priceEuro: "0" })).success, false);
  });

  it("weist nicht-numerische Eingaben ab", () => {
    assert.equal(
      vehicleFormSchema.safeParse(raw({ priceEuro: "ca. 25000" })).success,
      false,
    );
  });
});

describe("Server Actions erhalten die Rohwerte des Formulars", () => {
  /**
   * Regressionstest zu einem echten Fehler: `useActionForm` hatte die von Zod
   * bereits transformierten Werte an die Server Action gereicht. Die Action
   * validiert aber mit demselben Schema erneut – und ein Feld wie
   * `mileageKm: z.string().transform(Number)` erwartet dann wieder einen
   * String, bekommt aber eine Zahl. Das Ankaufformular scheiterte dadurch
   * stillschweigend an der Serverprüfung.
   *
   * Diese Tests halten fest, warum an Actions ausschließlich `form.getValues()`
   * gehen darf – niemals das transformierte Ergebnis.
   */

  const sellCarRaw = {
    name: "Max Mustermann",
    email: "max@example.at",
    phone: "+43 664 1234567",
    make: "Volkswagen",
    model: "Passat",
    firstRegistrationYear: "2019",
    mileageKm: "120000",
    fuel: "DIESEL",
    transmission: "MANUAL",
    vin: "",
    priceExpectationEuro: "",
    condition: "",
    privacyConsent: true,
    website: "",
  };

  it("Ankauf: Rohwerte werden angenommen", () => {
    assert.equal(sellCarSchema.safeParse(sellCarRaw).success, true);
  });

  it("Ankauf: bereits transformierte Werte werden NICHT angenommen", () => {
    const once = sellCarSchema.parse(sellCarRaw);
    assert.equal(sellCarSchema.safeParse(once).success, false);
  });

  it("Fahrzeugpflege: bereits transformierte Werte werden NICHT angenommen", () => {
    const once = vehicleFormSchema.parse(raw());
    assert.equal(vehicleFormSchema.safeParse(once).success, false);
  });
});
