import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildInstagramSystemPrompt,
  buildVehiclePrompt,
  generateInstagramCaption,
  type CaptionCompletionRequest,
} from "@/integrations/openai";
import type { VehicleDetail } from "@/modules/vehicles/types";

const VEHICLE: VehicleDetail = {
  id: "vehicle-1",
  slug: "bmw-x5-40e",
  make: "BMW",
  model: "X5 40e",
  variant: "M-Paket",
  title: "BMW X5 40e M-Paket",
  priceCents: 3_215_000,
  vatDeductible: false,
  mileageKm: 129_127,
  firstRegistration: new Date("2018-07-01T00:00:00.000Z"),
  fuel: "HYBRID",
  transmission: null,
  drivetrain: "ALL_WHEEL",
  bodyType: "SUV",
  condition: "USED",
  powerKw: 180,
  primaryImage: null,
  imageCount: 0,
  images: [],
  description: "",
  features: ["Abstandstempomat", "360°-Kamera"],
  color: null,
  doors: null,
  seats: null,
  previousOwners: null,
  displacementCcm: null,
  grossWeightKg: null,
  nationalCode: null,
  vehicleType: null,
  extras: [],
  highlights: ["Head-up-Display"],
  inspectionValidUntil: null,
  externalSource: "manual",
  externalId: "vehicle-1",
  lastSyncedAt: new Date("2026-09-08T00:00:00.000Z"),
};

const COMPANY = { displayName: "AutoTal", city: "Strasshof an der Nordbahn" };

describe("OpenAI-Prompt für Instagram-Captions", () => {
  it("enthält die vollständigen Anti-Halluzinationsregeln", () => {
    const prompt = buildInstagramSystemPrompt();

    assert.match(prompt, /ausschließlich die angegebenen Fahrzeugdaten/i);
    assert.match(prompt, /Erfinde keine Ausstattung, keine Garantie, keinen Preis/i);
    assert.match(prompt, /keine Finanzierung, keine Zustandsbeschreibung/i);
    assert.match(prompt, /unfallfrei[\s\S]*1\. Besitz[\s\S]*servicegepflegt/i);
    assert.match(prompt, /unschlagbar[\s\S]*perfekt[\s\S]*garantiert/i);
  });

  it("nimmt fehlende optionale Fahrzeugdaten nicht als Defaults auf", () => {
    const prompt = buildVehiclePrompt(VEHICLE, COMPANY);

    assert.doesNotMatch(prompt, /Getriebe:/);
    assert.doesNotMatch(prompt, /Farbe:/);
    assert.doesNotMatch(prompt, /Türen:/);
    assert.doesNotMatch(prompt, /Sitze:/);
    assert.doesNotMatch(prompt, /Beschreibung des Händlers:/);
    assert.doesNotMatch(prompt, /unbekannt|keine Angabe/i);
  });

  it("verwendet einen Beispieltext ausschließlich als Stilreferenz", () => {
    const exampleText = "MEINE STILREFERENZ: kurz, ruhig, klare Aufzählung.";
    const prompt = buildVehiclePrompt(VEHICLE, COMPANY, { exampleText });

    assert.match(prompt, /STILREFERENZ \(nur Stil und Aufbau, keine Fakten übernehmen\)/);
    assert.match(prompt, /MEINE STILREFERENZ/);
    assert.match(prompt, /eigenständig formuliert/i);
  });

  it("fällt bei leerem oder fehlendem Beispieltext auf den Default zurück", () => {
    for (const exampleText of [undefined, null, "   "]) {
      const prompt = buildVehiclePrompt(VEHICLE, COMPANY, { exampleText });
      assert.match(prompt, /BMW X5 40e \| M-Paket \| Hybrid/);
    }
  });

  it("mockt OpenAI und gibt nur die neu erzeugte Caption zurück", async () => {
    const requests: CaptionCompletionRequest[] = [];
    const generatedCaption =
      "BMW X5 40e mit M-Paket.\n\nHighlights:\n• Abstandstempomat\n• 360°-Kamera\n\nJetzt bei AutoTal bei Wien anfragen.";

    const result = await generateInstagramCaption(
      VEHICLE,
      COMPANY,
      { exampleText: "Nur eine Stilvorlage, nicht der fertige Text." },
      {
        model: "mock-model",
        createCompletion: async (request) => {
          requests.push(request);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    caption: generatedCaption,
                    hashtags: [
                      "#AutoTal",
                      "AutoTalWien",
                      "GebrauchtwagenWien",
                      "BMW",
                      "BMWX5",
                      "Hybrid",
                    ],
                  }),
                },
              },
            ],
          };
        },
      },
    );

    assert.equal(requests.length, 1);
    assert.match(String(requests[0].messages[1]?.content), /Nur eine Stilvorlage/);
    assert.equal(result.caption, generatedCaption);
    assert.doesNotMatch(result.caption, /Nur eine Stilvorlage/);
    assert.deepEqual(result.hashtags, [
      "AutoTal",
      "AutoTalWien",
      "GebrauchtwagenWien",
      "BMW",
      "BMWX5",
      "Hybrid",
    ]);
    assert.equal(result.model, "mock-model");
  });
});

describe("Sicherer Social-Media-Workflow", () => {
  const openaiSource = readFileSync("src/integrations/openai/index.ts", "utf8");
  const socialActions = readFileSync("src/modules/social/actions.ts", "utf8");

  it("hält den OpenAI-Key in einem server-only Modul", () => {
    assert.match(openaiSource, /^import "server-only";/);
    assert.doesNotMatch(openaiSource, /NEXT_PUBLIC_OPENAI/);
  });

  it("speichert die Generierung als Entwurf und veröffentlicht nicht automatisch", () => {
    const generateStart = socialActions.indexOf("export async function generateCaption");
    const updateStart = socialActions.indexOf("export async function updateDraft");
    const generateAction = socialActions.slice(generateStart, updateStart);

    assert.match(generateAction, /status:\s*"DRAFT"/);
    assert.doesNotMatch(generateAction, /publishImagePost\(/);
  });
});
