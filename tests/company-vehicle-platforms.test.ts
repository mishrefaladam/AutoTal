import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import {
  companySettingsSchema,
  type CompanySettingsFormValues,
} from "@/modules/company/schemas";
import { VEHICLE_PLATFORMS } from "@/modules/company/vehicle-platforms";

const company: CompanySettingsFormValues = {
  legalName: "AutoTal",
  displayName: "AutoTal",
  tagline: "",
  aboutText: "",
  street: "Teststrasse 1",
  postalCode: "2231",
  city: "Strasshof",
  country: "AT",
  phone: "+43123456789",
  whatsappNumber: "",
  email: "test@example.com",
  vatId: "",
  commercialRegisterNumber: "",
  commercialRegisterCourt: "",
  businessPurpose: "",
  supervisoryAuthority: "",
  gisaNumber: "",
  contactPersonName: "",
  contactPersonRole: "",
  contactPersonEmail: "",
  contactPersonPhone: "",
  latitude: "",
  longitude: "",
  openingHours: [],
  socialLinks: [{ platform: "instagram", url: "https://example.com/social" }],
};

describe("CompanySettings vehicle platform URLs", () => {
  it("keeps all platform URLs separate from social links", () => {
    const urls = {
      willhabenUrl: "https://example.com/willhaben?sort=price&view=list",
      autoscoutUrl: "https://example.com/autoscout",
      gebrauchtwagenUrl: "https://example.com/gebrauchtwagen",
    };
    const parsed = companySettingsSchema.parse({ ...company, ...urls });

    for (const { field } of VEHICLE_PLATFORMS) {
      assert.equal(parsed[field], urls[field]);
    }
    assert.deepEqual(parsed.socialLinks, company.socialLinks);
  });

  for (const { field } of VEHICLE_PLATFORMS) {
    it(`${field}: accepts HTTP/HTTPS without a domain allowlist`, () => {
      for (const url of [
        "https://dealer.example.com/profile?ref=website#vehicles",
        "http://dealer.example.com/profile",
      ]) {
        const parsed = companySettingsSchema.parse({ ...company, [field]: ` ${url} ` });
        assert.equal(parsed[field], url);
      }
    });

    it(`${field}: saves empty, whitespace, null and absent values as null`, () => {
      for (const value of ["", " \n\t ", null, undefined]) {
        const parsed = companySettingsSchema.parse({ ...company, [field]: value });
        assert.equal(parsed[field], null);
      }
    });

    it(`${field}: rejects placeholders, malformed URLs and unsafe protocols`, () => {
      for (const value of [
        "#",
        "dealer.example.com",
        "/profile",
        "//dealer.example.com",
        "javascript:alert(1)",
        "data:text/html,hello",
        "ftp://example.com/profile",
        "https://",
        "https://invalid host/profile",
        "https://example.com/a\nb",
        "https://example.com\\profile",
        `https://example.com/${"a".repeat(500)}`,
      ]) {
        const result = companySettingsSchema.safeParse({ ...company, [field]: value });
        assert.equal(result.success, false, `${field} accepted ${JSON.stringify(value)}`);
        if (!result.success) assert.equal(result.error.issues[0].path[0], field);
      }
    });
  }

  it("does not allow vehicle platforms in the Social Media list", () => {
    for (const platform of ["willhaben", "autoscout24", "gebrauchtwagen.at"]) {
      const result = companySettingsSchema.safeParse({
        ...company,
        socialLinks: [{ platform, url: "https://example.com/profile" }],
      });
      assert.equal(result.success, false);
    }
  });
});

describe("Public vehicle platform links", () => {
  const cases = Array.from({ length: 8 }, (_, mask) =>
    Object.fromEntries(VEHICLE_PLATFORMS.map(({ field }, index) => [
      field,
      mask & (1 << index) ? `https://example.com/${field}` : null,
    ])),
  );
  cases.push({ willhabenUrl: "", autoscoutUrl: " \t ", gebrauchtwagenUrl: null });
  cases.push({});

  // The suite uses react-server conditions; render HTML in a normal React process.
  const rendered: string[] = JSON.parse(execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `
      import { readFileSync } from "node:fs";
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { VehiclePlatformLinks } from "./src/components/site/vehicle-platform-links.tsx";
      const cases = JSON.parse(readFileSync(0, "utf8"));
      console.log(JSON.stringify(cases.map(company =>
        renderToStaticMarkup(createElement(VehiclePlatformLinks, { company }))
      )));
    `,
  ], { input: JSON.stringify(cases), encoding: "utf8" }));

  it("hides the entire section without configured URLs", () => {
    for (const index of [0, 8, 9]) assert.equal(rendered[index], "");
  });

  for (let mask = 1; mask < 8; mask++) {
    it(`renders only configured links for combination ${mask}`, () => {
      const html = rendered[mask];
      const configured = VEHICLE_PLATFORMS.filter((_, index) => mask & (1 << index));
      assert.ok(html.includes("Unsere Fahrzeuge finden Sie auch auf"));
      assert.equal((html.match(/<a\s/g) ?? []).length, configured.length);
      assert.equal((html.match(/target="_blank"/g) ?? []).length, configured.length);
      assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, configured.length);

      for (const { field, label } of VEHICLE_PLATFORMS) {
        const present = configured.some((platform) => platform.field === field);
        assert.equal(html.includes(`href="https://example.com/${field}"`), present);
        assert.equal(html.includes(label), present);
      }
    });
  }
});
