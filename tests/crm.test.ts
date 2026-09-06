import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CRM_LEAD_ACTIVE_STATUSES,
  CRM_LEAD_CLOSED_STATUSES,
  CRM_LEAD_SOURCE_LABELS,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_TYPE_LABELS,
} from "@/modules/crm/labels";
import {
  crmLeadCreateSchema,
  crmLeadUpdateSchema,
} from "@/modules/crm/schemas";

/**
 * Das CRM enthält Kundendaten. Diese Tests sichern die drei Dinge ab, die
 * dabei wirklich weh tun würden: eine ungeschützte Route, ein Lead, der beim
 * Doppelklick doppelt entsteht, und eine Anfrage, die verlorengeht, weil der
 * E-Mail-Versand klemmt.
 */

const formActions = readFileSync("src/modules/forms/actions.ts", "utf8");
const adminActions = readFileSync("src/modules/crm/admin-actions.ts", "utf8");
const repository = readFileSync("src/modules/crm/repository.ts", "utf8");

describe("Beschriftungen", () => {
  it("übersetzt jeden Status ins Deutsche", () => {
    assert.deepEqual(CRM_LEAD_STATUS_LABELS, {
      NEW: "Neu",
      CONTACTED: "Kontaktiert",
      APPOINTMENT: "Termin",
      IN_PROGRESS: "In Bearbeitung",
      WON: "Gewonnen",
      LOST: "Verloren",
    });
  });

  it("kennt alle geforderten Anliegen und Quellen", () => {
    assert.deepEqual(Object.keys(CRM_LEAD_TYPE_LABELS).sort(), [
      "BUY",
      "FINANCING",
      "GENERAL",
      "SELL",
      "TEST_DRIVE",
    ]);
    assert.deepEqual(Object.keys(CRM_LEAD_SOURCE_LABELS).sort(), [
      "AUTOSCOUT",
      "GEBRAUCHTWAGEN",
      "INSTAGRAM",
      "MANUAL",
      "WEBSITE",
      "WHATSAPP",
      "WILLHABEN",
    ]);
  });

  it("trennt aktive und abgeschlossene Zustände überschneidungsfrei", () => {
    // Sonst würde ein Lead doppelt gezählt oder fiele aus beiden Gruppen.
    for (const status of CRM_LEAD_ACTIVE_STATUSES) {
      assert.ok(!CRM_LEAD_CLOSED_STATUSES.includes(status));
    }
    assert.equal(
      CRM_LEAD_ACTIVE_STATUSES.length + CRM_LEAD_CLOSED_STATUSES.length,
      Object.keys(CRM_LEAD_STATUS_LABELS).length,
    );
  });
});

describe("Manueller Lead", () => {
  const base = {
    name: "Maria Huber",
    phone: "+43 664 1234567",
    email: "",
    type: "BUY" as const,
    source: "MANUAL" as const,
    message: "Interesse an einem Kombi",
  };

  it("nimmt einen Lead mit nur einer Telefonnummer an", () => {
    const parsed = crmLeadCreateSchema.safeParse(base);
    assert.ok(parsed.success);
    assert.equal(parsed.data.email, null);
    assert.equal(parsed.data.phone, "+43 664 1234567");
  });

  it("nimmt einen Lead mit nur einer E-Mail an", () => {
    const parsed = crmLeadCreateSchema.safeParse({
      ...base,
      phone: "",
      email: "Maria.Huber@Example.ORG",
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data.phone, null);
    // Kleinschreibung, damit derselbe Kontakt nicht zweimal wirkt.
    assert.equal(parsed.data.email, "maria.huber@example.org");
  });

  it("weist einen Lead ohne jede Erreichbarkeit ab", () => {
    const parsed = crmLeadCreateSchema.safeParse({
      ...base,
      phone: "",
      email: "",
    });
    assert.equal(parsed.success, false);
  });

  it("weist unbekannte Anliegen und Quellen ab", () => {
    assert.equal(
      crmLeadCreateSchema.safeParse({ ...base, type: "IRGENDWAS" }).success,
      false,
    );
    assert.equal(
      crmLeadCreateSchema.safeParse({ ...base, source: "TIKTOK" }).success,
      false,
    );
  });
});

describe("Statuswechsel", () => {
  it("nimmt jeden gültigen Status an", () => {
    for (const status of Object.keys(CRM_LEAD_STATUS_LABELS)) {
      const parsed = crmLeadUpdateSchema.safeParse({
        id: "abc",
        status,
        internalNotes: "",
        markContacted: false,
      });
      assert.ok(parsed.success, `${status} wurde abgelehnt`);
    }
  });

  it("weist einen erfundenen Status ab", () => {
    assert.equal(
      crmLeadUpdateSchema.safeParse({
        id: "abc",
        status: "ERLEDIGT",
        internalNotes: "",
        markContacted: false,
      }).success,
      false,
    );
  });

  it("dokumentiert den Kontakt nur auf ausdrückliche Anweisung", () => {
    // Sonst würde jedes Speichern das Kontaktdatum überschreiben.
    assert.match(adminActions, /parsed\.data\.markContacted \? \{ lastContactAt: new Date\(\) \} : \{\}/);
  });
});

describe("Zugriffsschutz", () => {
  it("prüft in jeder CRM-Aktion die Anmeldung", () => {
    const exported = adminActions.match(/export async function \w+/g) ?? [];
    const guards = adminActions.match(/requireAdminForAction\(\)/g) ?? [];

    assert.ok(exported.length > 0);
    assert.equal(
      guards.length,
      exported.length,
      "eine CRM-Aktion prüft die Anmeldung nicht",
    );
  });

  it("protokolliert keine Kundendaten", () => {
    // Im Log darf die Lead-ID stehen, aber kein Name und keine Adresse.
    const logs = adminActions.match(/logger\.\w+\([\s\S]*?\);/g) ?? [];
    for (const entry of logs) {
      for (const field of ["name", "phone", "email"]) {
        assert.ok(
          !new RegExp(`\\b${field}\\b`).test(entry),
          `ein Logeintrag enthält "${field}"`,
        );
      }
    }
  });
});

describe("Keine doppelten Leads", () => {
  it("vergleicht die konkrete Anfrage, nicht nur die Adresse", () => {
    // Zwei verschiedene Anliegen derselben Person bleiben zwei Leads.
    assert.match(repository, /candidate\.message === input\.message/);
    assert.match(repository, /where: \{ type: input\.type/);
  });

  it("begrenzt die Zusammenführung auf ein kurzes Zeitfenster", () => {
    assert.match(repository, /DUPLICATE_WINDOW_MS/);
    assert.match(repository, /createdAt: \{ gte: since \}/);
  });
});

describe("Formulare erzeugen Leads", () => {
  it("legt für beide öffentlichen Formulare einen Lead an", () => {
    assert.equal((formActions.match(/createCrmLead\(/g) ?? []).length, 2);
    assert.match(formActions, /type: "GENERAL"/);
    assert.match(formActions, /type: "SELL"/);
  });

  it("verknüpft den Ankauf-Lead mit der Anfrage statt sie zu kopieren", () => {
    assert.match(formActions, /purchaseInquiryId: inquiry\.id/);
    // Die Fahrzeugdaten dürfen nicht zusätzlich in den Lead wandern.
    const leadCall = formActions.slice(
      formActions.indexOf("await createCrmLead({", formActions.indexOf("SELL") - 400),
    );
    const block = leadCall.slice(0, leadCall.indexOf("});"));
    for (const field of ["make", "model", "mileageKm", "firstRegistrationYear"]) {
      assert.ok(!block.includes(`${field}:`), `${field} wird in den Lead kopiert`);
    }
  });

  it("speichert den Lead auch wenn der E-Mail-Versand fehlschlägt", () => {
    // Jeder sendMail-Aufruf der öffentlichen Formulare ist abgesichert.
    const sends = formActions.match(/await sendMail\(/g) ?? [];
    const guards = formActions.match(/try \{\s*await sendMail\(/g) ?? [];

    assert.equal(sends.length, 2);
    assert.equal(
      guards.length,
      sends.length,
      "ein E-Mail-Versand kann die Anfrage noch scheitern lassen",
    );
  });

  it("legt den Lead vor dem Versand an", () => {
    for (const marker of ['type: "GENERAL"', 'type: "SELL"']) {
      const lead = formActions.indexOf(marker);
      const mail = formActions.indexOf("await sendMail(", lead);
      assert.ok(lead !== -1 && mail !== -1);
      assert.ok(lead < mail, `${marker}: der Versand steht vor dem Lead`);
    }
  });
});
