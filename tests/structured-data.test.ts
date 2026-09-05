import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAutoDealerSchema,
  buildOpeningHoursSpecification,
  serializeJsonLd,
} from "@/modules/company/structured-data";
import type { CompanyDto } from "@/modules/company/types";

/**
 * Strukturierte Daten sind unsichtbar – ein Fehler fällt im Betrieb niemandem
 * auf, kostet aber Sichtbarkeit bei Google. Erfundene Angaben (Öffnungszeiten,
 * Bewertungen) sind sogar schädlich. Deshalb wird hier beides geprüft: dass
 * vorhandene Daten korrekt landen und dass fehlende ersatzlos wegbleiben.
 */

const BASE = "https://autotal.at";

function company(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return {
    legalName: "Autotal e.U.",
    displayName: "AutoTal",
    tagline: "Geprüfte Gebrauchtwagen nahe Wien",
    aboutText: "",
    street: "Hauptstraße 147",
    postalCode: "2231",
    city: "Strasshof an der Nordbahn",
    country: "Österreich",
    addressLine: "Hauptstraße 147, 2231 Strasshof an der Nordbahn",
    phone: "+43 664 3833120",
    phoneHref: "+436643833120",
    whatsappNumber: "436643833120",
    email: "office@example.at",
    vatId: null,
    commercialRegisterNumber: null,
    commercialRegisterCourt: null,
    businessPurpose: null,
    supervisoryAuthority: null,
    gisaNumber: null,
    contactPersonName: null,
    contactPersonRole: null,
    contactPersonEmail: null,
    contactPersonPhone: null,
    latitude: null,
    longitude: null,
    openingHours: [],
    socialLinks: [],
    ...overrides,
  };
}

function slot(weekday: number, opensAt: string | null, closesAt: string | null) {
  return {
    id: `${weekday}`,
    weekday,
    opensAt,
    closesAt,
    closed: opensAt === null,
    note: null,
    position: 0,
  };
}

describe("AutoDealer-Grundgerüst", () => {
  it("meldet das Unternehmen als Fahrzeughändler", () => {
    const schema = buildAutoDealerSchema(company(), BASE);

    assert.equal(schema["@context"], "https://schema.org");
    assert.equal(schema["@type"], "AutoDealer");
    assert.equal(schema.name, "AutoTal");
    assert.equal(schema.url, BASE);
  });

  it("nutzt eine stabile @id, damit Google eine Entität erkennt", () => {
    assert.equal(
      buildAutoDealerSchema(company(), BASE)["@id"],
      "https://autotal.at#autodealer",
    );
  });

  it("entfernt einen abschließenden Schrägstrich aus der Basis-URL", () => {
    const schema = buildAutoDealerSchema(company(), "https://autotal.at/");
    assert.equal(schema.url, "https://autotal.at");
  });

  it("nennt den Firmenbuchnamen zusätzlich als legalName", () => {
    const schema = buildAutoDealerSchema(company(), BASE);
    assert.equal(schema["legalName"], "Autotal e.U.");
  });

  it("lässt legalName weg, wenn er dem Anzeigenamen entspricht", () => {
    const schema = buildAutoDealerSchema(
      company({ legalName: "AutoTal", displayName: "AutoTal" }),
      BASE,
    );
    assert.ok(!("legalName" in schema));
  });
});

describe("Nur gepflegte Daten landen im Schema", () => {
  it("übernimmt Telefon, E-Mail und Beschreibung", () => {
    const schema = buildAutoDealerSchema(company(), BASE);

    assert.equal(schema["telephone"], "+43 664 3833120");
    assert.equal(schema["email"], "office@example.at");
    assert.equal(schema["description"], "Geprüfte Gebrauchtwagen nahe Wien");
  });

  it("lässt leere Felder ersatzlos weg statt sie zu erfinden", () => {
    const schema = buildAutoDealerSchema(
      company({ phone: "", email: "", tagline: null }),
      BASE,
    );

    for (const field of ["telephone", "email", "description"]) {
      assert.ok(!(field in schema), `${field} wurde trotz fehlender Daten gesetzt`);
    }
  });

  it("baut die Adresse aus den Einzelfeldern", () => {
    const address = buildAutoDealerSchema(company(), BASE)["address"] as Record<
      string,
      string
    >;

    assert.equal(address["@type"], "PostalAddress");
    assert.equal(address["streetAddress"], "Hauptstraße 147");
    assert.equal(address["postalCode"], "2231");
    assert.equal(address["addressLocality"], "Strasshof an der Nordbahn");
    assert.equal(address["addressCountry"], "AT");
  });

  it("lässt eine unvollständige Adresse ganz weg", () => {
    // Eine PostalAddress ohne Ort schickt Kartendienste ins Leere.
    const schema = buildAutoDealerSchema(company({ city: "" }), BASE);
    assert.ok(!("address" in schema));
  });

  it("übernimmt Geokoordinaten nur, wenn beide vorhanden sind", () => {
    assert.ok(!("geo" in buildAutoDealerSchema(company(), BASE)));

    const schema = buildAutoDealerSchema(
      company({ latitude: 48.31, longitude: 16.65 }),
      BASE,
    );
    const geo = schema["geo"] as Record<string, unknown>;
    assert.equal(geo["latitude"], 48.31);
    assert.equal(geo["longitude"], 16.65);
  });

  it("verknüpft gepflegte Social-Profile über sameAs", () => {
    const schema = buildAutoDealerSchema(
      company({
        socialLinks: [
          { id: "1", platform: "INSTAGRAM", url: "https://instagram.com/x", label: null, position: 0 },
        ],
      }),
      BASE,
    );

    assert.deepEqual(schema["sameAs"], ["https://instagram.com/x"]);
  });

  it("lässt sameAs weg, solange keine Profile gepflegt sind", () => {
    assert.ok(!("sameAs" in buildAutoDealerSchema(company(), BASE)));
  });
});

describe("Öffnungszeiten", () => {
  it("überträgt Zeiten in das schema.org-Format", () => {
    const spec = buildOpeningHoursSpecification(
      company({ openingHours: [slot(1, "08:30", "18:00")] }),
    );

    assert.deepEqual(spec, [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "08:30",
        closes: "18:00",
      },
    ]);
  });

  it("ordnet alle sieben Wochentage korrekt zu", () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, "09:00", "17:00"));
    const spec = buildOpeningHoursSpecification(company({ openingHours: days }));

    assert.deepEqual(
      spec.map((entry) => entry.dayOfWeek),
      [
        "https://schema.org/Monday",
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
        "https://schema.org/Saturday",
        "https://schema.org/Sunday",
      ],
    );
  });

  it("lässt geschlossene Tage weg, statt 00:00 zu behaupten", () => {
    const spec = buildOpeningHoursSpecification(
      company({ openingHours: [slot(1, "08:30", "18:00"), slot(7, null, null)] }),
    );

    assert.equal(spec.length, 1);
    assert.equal(spec[0].dayOfWeek, "https://schema.org/Monday");
  });

  it("überspringt halbe Angaben", () => {
    const spec = buildOpeningHoursSpecification(
      company({
        openingHours: [
          { ...slot(2, "08:00", null), closed: false },
          { ...slot(3, null, "18:00"), closed: false },
        ],
      }),
    );

    assert.deepEqual(spec, []);
  });

  it("lässt das Feld ganz weg, wenn nichts gepflegt ist", () => {
    const schema = buildAutoDealerSchema(company(), BASE);
    assert.ok(!("openingHoursSpecification" in schema));
  });
});

describe("Es werden keine Bewertungen erfunden", () => {
  it("enthält weder Sterne noch Preisspanne noch Markenpartner", () => {
    const schema = buildAutoDealerSchema(
      company({
        openingHours: [slot(1, "08:30", "18:00")],
        latitude: 48.31,
        longitude: 16.65,
      }),
      BASE,
    );

    for (const field of ["aggregateRating", "review", "priceRange", "brand", "makesOffer"]) {
      assert.ok(!(field in schema), `${field} darf nicht ohne Grundlage auftauchen`);
    }
  });
});

describe("Serialisierung ist skriptsicher", () => {
  it("kann ein Skriptelement nicht vorzeitig beenden", () => {
    // Der Text stammt aus dem Admin und ist damit Nutzereingabe.
    const json = serializeJsonLd(
      buildAutoDealerSchema(
        company({ tagline: "</script><img src=x onerror=alert(1)>" }),
        BASE,
      ),
    );

    assert.ok(!json.includes("</script"), "das Skriptelement lässt sich verlassen");
    assert.ok(!json.includes("<"), "ein rohes < ist im Ausgabetext verblieben");
    assert.ok(!json.includes(">"), "ein rohes > ist im Ausgabetext verblieben");
  });

  it("bleibt trotz Escapes gültiges, inhaltsgleiches JSON", () => {
    const original = buildAutoDealerSchema(
      company({ tagline: "A & B <hier>" }),
      BASE,
    );
    const parsed = JSON.parse(serializeJsonLd(original)) as Record<string, unknown>;

    assert.equal(parsed["description"], "A & B <hier>");
    assert.equal(parsed["@type"], "AutoDealer");
  });
});
