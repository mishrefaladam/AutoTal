import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CRM_LEAD_CLOSED_STATUSES,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_STATUS_ORDER,
  CRM_LEAD_TYPE_ORDER,
  crmStatusHint,
  crmStatusLabel,
} from "@/modules/crm/labels";
import {
  CRM_TO_PURCHASE_STATUS,
  PURCHASE_TO_CRM_STATUS,
} from "@/modules/crm/purchase-inquiry-status";
import { PURCHASE_INQUIRY_STATUS_ORDER } from "@/modules/purchase-inquiries/labels";

/**
 * Ein Vorgang, eine Wahrheit.
 *
 * Ausgangspunkt war ein konkreter Fehler: Eine Ankaufsanfrage wurde unter
 * „Ankaufsanfragen“ auf „Angekauft“ gestellt – im CRM stand sie weiterhin auf
 * „Neu“. Zwei Statusfelder für denselben Vorgang, die auseinanderliefen.
 *
 * Diese Tests halten fest, dass es nur noch ein Feld gibt, dass beim
 * Zusammenlegen nichts verlorenging und dass ein Vorgang nicht versehentlich
 * gelöscht werden kann.
 */

const purchaseActions = readFileSync(
  "src/modules/purchase-inquiries/admin-actions.ts",
  "utf8",
);
const purchaseRepo = readFileSync(
  "src/modules/purchase-inquiries/repository.ts",
  "utf8",
);
const crmActions = readFileSync("src/modules/crm/admin-actions.ts", "utf8");
const crmRepo = readFileSync("src/modules/crm/repository.ts", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260907223709_crm_single_source_of_truth/migration.sql",
  "utf8",
);
const crmPage = readFileSync("src/app/admin/(protected)/crm/page.tsx", "utf8");
const inquiryRow = readFileSync(
  "src/components/admin/purchase-inquiry-row.tsx",
  "utf8",
);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("Statuswerte lassen sich verlustfrei aufeinander abbilden", () => {
  it("übersetzt jeden Ankauf-Status in einen gemeinsamen Stand", () => {
    for (const status of PURCHASE_INQUIRY_STATUS_ORDER) {
      assert.ok(
        PURCHASE_TO_CRM_STATUS[status],
        `${status} hat keine Entsprechung`,
      );
    }
  });

  it("kommt beim Hin- und Zurückübersetzen wieder beim Ausgangswert an", () => {
    // Genau das ist die Bedingung dafür, dass beim Zusammenlegen der beiden
    // Felder kein Bearbeitungsstand verschwindet.
    for (const status of PURCHASE_INQUIRY_STATUS_ORDER) {
      assert.equal(
        CRM_TO_PURCHASE_STATUS[PURCHASE_TO_CRM_STATUS[status]],
        status,
        `${status} überlebt die Übersetzung nicht`,
      );
    }

    for (const status of CRM_LEAD_STATUS_ORDER) {
      assert.equal(
        PURCHASE_TO_CRM_STATUS[CRM_TO_PURCHASE_STATUS[status]],
        status,
        `${status} überlebt die Rückübersetzung nicht`,
      );
    }
  });

  it("bildet „Angekauft“ auf einen abgeschlossenen Stand ab", () => {
    assert.equal(PURCHASE_TO_CRM_STATUS.PURCHASED, "WON");
    assert.equal(PURCHASE_TO_CRM_STATUS.REJECTED, "LOST");
    assert.ok(CRM_LEAD_CLOSED_STATUSES.includes(PURCHASE_TO_CRM_STATUS.PURCHASED));
    assert.ok(CRM_LEAD_CLOSED_STATUSES.includes(PURCHASE_TO_CRM_STATUS.REJECTED));
  });

  it("verwendet in der Migration dieselbe Zuordnung wie im Code", () => {
    // Liefe die SQL-Abbildung auseinander, wären Altdaten falsch einsortiert –
    // und niemand würde es merken.
    for (const [purchase, crm] of Object.entries(PURCHASE_TO_CRM_STATUS)) {
      assert.match(
        migration,
        new RegExp(`WHEN\\s+'${purchase}'\\s+THEN\\s+'${crm}'`),
        `Die Migration bildet ${purchase} nicht auf ${crm} ab`,
      );
    }
  });
});

describe("Bearbeitungsstand wird nur noch an einer Stelle geführt", () => {
  it("schreibt die Ankaufsansicht auf den Lead, nicht auf die Anfrage", () => {
    const code = stripComments(purchaseActions);

    assert.match(
      code,
      /prisma\.crmLead\.update/,
      "Der Stand gehört an den Lead.",
    );
    assert.doesNotMatch(
      code,
      /prisma\.vehiclePurchaseInquiry\.update/,
      "Ein zweites Statusfeld an der Anfrage war genau der Fehler.",
    );
  });

  it("liest die Ankaufsansicht den Stand aus dem Lead", () => {
    assert.match(stripComments(purchaseRepo), /crmLead\?\.status/);
  });

  it("aktualisiert beide Ansichten nach einer Änderung", () => {
    // Sonst zeigt die jeweils andere Ansicht bis zum nächsten Neuladen den
    // alten Stand – der Fehler wäre optisch noch da.
    for (const path of ["/admin/ankauf", "/admin/crm"]) {
      assert.ok(
        purchaseActions.includes(`revalidatePath("${path}")`),
        `Die Ankaufsaktion aktualisiert ${path} nicht`,
      );
      assert.ok(
        crmActions.includes(`revalidatePath("${path}")`),
        `Die CRM-Aktion aktualisiert ${path} nicht`,
      );
    }
  });

  it("bietet in beiden Ansichten dieselben Stufen an", () => {
    assert.match(inquiryRow, /CRM_LEAD_STATUS_ORDER/);
    assert.doesNotMatch(
      stripComments(inquiryRow),
      /PURCHASE_INQUIRY_STATUS_ORDER/,
      "Die Ankaufsansicht darf keine eigene Statusliste mehr haben.",
    );
  });
});

describe("Beschriftungen richten sich nach dem Anliegen", () => {
  it("nennt den Abschluss beim Ankauf „Angekauft“", () => {
    assert.equal(crmStatusLabel("WON", "SELL"), "Angekauft");
    assert.equal(crmStatusLabel("LOST", "SELL"), "Nicht angekauft");
    assert.equal(crmStatusLabel("IN_PROGRESS", "SELL"), "Angebot gemacht");
  });

  it("nennt den Abschluss beim Verkauf „Verkauft“", () => {
    assert.equal(crmStatusLabel("WON", "BUY"), "Verkauft");
    assert.equal(crmStatusLabel("LOST", "BUY"), "Nicht verkauft");
  });

  it("sagt nirgends mehr „Gewonnen“ oder „Verloren“", () => {
    // Der Anlass: „Ich verstehe nicht, was Status gewonnen oder verloren ist.“
    for (const type of CRM_LEAD_TYPE_ORDER) {
      for (const status of CRM_LEAD_STATUS_ORDER) {
        const label = crmStatusLabel(status, type);
        assert.doesNotMatch(
          label,
          /Gewonnen|Verloren/,
          `${type}/${status} heißt weiterhin „${label}“`,
        );
      }
    }

    assert.doesNotMatch(CRM_LEAD_STATUS_LABELS.WON, /Gewonnen/);
    assert.doesNotMatch(CRM_LEAD_STATUS_LABELS.LOST, /Verloren/);
    assert.doesNotMatch(stripComments(crmPage), /"Gewonnen"|"Verloren"/);
  });

  it("hat für jede Kombination eine Beschriftung und eine Erklärung", () => {
    for (const type of CRM_LEAD_TYPE_ORDER) {
      for (const status of CRM_LEAD_STATUS_ORDER) {
        assert.ok(
          crmStatusLabel(status, type).length > 0,
          `${type}/${status} ohne Beschriftung`,
        );
        assert.ok(
          crmStatusHint(status, type).length > 0,
          `${type}/${status} ohne Erklärung`,
        );
      }
    }
  });
});

describe("Archivieren und Löschen", () => {
  it("nimmt archivierte Vorgänge aus jeder Statistik", () => {
    const code = stripComments(crmRepo);

    // Ohne diesen Filter bliebe ein erledigter Vorgang für immer in der
    // Abschlussquote stehen.
    assert.match(code, /const active = \{ archivedAt: null \}/);
    assert.equal(
      (code.match(/where: active/g) ?? []).length,
      3,
      "Alle drei Gruppierungen müssen das Archiv ausschließen.",
    );
  });

  it("nimmt archivierte Vorgänge aus den Arbeitslisten", () => {
    assert.match(stripComments(crmRepo), /archivedAt: filters\.archived/);
    assert.match(
      stripComments(purchaseRepo),
      /crmLead: \{ is: \{ archivedAt: null \} \}/,
    );
  });

  it("zählt archivierte Vorgänge nicht als offene Anfragen", () => {
    assert.match(
      stripComments(purchaseRepo),
      /archivedAt: null,\s*status: \{ notIn: \["WON", "LOST"\] \}/,
    );
  });

  it("löscht nur aus dem Archiv heraus", () => {
    const code = stripComments(crmActions);

    // Die Prüfung sitzt in der Aktion, nicht in der Oberfläche: Auch ein
    // direkter Aufruf darf sie nicht umgehen.
    assert.match(code, /archivedAt === null/);
    assert.match(code, /Bitte legen Sie den Eintrag zuerst ins Archiv/);
  });

  it("löscht die zugehörige Ankaufsanfrage mit", () => {
    const code = stripComments(crmRepo);

    // Nur den Lead zu löschen würde die Anfrage verwaist zurücklassen –
    // sichtbar, aber ohne Bearbeitungsstand.
    assert.match(code, /\$transaction/);
    assert.match(code, /tx\.vehiclePurchaseInquiry\.delete/);
  });

  it("protokolliert beim Löschen keine Kundendaten", () => {
    const deleteBlock = crmActions.slice(
      crmActions.indexOf("export async function deleteCrmLeadAction"),
    );

    for (const feld of ["name", "phone", "email", "message"]) {
      assert.doesNotMatch(
        deleteBlock,
        new RegExp(`logger\\.[a-z]+\\([^)]*\\b${feld}\\b`, "s"),
        `Beim Löschen darf ${feld} nicht ins Protokoll wandern.`,
      );
    }
  });
});
