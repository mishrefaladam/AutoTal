import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  REFERRAL_POPUP_DELAY_MS,
  REFERRAL_POPUP_IMAGE,
  REFERRAL_POPUP_SNOOZE_DAYS,
  REFERRAL_POPUP_STORAGE_KEY,
  shouldShowReferralPopup,
} from "@/components/marketing/referral-popup-config";

/**
 * Ein Marketing-Popup ist der Teil der Website, der am ehesten stört. Deshalb
 * wird hier geprüft, dass es nach dem Schließen wirklich Ruhe gibt, dass ein
 * kaputter Speichereintrag es nicht dauerhaft verschluckt und dass ein
 * gesperrter localStorage die Seite nicht lahmlegt.
 */

const component = readFileSync(
  "src/components/marketing/referral-popup.tsx",
  "utf8",
);
const publicLayout = readFileSync("src/app/(public)/layout.tsx", "utf8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("Anzeigeregel", () => {
  it("zeigt das Popup beim ersten Besuch", () => {
    assert.equal(shouldShowReferralPopup(null, NOW), true);
  });

  it("schweigt direkt nach dem Schließen", () => {
    assert.equal(shouldShowReferralPopup(String(NOW), NOW), false);
  });

  it("schweigt auch kurz vor Ablauf der Frist", () => {
    const dismissed = NOW - (REFERRAL_POPUP_SNOOZE_DAYS * DAY - 60_000);
    assert.equal(shouldShowReferralPopup(String(dismissed), NOW), false);
  });

  it("zeigt es nach Ablauf der Frist wieder", () => {
    const dismissed = NOW - REFERRAL_POPUP_SNOOZE_DAYS * DAY;
    assert.equal(shouldShowReferralPopup(String(dismissed), NOW), true);
  });

  it("lässt sich die Frist von außen vorgeben", () => {
    const dismissed = NOW - 2 * DAY;
    assert.equal(shouldShowReferralPopup(String(dismissed), NOW, 7), false);
    assert.equal(shouldShowReferralPopup(String(dismissed), NOW, 1), true);
  });

  it("zeigt es bei unlesbarem Eintrag lieber einmal zu viel", () => {
    // Sonst könnte ein kaputter Wert die Kampagne dauerhaft stummschalten.
    for (const broken of ["", "gestern", "NaN", "-5", "0"]) {
      assert.equal(
        shouldShowReferralPopup(broken, NOW),
        true,
        `"${broken}" hätte das Popup verschluckt`,
      );
    }
  });

  it("fällt nicht auf einen Zeitstempel aus der Zukunft herein", () => {
    // Verstellte Systemuhr: würde sonst je nach Abstand jahrelang schweigen.
    assert.equal(shouldShowReferralPopup(String(NOW + 400 * DAY), NOW), true);
  });
});

describe("Konfiguration", () => {
  it("wartet kurz, statt sofort aufzuspringen", () => {
    assert.ok(
      REFERRAL_POPUP_DELAY_MS >= 1000 && REFERRAL_POPUP_DELAY_MS <= 2000,
      "die Verzögerung liegt außerhalb der vorgegebenen 1–2 Sekunden",
    );
  });

  it("hält die Frist von sieben Tagen ein", () => {
    assert.equal(REFERRAL_POPUP_SNOOZE_DAYS, 7);
  });

  it("versioniert den Speicherschlüssel", () => {
    // Eine spätere Kampagne soll wieder bei allen erscheinen können.
    assert.match(REFERRAL_POPUP_STORAGE_KEY, /\.v\d+$/);
  });

  it("verweist auf das gelieferte Motiv", () => {
    assert.equal(REFERRAL_POPUP_IMAGE.src, "/marketing/empfehlungsbonus.jpg");
    assert.equal(REFERRAL_POPUP_IMAGE.width, 1080);
    assert.equal(REFERRAL_POPUP_IMAGE.height, 1920);
    assert.ok(
      REFERRAL_POPUP_IMAGE.alt.includes("250"),
      "der Alternativtext nennt die Prämie nicht",
    );
  });
});

describe("Bedienbarkeit und Robustheit", () => {
  it("nutzt das native dialog-Element für Fokus und Escape", () => {
    assert.match(component, /<dialog/);
    assert.match(component, /showModal\(\)/);
  });

  it("schließt beim Klick neben den Inhalt", () => {
    assert.match(component, /event\.target === dialogRef\.current/);
  });

  it("merkt sich das Schließen auch bei Escape", () => {
    // <dialog> löst für Escape dasselbe close-Ereignis aus.
    assert.match(component, /onClose=\{remember\}/);
  });

  it("überlebt einen gesperrten localStorage", () => {
    // Privater Modus oder blockierte Website-Daten werfen beim Zugriff.
    const reads = component.split("localStorage").length - 1;
    const catches = component.split("} catch").length - 1;
    assert.ok(reads >= 2, "localStorage wird nicht gelesen und geschrieben");
    assert.ok(catches >= 2, "nicht jeder Speicherzugriff ist abgesichert");
  });

  it("hat eine beschriftete Schließen-Schaltfläche", () => {
    assert.match(component, /aria-label="Hinweis schließen"/);
  });
});

describe("Einbindung", () => {
  it("läuft nur im öffentlichen Bereich", () => {
    assert.match(publicLayout, /<ReferralPopup/);

    const adminLayout = readFileSync(
      "src/app/admin/(protected)/layout.tsx",
      "utf8",
    );
    assert.ok(
      !adminLayout.includes("ReferralPopup"),
      "das Popup taucht im Adminbereich auf",
    );
  });

  it("zeigt keinen WhatsApp-Knopf ohne gepflegte Nummer", () => {
    // buildWhatsAppUrl liefert dann null, der Zweig fällt auf Kontakt zurück.
    assert.match(component, /whatsappHref \?/);
    assert.match(publicLayout, /buildWhatsAppUrl\(/);
  });
});
