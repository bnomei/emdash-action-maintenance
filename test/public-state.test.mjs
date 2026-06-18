import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicState, publicStateRoute } from "../dist/index.mjs";

const state = {
  enabled: true,
  message: "Fallback message",
  messages: {
    en: "English message",
    de: "Deutsche Nachricht",
  },
  updatedAt: "2026-06-17T00:00:00.000Z",
};

function context({ input, url = "https://example.test/?locale=de" } = {}) {
  return {
    input,
    request: new Request(url),
    site: { locale: "en" },
    kv: {
      async get() {
        return state;
      },
    },
  };
}

async function withEmDashI18nConfig(config, callback) {
  const configModule = await loadEmDashConfigModule();
  const setI18nConfig = configModule.i ?? configModule.setI18nConfig;
  if (typeof setI18nConfig !== "function") throw new Error("EmDash i18n config setter not found");

  setI18nConfig(config);
  try {
    return await callback();
  } finally {
    setI18nConfig(null);
  }
}

async function loadEmDashConfigModule() {
  const emdashDist = dirname(fileURLToPath(import.meta.resolve("emdash")));
  const configFile = (await readdir(emdashDist)).find((file) => /^config-.*\.mjs$/.test(file));
  if (!configFile) throw new Error("EmDash i18n config module not found");
  return import(pathToFileURL(join(emdashDist, configFile)).href);
}

test("public state accepts configured input locale values", async () => {
  const result = await publicStateRoute(context({ input: { locale: "de" } }), {
    defaultLocale: "en",
    locales: ["en", "de"],
  });

  assert.equal(result.locale, "de");
  assert.equal(result.message, "Deutsche Nachricht");
  assert.equal(result.messageLocale, "de");
});

test("public state accepts explicit EmDash fallback locales without accepting unknown locales", async () => {
  await withEmDashI18nConfig(
    {
      defaultLocale: "en",
      locales: ["en", "fr-CA"],
      fallback: {
        "fr-CA": "en",
      },
    },
    () => {
      const fallback = publicState(state, {
        defaultLocale: "en",
        locales: ["en"],
        locale: "fr-CA",
      });
      assert.equal(fallback.locale, "fr-CA");
      assert.equal(fallback.message, "English message");
      assert.equal(fallback.messageLocale, "en");

      const unknown = publicState(state, {
        defaultLocale: "en",
        locales: ["en"],
        locale: "es",
      });
      assert.equal(unknown.locale, null);
      assert.equal(unknown.messageLocale, "en");
    },
  );
});

test("public state ignores unknown locales when EmDash and plugin defaults differ", async () => {
  await withEmDashI18nConfig(
    {
      defaultLocale: "en",
      locales: ["en", "de"],
      fallback: {},
    },
    () => {
      const result = publicState(state, {
        defaultLocale: "de",
        locales: ["en", "de"],
        locale: "fr",
      });

      assert.equal(result.locale, null);
      assert.equal(result.message, "Deutsche Nachricht");
      assert.equal(result.messageLocale, "de");
    },
  );
});

test("public state falls back for unknown input locale values", async () => {
  const result = await publicStateRoute(
    context({ input: { locale: "fr" }, url: "https://example.test/" }),
    {
      defaultLocale: "en",
      locales: ["en", "de"],
    },
  );

  assert.equal(result.locale, null);
  assert.equal(result.message, "English message");
  assert.equal(result.messageLocale, "en");
});

test("public state validates query string locales the same way", async () => {
  const valid = await publicStateRoute(context(), {
    defaultLocale: "en",
    locales: ["en", "de"],
  });
  const invalid = await publicStateRoute(context({ url: "https://example.test/?locale=fr" }), {
    defaultLocale: "en",
    locales: ["en", "de"],
  });

  assert.equal(valid.locale, "de");
  assert.equal(valid.messageLocale, "de");
  assert.equal(invalid.locale, null);
  assert.equal(invalid.messageLocale, "en");
});

test("public state falls back when locale is missing", () => {
  const result = publicState(state, {
    defaultLocale: "en",
    locales: ["en", "de"],
  });

  assert.equal(result.locale, null);
  assert.equal(result.message, "English message");
  assert.equal(result.messageLocale, "en");
});
