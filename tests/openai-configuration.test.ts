import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Verfügbarkeit der KI-Funktion (US-19).
 *
 * Die Prüfung hängt ausschließlich am serverseitigen OPENAI_API_KEY. Sie liest
 * `process.env` bei jedem Aufruf neu – nichts davon wird beim Build eingefroren.
 */

type EnvPatch = Record<string, string | undefined>;

/** Führt `run` mit gesetzten Variablen aus und stellt danach den Stand wieder her. */
async function withEnv<T>(patch: EnvPatch, run: () => Promise<T>): Promise<T> {
  const previous: EnvPatch = {};

  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const { resetEnvCache } = await import("@/lib/env");
  resetEnvCache();

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  }
}

const BASE: EnvPatch = {
  DATABASE_URL: "postgresql://localhost:5432/autotal_test",
  AUTH_SECRET: "test-auth-secret-with-minimum-length",
};

describe("OpenAI-Konfiguration", () => {
  it("meldet die Funktion als eingerichtet, sobald der Key gesetzt ist", async () => {
    await withEnv(
      { ...BASE, OPENAI_API_KEY: "sk-test-key", OPENAI_MODEL: undefined },
      async () => {
        const { isOpenAIConfigured } = await import("@/lib/env");
        assert.equal(isOpenAIConfigured(), true);
      },
    );
  });

  it("verlangt OPENAI_MODEL nicht zusätzlich", async () => {
    await withEnv(
      { ...BASE, OPENAI_API_KEY: "sk-test-key", OPENAI_MODEL: undefined },
      async () => {
        const { env, isOpenAIConfigured } = await import("@/lib/env");
        assert.equal(isOpenAIConfigured(), true);
        assert.equal(env().OPENAI_MODEL, "gpt-4o-mini");
      },
    );
  });

  it("behandelt ein leer angelegtes OPENAI_MODEL wie nicht gesetzt", async () => {
    // In Vercel angelegte, aber leer gelassene Variablen kommen als "" an.
    // Ohne Rückfall ginge der Aufruf mit model: "" an OpenAI und schlüge fehl.
    await withEnv(
      { ...BASE, OPENAI_API_KEY: "sk-test-key", OPENAI_MODEL: "   " },
      async () => {
        const { env } = await import("@/lib/env");
        assert.equal(env().OPENAI_MODEL, "gpt-4o-mini");
      },
    );
  });

  it("meldet die Funktion ohne Key als nicht eingerichtet", async () => {
    await withEnv({ ...BASE, OPENAI_API_KEY: undefined }, async () => {
      const { isOpenAIConfigured } = await import("@/lib/env");
      assert.equal(isOpenAIConfigured(), false);
    });
  });

  it("wertet einen leeren Key als fehlend", async () => {
    await withEnv({ ...BASE, OPENAI_API_KEY: "  " }, async () => {
      const { isOpenAIConfigured } = await import("@/lib/env");
      assert.equal(isOpenAIConfigured(), false);
    });
  });

  it("liest den Key bei jedem Aufruf aus process.env statt aus dem Build", async () => {
    await withEnv({ ...BASE, OPENAI_API_KEY: undefined }, async () => {
      const { isOpenAIConfigured, resetEnvCache } = await import("@/lib/env");
      assert.equal(isOpenAIConfigured(), false);

      process.env.OPENAI_API_KEY = "sk-test-key";
      resetEnvCache();
      assert.equal(isOpenAIConfigured(), true);

      delete process.env.OPENAI_API_KEY;
      resetEnvCache();
    });
  });

  it("nennt die Umgebung, in der die Instanz läuft", async () => {
    await withEnv({ ...BASE, VERCEL_ENV: "preview" }, async () => {
      const { deploymentEnvironment } = await import("@/lib/env");
      assert.equal(deploymentEnvironment(), "preview");
    });

    await withEnv({ ...BASE, VERCEL_ENV: undefined }, async () => {
      const { deploymentEnvironment } = await import("@/lib/env");
      assert.equal(deploymentEnvironment(), null);
    });
  });
});
