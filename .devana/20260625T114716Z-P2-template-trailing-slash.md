DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | medium | security=no
DEVANA-KEY: src/middleware.ts:108 | template-trailing-slash

# Template bypass uses exact pathname match, missing trailing-slash variants

## Finding

`shouldBypassDefault` bypasses the maintenance template only when `url.pathname === templatePath` using strict string equality. If Astro `trailingSlash` is `"always"`, a request to `/maintenance/` does not match template `"/maintenance"`, so the middleware treats the template URL as a normal public route and serves built-in 503 HTML (or attempts rewrite) instead of delegating to the custom Astro page.

## Violated Invariant Or Contract

The configured `template` route should remain reachable as the site's maintenance page regardless of trailing-slash normalization. Astro commonly serves both `/path` and `/path/` depending on `trailingSlash` configuration.

## Oracle

README custom template setup uses `template: "/maintenance"` (`README.md` line 81). Middleware test uses `/maintenance` without a trailing slash (`test/maintenance.test.mjs` line 263). `staticTemplatePath` resolves via `new URL(template, url).pathname` (`src/middleware.ts:115–116`) but bypass compares only that exact pathname.

## Counterexample

1. `createMaintenanceMiddleware({ template: "/maintenance" })`
2. Astro config `trailingSlash: "always"`; canonical request URL is `https://example.test/maintenance/`
3. `staticTemplatePath` returns `"/maintenance"`
4. `url.pathname === templatePath` → `"/maintenance/" === "/maintenance"` → false
5. Middleware fetches public state and returns built-in `createMaintenanceResponse` HTML instead of `next()` to the custom `maintenance.astro` page

## Why It Might Matter

Sites with `trailingSlash: "always"` get inconsistent maintenance UX: the custom template works for rewritten requests targeting `/maintenance` but not for slash-suffixed URLs, which may be the canonical form Astro emits.

## Proof

**Counterexample value:** `template: "/maintenance"`, request pathname `"/maintenance/"`.

**Control-flow trace:** `shouldBypassDefault` (`src/middleware.ts:103–108`) → equality check fails → continues to public-state fetch and 503 response path.

## Counterevidence Checked

When `trailingSlash` is `"never"` or `"ignore"`, paths likely align and bypass works (covered by test). No normalization (e.g. `pathname.replace(/\/$/, "")`) is applied before comparison. This does not affect sites using only the built-in HTML response (no `template` option).

## Suggested Next Step

Normalize pathnames before comparison (strip trailing slash except root) or compare using Astro's URL canonicalization if available from `context.url`.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/middleware.ts:108 | template-trailing-slash
DEVANA-SUMMARY: open | P2 | medium | Strict `url.pathname === templatePath` bypass misses trailing-slash variants like `/maintenance/`, breaking custom template rendering.