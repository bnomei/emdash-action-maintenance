DEVANA-FINDING: v1
DEVANA-STATE: open | P1 | high | security=no
DEVANA-KEY: src/middleware.ts:112 | function-template-rewrite-loop

# Function `template` cannot complete Astro rewrite pass-two, causing a rewrite loop

## Finding

`staticTemplatePath` returns `null` when `template` is a function, so `shouldBypassDefault` never bypasses the resolved template URL on the second middleware pass. After pass-one rewrites a public request to the template path, pass-two fetches maintenance state again and calls `context.rewrite(template)` on the same URL instead of `next()`, preventing the custom Astro page from rendering.

## Violated Invariant Or Contract

The middleware API accepts `MaintenanceMiddlewareTemplate` as a function (`src/middleware.ts:19-26`). The two-pass rewrite model requires the template pathname to bypass maintenance blocking on pass-two so `next()` reaches the Astro page. String, `URL`, and `Request` templates get that bypass via `staticTemplatePath`; function templates are excluded.

## Oracle

`test/maintenance.test.mjs` (lines 239–266) proves string `template: "/maintenance"` bypasses on pass-two and returns `"template"` from `next()`. `staticTemplatePath` explicitly returns `null` for `typeof template === "function"` (`src/middleware.ts:112`).

## Counterexample

1. KV maintenance enabled.
2. `createMaintenanceMiddleware({ template: () => "/maintenance" })` with Astro `context.rewrite` wired.
3. Pass-one `GET /page`: fetch `public-state` → `enabled: true` → `setMaintenanceLocal` → `rewrite("/maintenance")`.
4. Pass-two `GET /maintenance`: `staticTemplatePath` is `null` → no bypass → fetch again → `resolveTemplate()` returns `"/maintenance"` → `rewrite("/maintenance")` again.
5. Custom `maintenance.astro` never runs via `next()`; Astro typically errors on repeated rewrites or never serves the custom page.

## Why It Might Matter

Sites using a dynamic function template for maintenance routing cannot serve their custom maintenance page at all. Maintenance mode may appear broken (rewrite loop / error) instead of showing the intended 503 page.

## Proof

Control-flow trace across two middleware invocations:

- Pass-one (`/page`): `shouldBypassDefault` false → state fetch → `enabled: true` → line 93 `context.rewrite(template)`.
- Pass-two (`/maintenance`): `staticTemplatePath(functionTemplate)` → `null` → line 108 comparison never matches → no bypass → same fetch → line 92–93 re-rewrites to self.

Contrast with string template where pass-two hits `url.pathname === templatePath` and returns `next()`.

## Counterevidence Checked

- `options.render` returns before the rewrite branch (line 90) — no loop when only `render` is used.
- README examples use string templates only — loop requires the function form of the exported API.
- Astro might cap rewrite depth — not visible in this package; bypass code for string templates implies pass-two re-invocation is expected.

Strongest false-positive reason: function templates are unused in practice and Astro may not re-invoke middleware on rewrite. Evidence against: `shouldBypassDefault` + `staticTemplatePath` exist solely to handle pass-two for string templates; without re-invocation that branch would be dead code.

## Suggested Next Step

Teach `shouldBypassDefault` / `staticTemplatePath` to resolve function templates (or cache the resolved pathname from pass-one) so pass-two can bypass the rewrite target the same way string templates do.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection across all nine trails (`--all`).

DEVANA-KEY: src/middleware.ts:112 | function-template-rewrite-loop
DEVANA-SUMMARY: open | P1 | high | Function `template` values skip pass-two pathname bypass, so rewrite never reaches `next()` and custom maintenance Astro pages cannot render.