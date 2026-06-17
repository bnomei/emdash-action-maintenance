import assert from "node:assert/strict";
import { test } from "node:test";
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

test("public state accepts configured input locale values", async () => {
  const result = await publicStateRoute(context({ input: { locale: "de" } }), {
    defaultLocale: "en",
    locales: ["en", "de"],
  });

  assert.equal(result.locale, "de");
  assert.equal(result.message, "Deutsche Nachricht");
  assert.equal(result.messageLocale, "de");
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
