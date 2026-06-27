import assert from "node:assert/strict";
import test from "node:test";
import {
  actionsManifestRoute,
  createMaintenanceMiddleware,
  createMaintenanceResponse,
  disableRoute,
  enableRoute,
  localeFallbacks,
  maintenanceMessage,
  publicState,
  publicStateRoute,
  readMaintenanceState,
  statusRoute,
  toggleRoute,
} from "../dist/index.mjs";

function createKv(initial) {
  const store = new Map(initial ? [["state:maintenance", initial]] : []);
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
}

function routeContext({ method = "GET", input = {}, state, url = "https://example.test/" } = {}) {
  return {
    input,
    kv: createKv(state),
    request: new Request(url, { method }),
    site: { locale: "en" },
  };
}

test("maintenance state normalization filters invalid stored values and applies defaults", async () => {
  const ctx = routeContext({
    state: {
      enabled: "yes",
      message: "   ",
      messages: {
        en: " English default ",
        de: " Deutsch ",
        "../bad": "ignored",
        empty: "   ",
        object: { text: "ignored" },
      },
      updatedAt: 123,
    },
  });

  const state = await readMaintenanceState(ctx, {
    defaultMessage: "Fallback message",
    defaultMessages: { en: "Configured English", fr: " Français " },
  });

  assert.equal(state.enabled, false);
  assert.equal(state.message, "Fallback message");
  assert.deepEqual(state.messages, {
    en: "English default",
    fr: "Français",
    de: "Deutsch",
  });
  assert.equal(state.updatedAt, null);
});

test("route methods require POST for mutations and expose POST action descriptors", async () => {
  await assert.rejects(() => toggleRoute(routeContext()), /only accepts POST/);
  await assert.rejects(() => enableRoute(routeContext()), /only accepts POST/);
  await assert.rejects(() => disableRoute(routeContext()), /only accepts POST/);

  const manifest = await actionsManifestRoute(routeContext());
  assert.equal(manifest.actions[0].route, "toggle");
  assert.equal(manifest.actions[0].method, "POST");

  const enableCtx = routeContext({ method: "POST", input: { message: "Back soon" } });
  const enabled = await enableRoute(enableCtx);
  assert.equal(enabled.state.enabled, true);
  assert.equal(enabled.state.message, "Back soon");

  const disableCtx = routeContext({ method: "POST", state: enabled.state });
  const disabled = await disableRoute(disableCtx);
  assert.equal(disabled.state.enabled, false);
});

test("partial messages POST merges with stored locales instead of replacing them", async () => {
  const state = {
    enabled: true,
    message: "Base",
    messages: { en: "Custom EN", de: "Custom DE", fr: "Custom FR" },
    updatedAt: "2026-06-17T00:00:00.000Z",
  };

  const ctx = routeContext({
    method: "POST",
    input: { enabled: true, messages: { de: "Updated DE" } },
    state,
  });
  const result = await toggleRoute(ctx);

  assert.deepEqual(result.state.messages, {
    en: "Custom EN",
    de: "Updated DE",
    fr: "Custom FR",
  });

  const emptyCtx = routeContext({
    method: "POST",
    input: { enabled: true, messages: {} },
    state: result.state,
  });
  const unchanged = await toggleRoute(emptyCtx);
  assert.deepEqual(unchanged.state.messages, {
    en: "Custom EN",
    de: "Updated DE",
    fr: "Custom FR",
  });
});

test("toggle preserves enabled for message-only patches but flips on bare toggle", async () => {
  const state = {
    enabled: true,
    message: "Base",
    messages: { en: "Down for maintenance", de: "Wartung" },
    updatedAt: "2026-06-17T00:00:00.000Z",
  };

  // messages-only patch must not change enabled
  const patchCtx = routeContext({
    method: "POST",
    input: { messages: { de: "Wir sind gleich zurück" } },
    state,
  });
  const patched = await toggleRoute(patchCtx);
  assert.equal(patched.state.enabled, true);
  assert.equal(patched.state.messages.de, "Wir sind gleich zurück");

  // message-only patch must not change enabled
  const messageCtx = routeContext({
    method: "POST",
    input: { message: "Neue Nachricht" },
    state,
  });
  assert.equal((await toggleRoute(messageCtx)).state.enabled, true);

  // bare toggle (no content fields) still flips enabled
  const bareCtx = routeContext({ method: "POST", input: {}, state });
  assert.equal((await toggleRoute(bareCtx)).state.enabled, false);
});

test("maintenance action copy follows i18n messages and fallback chains", async () => {
  const i18n = {
    locale: "fr-CA",
    defaultLocale: "en",
    locales: ["en", "fr", "fr-CA"],
    fallback: { "fr-CA": "fr", fr: "en" },
    messages: {
      fr: {
        disableConfirm: "Remettre le site en ligne?",
        disableLabel: "Desactiver le mode maintenance",
        disabled: "Mode maintenance desactive.",
        enableConfirm: "Activer le mode maintenance?",
        enableLabel: "Activer le mode maintenance",
        enabled: "Mode maintenance active.",
      },
    },
  };

  assert.deepEqual(localeFallbacks(i18n), ["fr-CA", "fr", "en"]);
  assert.equal(maintenanceMessage("enableLabel", i18n), "Activer le mode maintenance");

  const enabledCtx = routeContext({ method: "POST", input: { enabled: true } });
  const enabled = await toggleRoute(enabledCtx, { i18n });
  assert.equal(enabled.message, "Mode maintenance active.");
  assert.equal(enabled.label, "Desactiver le mode maintenance");
  assert.equal(enabled.action.label.fr, "Desactiver le mode maintenance");

  const manifest = await actionsManifestRoute(routeContext({ state: enabled.state }), { i18n });
  assert.equal(manifest.actions[0].label.fr, "Desactiver le mode maintenance");
  assert.equal(manifest.actions[0].confirm.fr, "Remettre le site en ligne?");
});

test("public state uses locale fallback chains and falls back on invalid locale values", async () => {
  const state = {
    enabled: true,
    message: "Base message",
    messages: {
      en: "English message",
      fr: "French message",
      "fr-CA": "Canadian French message",
    },
    updatedAt: "2026-06-17T00:00:00.000Z",
  };

  assert.deepEqual(
    publicState(state, { defaultLocale: "en", locales: ["en", "fr"], locale: "fr-CA" }),
    {
      enabled: true,
      locale: "fr-CA",
      message: "Canadian French message",
      messageLocale: "fr-CA",
      updatedAt: state.updatedAt,
    },
  );

  assert.equal(
    publicState(state, { defaultLocale: "en", locales: ["en", "fr"], locale: "fr" }).message,
    "French message",
  );

  assert.deepEqual(publicState(state, { defaultLocale: "en", locales: ["en"], locale: "../bad" }), {
    enabled: true,
    locale: null,
    message: "English message",
    messageLocale: "en",
    updatedAt: state.updatedAt,
  });
});

test("public state route reads request locale and status includes locale configuration", async () => {
  const state = {
    enabled: true,
    message: "Base",
    messages: { en: "English", de: "Deutsch" },
    updatedAt: null,
  };
  const ctx = routeContext({ state, url: "https://example.test/?locale=de" });

  const status = await statusRoute(ctx, { defaultLocale: "en", locales: ["en", "de"] });
  assert.deepEqual(status.locales, ["en", "de"]);

  const publicStatus = await publicStateRoute(ctx, { defaultLocale: "en", locales: ["en", "de"] });
  assert.equal(publicStatus.locale, "de");
  assert.equal(publicStatus.message, "Deutsch");
  assert.equal(publicStatus.messageLocale, "de");
});

test("maintenance response escapes HTML in title, language, and message", async () => {
  const response = createMaintenanceResponse(
    {
      enabled: true,
      locale: 'en" onmouseover="alert(1)',
      message: "<script>alert(\"x\")</script> & 'quoted'",
      messageLocale: null,
      updatedAt: null,
    },
    { title: "Maintenance <window>", retryAfterSeconds: 60 },
  );
  const html = await response.text();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.match(html, /Maintenance &lt;window&gt;/);
  assert.match(
    html,
    /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#039;quoted&#039;/,
  );
  assert.match(html, /lang="en&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("middleware bypasses default asset and API paths before fetching public state", async () => {
  const middleware = createMaintenanceMiddleware();
  const calls = [];
  const locals = {
    emdash: {
      handlePublicPluginApiRoute() {
        calls.push("public-route");
        return {
          success: true,
          data: {
            enabled: true,
            locale: null,
            message: "Down",
            messageLocale: "en",
            updatedAt: null,
          },
        };
      },
    },
  };

  for (const path of [
    "/_emdash/api",
    "/_astro/client.js",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
  ]) {
    const response = await middleware(
      { request: new Request(`https://example.test${path}`), locals },
      () => new Response("next"),
    );
    assert.equal(await response.text(), "next");
  }

  assert.deepEqual(calls, []);
});

test("middleware serves maintenance response and bypasses static template path", async () => {
  const middleware = createMaintenanceMiddleware({ template: "/maintenance" });
  const locals = {
    emdash: {
      handlePublicPluginApiRoute(pluginId, method, path, request) {
        assert.equal(pluginId, "action-maintenance");
        assert.equal(method, "GET");
        assert.equal(path, "/public-state");
        assert.equal(new URL(request.url).searchParams.get("locale"), "de");
        return {
          success: true,
          data: {
            enabled: true,
            locale: "de",
            message: "Wartung",
            messageLocale: "de",
            updatedAt: null,
          },
        };
      },
    },
  };

  const bypassed = await middleware(
    { request: new Request("https://example.test/maintenance"), currentLocale: "de", locals },
    () => new Response("template"),
  );
  assert.equal(await bypassed.text(), "template");

  const response = await middleware(
    { request: new Request("https://example.test/page"), currentLocale: "de", locals },
    () => new Response("next"),
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Wartung/);
});

test("template path bypass still populates locals.maintenance with fresh state", async () => {
  const middleware = createMaintenanceMiddleware({ template: "/maintenance" });

  function localsFor(enabled) {
    return {
      emdash: {
        handlePublicPluginApiRoute(pluginId, method, path) {
          assert.equal(path, "/public-state");
          return {
            success: true,
            data: {
              enabled,
              locale: "de",
              message: enabled ? "Wartung" : "Online",
              messageLocale: "de",
              updatedAt: null,
            },
          };
        },
      },
    };
  }

  // direct visit to the template route renders the page (next) but locals are set
  const enabledLocals = localsFor(true);
  const direct = await middleware(
    { request: new Request("https://example.test/maintenance"), currentLocale: "de", locals: enabledLocals },
    () => new Response("template"),
  );
  assert.equal(await direct.text(), "template");
  assert.equal(enabledLocals.maintenance.enabled, true);
  assert.equal(enabledLocals.maintenance.message, "Wartung");

  // a visit after maintenance was disabled refreshes locals (not stale)
  const disabledLocals = localsFor(false);
  await middleware(
    { request: new Request("https://example.test/maintenance"), currentLocale: "de", locals: disabledLocals },
    () => new Response("template"),
  );
  assert.equal(disabledLocals.maintenance.enabled, false);
  assert.equal(disabledLocals.maintenance.message, "Online");
});

test("function template renders via next() on rewrite pass-two instead of looping", async () => {
  const middleware = createMaintenanceMiddleware({ template: () => "/maintenance" });
  const locals = {
    emdash: {
      handlePublicPluginApiRoute() {
        return {
          success: true,
          data: {
            enabled: true,
            locale: "en",
            message: "Down",
            messageLocale: "en",
            updatedAt: null,
          },
        };
      },
    },
  };

  // pass-one: a normal page rewrites to the resolved template path
  const rewrites = [];
  const passOne = await middleware(
    {
      request: new Request("https://example.test/page"),
      locals,
      rewrite: (target) => {
        rewrites.push(target);
        return new Response("rewritten");
      },
    },
    () => new Response("next"),
  );
  assert.equal(await passOne.text(), "rewritten");
  assert.deepEqual(rewrites, ["/maintenance"]);

  // pass-two: now on the resolved template path, must render via next() (no loop)
  const passTwo = await middleware(
    {
      request: new Request("https://example.test/maintenance"),
      locals,
      rewrite: (target) => {
        rewrites.push(target);
        return new Response("rewritten");
      },
    },
    () => new Response("template-page"),
  );
  assert.equal(await passTwo.text(), "template-page");
  assert.deepEqual(rewrites, ["/maintenance"]); // no second rewrite
  assert.equal(locals.maintenance.enabled, true);
});

test("template bypass matches trailing-slash path variants", async () => {
  const middleware = createMaintenanceMiddleware({ template: "/maintenance" });
  const locals = {
    emdash: {
      handlePublicPluginApiRoute() {
        return {
          success: true,
          data: {
            enabled: true,
            locale: "en",
            message: "Down",
            messageLocale: "en",
            updatedAt: null,
          },
        };
      },
    },
  };

  // canonical trailing-slash URL still delegates to the custom template page
  const response = await middleware(
    { request: new Request("https://example.test/maintenance/"), locals },
    () => new Response("template"),
  );
  assert.equal(await response.text(), "template");
  assert.equal(locals.maintenance.enabled, true);
});

test("middleware fails open by default but fails closed when configured", async () => {
  const failingLocals = {
    emdash: {
      handlePublicPluginApiRoute() {
        return { success: false, error: "kv timeout" };
      },
    },
  };
  const invalidLocals = {
    emdash: {
      handlePublicPluginApiRoute() {
        return { success: true, data: { enabled: "true", message: "Down" } };
      },
    },
  };

  // default: fail open on read failure and on invalid shape
  for (const locals of [failingLocals, invalidLocals]) {
    const mw = createMaintenanceMiddleware();
    const res = await mw(
      { request: new Request("https://example.test/page"), locals },
      () => new Response("next"),
    );
    assert.equal(await res.text(), "next");
  }

  // failClosed: serve 503 on read failure, invalid shape, and missing handler
  for (const locals of [failingLocals, invalidLocals, {}]) {
    const mw = createMaintenanceMiddleware({ failClosed: true });
    const res = await mw(
      { request: new Request("https://example.test/page"), locals },
      () => new Response("next"),
    );
    assert.equal(res.status, 503);
    assert.match(await res.text(), /temporarily unavailable/i);
  }
});
