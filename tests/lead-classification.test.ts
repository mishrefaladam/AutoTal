import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CONTACT_INTENTS,
  CONTACT_INTENT_PARAM,
  CONTACT_INTENT_VALUES,
  contactHrefForIntent,
  contactIntentLeadType,
  parseContactIntent,
} from "@/modules/forms/intent";
import { contactSchema } from "@/modules/forms/schemas";
import {
  INTERACTION_CHANNEL_LABELS,
  INTERACTION_CHANNEL_ORDER,
  parseInteractionChannel,
} from "@/modules/interactions/channels";

/**
 * Die Trennlinie zwischen einem echten Lead und einem bloßen Klick.
 *
 * Diese Tests sichern eine fachliche Aussage ab, keine Implementierung: Ein
 * Klick auf „WhatsApp“ oder „willhaben“ ist keine Anfrage und schon gar kein
 * Verkauf. Würde diese Trennung fallen, stünden im CRM Kontakte, die es nie
 * gegeben hat – und die Statistik wäre nicht bloß falsch, sondern nicht mehr
 * als falsch erkennbar.
 *
 * Ebenso abgesichert: dass der Kontext einer Anfrage erhalten bleibt, statt
 * jede Anfrage als GENERAL abzulegen.
 */

const formActions = readFileSync("src/modules/forms/actions.ts", "utf8");
const interactionsRoute = readFileSync(
  "src/app/api/interactions/route.ts",
  "utf8",
);
const interactionLink = readFileSync(
  "src/components/site/interaction-link.tsx",
  "utf8",
);
const platformLinks = readFileSync(
  "src/components/site/vehicle-platform-links.tsx",
  "utf8",
);
const crmPage = readFileSync("src/app/admin/(protected)/crm/page.tsx", "utf8");

/**
 * Entfernt Kommentare, damit eine Erwähnung im Fließtext nicht als Code
 * durchgeht. Der Ausdruck für Zeilenkommentare verlangt bewusst, dass vor den
 * beiden Schrägstrichen kein Doppelpunkt steht – sonst würde er das "//" in
 * "https://" treffen und ganze URLs verschlucken.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Vollständige, gültige Eingabe des Kontaktformulars. */
function contactPayload(extra: Record<string, unknown> = {}) {
  return {
    name: "Maria Huber",
    email: "maria.huber@example.at",
    phone: "",
    subject: "Anfrage",
    message: "Ich hätte gerne mehr Informationen zu Ihrem Angebot.",
    privacyConsent: true,
    website: "",
    ...extra,
  };
}

/** Parst das Formular und liefert den Lead-Typ, der daraus entstünde. */
function leadTypeFor(extra: Record<string, unknown> = {}) {
  const parsed = contactSchema.safeParse(contactPayload(extra));
  assert.equal(
    parsed.success,
    true,
    `Das Formular hätte angenommen werden müssen: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );

  return contactIntentLeadType(parsed.success ? parsed.data.intent : undefined);
}

describe("Anliegen des Kontaktformulars", () => {
  it("ordnet eine Anfrage ohne Kontext als allgemeine Anfrage ein", () => {
    assert.equal(leadTypeFor(), "GENERAL");
  });

  it("erkennt eine Anfrage von der Finanzierungsseite", () => {
    assert.equal(leadTypeFor({ intent: "finanzierung" }), "FINANCING");
  });

  it("erkennt eine Probefahrt-Anfrage", () => {
    assert.equal(leadTypeFor({ intent: "probefahrt" }), "TEST_DRIVE");
  });

  it("fällt bei einem unbekannten Anliegen auf eine allgemeine Anfrage zurück", () => {
    // Der Wert steht in der URL und ist damit frei wählbar. Ein Tippfehler
    // oder ein veralteter Link darf keinen erfundenen Typ erzeugen.
    for (const unsinn of ["kaufen", "BUY", "../../etc", "", "  ", "1"]) {
      assert.equal(
        leadTypeFor({ intent: unsinn }),
        "GENERAL",
        `„${unsinn}“ hätte auf GENERAL fallen müssen`,
      );
    }
  });

  it("blockiert das Absenden bei einem unbekannten Anliegen nicht", () => {
    // Das ist der eigentliche Punkt: Lieber falsch einsortiert als gar nicht
    // angekommen. Ein kaputter Link darf niemanden am Anfragen hindern.
    const parsed = contactSchema.safeParse(
      contactPayload({ intent: "voellig-erfunden" }),
    );

    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.intent, undefined);
  });

  it("liest das Anliegen auch aus einem mehrfach gesetzten Parameter", () => {
    assert.equal(
      parseContactIntent(["finanzierung", "probefahrt"]),
      "finanzierung",
    );
    assert.equal(parseContactIntent(undefined), null);
    assert.equal(parseContactIntent(null), null);
  });

  it("baut Links, die genau den erwarteten Parameter tragen", () => {
    assert.equal(
      contactHrefForIntent("finanzierung"),
      `/kontakt?${CONTACT_INTENT_PARAM}=finanzierung`,
    );
    assert.equal(
      contactHrefForIntent("probefahrt"),
      `/kontakt?${CONTACT_INTENT_PARAM}=probefahrt`,
    );
  });

  it("hat für jedes Anliegen einen Betreff und einen Hinweis", () => {
    for (const intent of CONTACT_INTENT_VALUES) {
      const config = CONTACT_INTENTS[intent];
      assert.ok(config.subject.length > 0, `${intent} ohne Betreff`);
      assert.ok(config.notice.length > 0, `${intent} ohne Hinweis`);
    }
  });

  it("setzt den Lead-Typ aus dem Anliegen statt fest auf GENERAL", () => {
    const code = stripComments(formActions);

    assert.match(
      code,
      /type:\s*contactIntentLeadType\(data\.intent\)/,
      "Das Kontaktformular muss den Typ aus dem Anliegen ableiten.",
    );
    assert.doesNotMatch(
      code,
      /type:\s*"GENERAL"/,
      "GENERAL darf nicht mehr fest verdrahtet sein.",
    );
  });
});

describe("Ein Klick ist kein Lead", () => {
  it("legt im Zählendpunkt keinen CRM-Lead an", () => {
    const code = stripComments(interactionsRoute);

    assert.doesNotMatch(
      code,
      /createCrmLead|crmLead|CrmLead/,
      "Der Zählendpunkt darf das CRM nicht berühren.",
    );
    assert.match(
      code,
      /recordInteraction/,
      "Der Zählendpunkt soll ausschließlich den Zähler hochzählen.",
    );
  });

  it("erzeugt beim WhatsApp-Klick keine Anfrage, sondern nur einen Zähler", () => {
    const code = stripComments(interactionLink);

    assert.doesNotMatch(
      code,
      /createCrmLead|submitContactForm|CrmLead/,
      "Der ausgehende Link darf keine Anfrage auslösen.",
    );
    assert.match(
      code,
      /sendBeacon/,
      "Der Klick soll im Hintergrund gemeldet werden, nicht blockierend.",
    );
  });

  it("erzeugt aus einem willhaben-Klick keinen Kauf-Lead", () => {
    // Der schädlichste denkbare Fehler: Aus „hat weggeklickt“ würde
    // „will kaufen“ und am Ende eine Verkaufszahl.
    for (const [name, source] of [
      ["Plattform-Links", platformLinks],
      ["Zählendpunkt", interactionsRoute],
      ["Formular-Actions", formActions],
    ] as const) {
      assert.doesNotMatch(
        stripComments(source),
        /"BUY"|'BUY'/,
        `${name} darf keinen BUY-Lead erzeugen.`,
      );
    }
  });

  it("verlinkt die Plattformen als Zählkanal, nicht als Lead-Quelle", () => {
    const code = stripComments(platformLinks);

    assert.match(code, /InteractionLink/);
    assert.doesNotMatch(
      code,
      /CrmLeadSource|createCrmLead/,
      "Eine Plattform ist hier ein Kanal, keine Lead-Quelle.",
    );
  });

  it("setzt bei automatisch erzeugten Leads ausschließlich WEBSITE als Quelle", () => {
    const sources = [...stripComments(formActions).matchAll(/source:\s*"(\w+)"/g)]
      .map((match) => match[1])
      .filter((value) => value !== "website"); // Feld der Ankaufanfrage

    assert.ok(sources.length > 0, "Es sollte mindestens eine Quelle gesetzt werden.");
    assert.deepEqual(
      [...new Set(sources)],
      ["WEBSITE"],
      "WHATSAPP, WILLHABEN & Co. dürfen nur manuell im Admin gewählt werden.",
    );
  });
});

describe("Interaktionszähler und Leads bleiben getrennt", () => {
  it("kennt genau die geforderten Kanäle", () => {
    assert.deepEqual([...INTERACTION_CHANNEL_ORDER].sort(), [
      "AUTOSCOUT",
      "EMAIL",
      "GEBRAUCHTWAGEN",
      "INSTAGRAM",
      "PHONE",
      "TIKTOK",
      "WHATSAPP",
      "WILLHABEN",
    ]);
  });

  it("beschriftet jeden Kanal", () => {
    for (const channel of INTERACTION_CHANNEL_ORDER) {
      assert.ok(
        INTERACTION_CHANNEL_LABELS[channel]?.length > 0,
        `${channel} ohne Beschriftung`,
      );
    }
  });

  it("zählt nur bekannte Kanäle", () => {
    assert.equal(parseInteractionChannel("WHATSAPP"), "WHATSAPP");
    assert.equal(parseInteractionChannel("ERFUNDEN"), null);
    assert.equal(parseInteractionChannel(42), null);
    assert.equal(parseInteractionChannel(null), null);
    assert.equal(parseInteractionChannel({ channel: "PHONE" }), null);
  });

  it("zeigt die Klicks getrennt von den Lead-Zahlen an", () => {
    // Beide Zahlenwerke stehen auf derselben Seite. Sie dürfen sich weder
    // dieselbe Karte noch dieselbe Quelle teilen.
    assert.match(crmPage, /AdminCard title="Website-Interaktionen"/);
    assert.match(crmPage, /AdminCard title="Statistik"/);

    const leadCounts = /stats\.byType\[/;
    const clickCounts = /interactions\.byChannel\[/;

    assert.match(crmPage, leadCounts);
    assert.match(crmPage, clickCounts);

    // Kein Ausdruck darf beide Zahlenreihen verrechnen.
    assert.doesNotMatch(
      stripComments(crmPage),
      /interactions\.total\s*\+|\+\s*interactions\.total/,
      "Klicks dürfen nicht zu den Leads addiert werden.",
    );
  });

  it("behauptet im Admin keine Nachricht, keinen Kauf und keinen Abschluss", () => {
    // Die Kachelbeschriftungen müssen beim Klick bleiben.
    const meanings = readFileSync("src/modules/interactions/channels.ts", "utf8");

    for (const verbotenes of [
      "gesendet",
      "gekauft",
      "verkauft",
      "abgeschlossen",
      "angerufen",
    ]) {
      assert.doesNotMatch(
        stripComments(meanings),
        new RegExp(`"[^"]*${verbotenes}[^"]*"`),
        `„${verbotenes}“ behauptet mehr, als ein Klick hergibt.`,
      );
    }
  });

  it("speichert für die Klickstatistik nichts Personenbezogenes", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = schema.slice(schema.indexOf("model InteractionCounter"));
    const body = model.slice(0, model.indexOf("}") + 1);

    for (const feld of [
      "ip",
      "userAgent",
      "sessionId",
      "visitorId",
      "email",
      "name",
    ]) {
      assert.doesNotMatch(
        body,
        new RegExp(`\\b${feld}\\b`, "i"),
        `InteractionCounter darf kein Feld „${feld}“ haben.`,
      );
    }

    // Tagesauflösung statt Zeitstempel: Ein genauer Zeitpunkt ließe sich mit
    // anderen Quellen zu einer Spur verketten.
    assert.match(body, /day\s+DateTime\s+@db\.Date/);
  });
});
