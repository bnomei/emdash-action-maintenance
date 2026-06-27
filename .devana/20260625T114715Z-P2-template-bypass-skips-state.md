DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | medium | security=no
DEVANA-KEY: src/middleware.ts:65 | template-bypass-skips-state

# Template path bypass skips public-state fetch, leaving `locals.maintenance` unset or stale

## Finding

`shouldBypassDefault` returns early for the static maintenance template path before any `public-state` fetch or `setMaintenanceLocal` call. A direct visit to the template route therefore never populates `Astro.locals.maintenance`. On rewrite flows, pass-one sets locals from a single fetch, but pass-two bypasses without refreshing — so a state change between passes can leave stale maintenance data on the shared request context.

## Violated Invariant Or Contract

README documents: "The helper stores the public state on `Astro.locals.maintenance` before rewriting," and the custom template example reads `Astro.locals.maintenance` for the message. The template page should receive the same public state whether reached by rewrite or direct navigation.

## Oracle

README custom template section (`README.md` lines 88–114). Middleware test confirms static template bypass (`test/maintenance.test.mjs` lines 262–266) but does not assert `locals.maintenance` population.

## Counterexample

**Direct visit (locals unset):**

1. Maintenance enabled in KV with `message: "Back at 3pm"` and `messages.en: "Back at 3pm"`
2. Middleware configured with `template: "/maintenance"`
3. Visitor opens `https://example.test/maintenance` directly
4. `shouldBypassDefault` matches `url.pathname === "/maintenance"` (`src/middleware.ts:107–108`) → `return next()` before state fetch
5. `maintenance.astro` executes `const message = state?.message ?? DEFAULT_MESSAGE` → shows package default, not persisted copy

**Rewrite pass-two (locals stale):**

1. Pass-one on `/page`: fetch state (`enabled: true`), `setMaintenanceLocal`, `rewrite("/maintenance")`
2. Admin disables maintenance in KV before pass-two runs
3. Pass-two on `/maintenance`: template bypass → `next()` without re-fetch; `locals.maintenance` still reflects pass-one snapshot
4. Template renders 503 maintenance page while KV says disabled

## Why It Might Matter

Bookmarked maintenance URLs and trailing-slash variants can show wrong copy. A fast disable during an in-flight rewrite can briefly serve a maintenance page after the site should be online.

## Proof

**Cross-entry mismatch:** Rewrite entry (`/page`) fetches state and sets locals (`src/middleware.ts:83–88, 92–93`). Template entry (`/maintenance`) hits bypass first (`src/middleware.ts:65–67`) and never calls `setMaintenanceLocal` (`src/middleware.ts:139–142`).

**Control-flow trace:** `shouldBypassDefault` → `staticTemplatePath` → `url.pathname === templatePath` (`src/middleware.ts:103–108`) runs before `handlePublicRoute`.

## Counterevidence Checked

Built-in `createMaintenanceResponse` path (no custom template) fetches state on every non-bypassed request and is unaffected. Static template bypass is intentional so the Astro page can render, but README assumes locals are pre-populated. Function templates never get a static bypass (`staticTemplatePath` returns `null` when `template` is a function, `src/middleware.ts:111–112`).

## Suggested Next Step

On template-path bypass, still fetch public state and call `setMaintenanceLocal` (or clear locals when maintenance is off). Alternatively document that direct template visits must fetch state themselves.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Split the merged bypass: `shouldBypassStatic` now only short-circuits assets/`/_emdash`/`/_astro`/well-known paths (no state needed). The static template path is handled separately via `matchesStaticTemplatePath`: such requests now fetch public state and call `setMaintenanceLocal` with the current read (even when disabled) before returning `next()`, so direct template visits get populated `locals.maintenance` and a rewrite pass-two refreshes rather than reusing a stale snapshot. Template path renders itself (never the built-in response) to avoid a rewrite loop; on read failure the template path falls back to `next()` (no `failClosed` recursion). Added test "template path bypass still populates locals.maintenance with fresh state". Suite green (18 passing), typecheck clean.

DEVANA-KEY: src/middleware.ts:65 | template-bypass-skips-state
DEVANA-SUMMARY: fixed | P2 | medium | Template path bypass returns `next()` before fetching public state, so `locals.maintenance` is missing on direct template visits and can be stale on rewrite pass-two.