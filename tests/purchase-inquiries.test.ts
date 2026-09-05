import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { sellCarSchema } from "@/modules/forms/schemas";
import {
  PURCHASE_INQUIRY_CLOSED_STATUSES,
  PURCHASE_INQUIRY_STATUS_LABELS,
  PURCHASE_INQUIRY_STATUS_ORDER,
} from "@/modules/purchase-inquiries/labels";
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_ORDER,
} from "@/modules/vehicles/labels";

/**
 * Ankaufanfragen enthalten personenbezogene Daten und sind der einzige
 * öffentliche Formularweg, der in der Datenbank landet. Hier wird geprüft:
 * dass die Validierung greift, dass die Statuswerte vollständig beschriftet
 * sind und dass die Verdrahtung (erst speichern, dann mailen; Admin
 * geschützt) nicht versehentlich zurückgedreht wird.
 */

const formsActions = readFileSync("src/modules/forms/actions.ts", "utf8");
const adminActions = readFileSync(
  "src/modules/purchase-inquiries/admin-actions.ts",
  "utf8",
);
const repository = readFileSync(
  "src/modules/purchase-inquiries/repository.ts",
  "utf8",
);

/** Eine vollständig gültige Eingabe; einzelne Felder werden je Test verdreht. */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Maria Huber",
    email: "maria@example.at",
    phone: "+43 664 1234567",
    make: "Volkswagen",
    model: "Golf",
    firstRegistrationYear: "2019",
    mileageKm: "78500",
    fuel: "DIESEL",
    transmission: "MANUAL",
    vin: "",
    priceExpectationEuro: "12000",
    condition: "Scheckheftgepflegt",
    privacyConsent: true,
    website: "",
    ...overrides,
  };
}

describe("Validierung der Ankaufanfrage", () => {
  it("nimmt eine vollständige Anfrage an", () => {
    const result = sellCarSchema.safeParse(validInput());
    assert.ok(result.success, JSON.stringify(result.error?.issues));
  });

  it("wandelt Zahlenfelder in echte Zahlen um", () => {
    const result = sellCarSchema.parse(validInput());
    assert.equal(result.firstRegistrationYear, 2019);
    assert.equal(result.mileageKm, 78_500);
    assert.equal(result.priceExpectationEuro, 12_000);
  });

  it("verlangt eine Einwilligung in die Datenverarbeitung", () => {
    // Ohne Einwilligung dürfen die Daten nicht gespeichert werden.
    const result = sellCarSchema.safeParse(
      validInput({ privacyConsent: false }),
    );
    assert.equal(result.success, false);
  });

  it("weist eine unglaubwürdige Erstzulassung zurück", () => {
    assert.equal(sellCarSchema.safeParse(validInput({ firstRegistrationYear: "1890" })).success, false);
    assert.equal(sellCarSchema.safeParse(validInput({ firstRegistrationYear: "2999" })).success, false);
  });

  it("weist einen unmöglichen Kilometerstand zurück", () => {
    assert.equal(sellCarSchema.safeParse(validInput({ mileageKm: "-5" })).success, false);
    assert.equal(sellCarSchema.safeParse(validInput({ mileageKm: "9000000" })).success, false);
  });

  it("verlangt eine erreichbare Telefonnummer", () => {
    assert.equal(sellCarSchema.safeParse(validInput({ phone: "" })).success, false);
    assert.equal(sellCarSchema.safeParse(validInput({ phone: "keine" })).success, false);
  });

  it("lehnt unbekannte Kraftstoff- und Getriebearten ab", () => {
    assert.equal(sellCarSchema.safeParse(validInput({ fuel: "KEROSIN" })).success, false);
    assert.equal(sellCarSchema.safeParse(validInput({ transmission: "MAGIE" })).success, false);
  });

  it("wehrt ausgefüllte Honeypot-Felder ab", () => {
    assert.equal(
      sellCarSchema.safeParse(validInput({ website: "http://spam.example" })).success,
      false,
    );
  });

  it("lässt optionale Felder weg, statt leere Zeichenketten zu speichern", () => {
    const result = sellCarSchema.parse(
      validInput({ vin: "", priceExpectationEuro: "" }),
    );
    assert.equal(result.vin, undefined);
    assert.equal(result.priceExpectationEuro, undefined);
  });
});

describe("Statuswerte sind vollständig beschriftet", () => {
  it("beschriftet jeden Bearbeitungsstand einer Anfrage", () => {
    for (const status of PURCHASE_INQUIRY_STATUS_ORDER) {
      assert.ok(
        PURCHASE_INQUIRY_STATUS_LABELS[status],
        `${status} hat keine Beschriftung`,
      );
    }
    assert.equal(
      PURCHASE_INQUIRY_STATUS_ORDER.length,
      Object.keys(PURCHASE_INQUIRY_STATUS_LABELS).length,
    );
  });

  it("kennt abgeschlossene Zustände", () => {
    assert.deepEqual(PURCHASE_INQUIRY_CLOSED_STATUSES, ["PURCHASED", "REJECTED"]);
  });

  it("beschriftet jeden Fahrzeugstatus", () => {
    for (const status of VEHICLE_STATUS_ORDER) {
      assert.ok(VEHICLE_STATUS_LABELS[status], `${status} hat keine Beschriftung`);
    }
    assert.deepEqual(VEHICLE_STATUS_ORDER, ["IN_STOCK", "RESERVED", "SOLD"]);
  });
});

describe("Die Anfrage wird gespeichert, bevor gemailt wird", () => {
  it("legt den Datensatz an", () => {
    assert.match(formsActions, /createPurchaseInquiry\(/);
  });

  it("speichert vor dem Mailversand", () => {
    // Reihenfolge zählt: Erst wenn der Datensatz liegt, ist die Anfrage
    // wirklich zugestellt. Umgekehrt ginge sie bei einem DB-Fehler verloren.
    const save = formsActions.indexOf("createPurchaseInquiry(");
    // Ab dem Speichern suchen: "ankauf" steht auch schon im
    // handleSubmission-Aufruf darüber.
    const mail = formsActions.indexOf("await sendMail(", save);
    assert.ok(save > 0, "createPurchaseInquiry wird gar nicht aufgerufen");
    assert.ok(mail > save, "der Mailversand steht vor dem Speichern");
  });

  it("lässt eine fehlgeschlagene E-Mail die Anfrage nicht scheitern", () => {
    // Ohne konfiguriertes Resend wirft sendMail. Da die Anfrage dann bereits
    // gespeichert ist, wäre eine Fehlermeldung an den Kunden falsch.
    const block = formsActions.slice(formsActions.indexOf("createPurchaseInquiry("));
    assert.match(block, /try \{[\s\S]*?await sendMail\([\s\S]*?\} catch/);
  });

  it("rechnet die Preisvorstellung in Cent um", () => {
    // Projektkonvention: Geldbeträge sind Integer in Cent.
    assert.match(formsActions, /priceExpectationCents:[\s\S]{0,120}eurosToCents\(/);
  });
});

describe("Ankaufanfragen sind nur im Admin zugänglich", () => {
  it("prüft bei jeder Änderung die Anmeldung", () => {
    assert.match(adminActions, /requireAdminForAction\(\)/);
  });

  it("liegt die Übersicht im geschützten Bereich", () => {
    const page = readFileSync(
      "src/app/admin/(protected)/ankauf/page.tsx",
      "utf8",
    );
    assert.match(page, /listPurchaseInquiriesForAdmin/);
  });

  it("markiert das Repository als serverseitig", () => {
    // Ohne server-only könnte es versehentlich in eine Client-Komponente
    // gezogen werden – damit lägen Kundendaten im Browser-Bundle.
    assert.match(repository, /^import "server-only";/m);
  });

  it("lässt Kundenangaben nicht nachträglich überschreiben", () => {
    // Änderbar sind nur Status und interne Notiz.
    assert.match(adminActions, /status,\s*internalNotes/);
    for (const field of ["customerName", "customerPhone", "make:", "mileageKm"]) {
      assert.ok(
        !adminActions.includes(field),
        `${field} sollte im Admin nicht änderbar sein`,
      );
    }
  });

  it("schreibt keine Kundendaten ins Log", () => {
    const logCalls = [...adminActions.matchAll(/logger\.\w+\([\s\S]{0,200}?\)/g)]
      .map((m) => m[0])
      .join("\n");
    for (const field of ["customerName", "customerPhone", "customerEmail"]) {
      assert.ok(!logCalls.includes(field), `${field} landet im Log`);
    }
  });
});
