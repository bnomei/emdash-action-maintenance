DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | medium | security=no
DEVANA-KEY: src/middleware.ts:86 | middleware-fail-open

# Middleware fail-open when public-state fetch fails or returns invalid shape

## Finding

`handleMaintenanceMode` calls `next()` whenever the internal `public-state` fetch is unsuccessful or the payload fails shape validation, even if KV persistence has maintenance enabled. Transient KV errors, handler failures, or malformed responses therefore keep the public site online during an active maintenance window.

## Violated Invariant Or Contract

README states: when maintenance is enabled, the middleware returns a 503 response; when disabled, it calls `next()`. A failed state read is neither documented nor equivalent to "disabled" — it is a third outcome that should not implicitly grant public access while maintenance is intended to be on.

## Oracle

README middleware section (`README.md` lines 56–57). Middleware tests only exercise `success: true` with valid `PublicMaintenanceState` shapes (`test/maintenance.test.mjs` lines 239–274).

## Counterexample

1. KV holds `{ enabled: true, message: "Site down", messages: { en: "Site down" } }`
2. Visitor requests `/about`
3. `handlePublicRoute(..., "/public-state", ...)` returns `{ success: false, error: ... }` (KV timeout) OR `{ success: true, data: { enabled: "true", message: "Site down" } }` (string `enabled` fails `isPublicMaintenanceState`)
4. `state` is `null`; guard `if (!result.success || !state?.enabled) return next()` (`src/middleware.ts:86`)
5. Visitor receives the normal page instead of 503 maintenance HTML

The same fail-open path runs when `getPublicPluginApiRouteHandler` is missing (`src/middleware.ts:72`).

## Why It Might Matter

During planned maintenance, a brief KV or plugin outage can silently reopen the public site. Operators may believe maintenance is enforced when it is not, which is a correctness and availability-boundary issue for outage workflows.

## Proof

**Control-flow trace:** `handleMaintenanceMode` → `handlePublicRoute` → `isPublicMaintenanceState(result.data) ? result.data : null` (`src/middleware.ts:84`) → single guard merges fetch failure, invalid shape, and `enabled: false` into identical `return next()` (`src/middleware.ts:86`).

**Counterexample value:** `result.success === false` while KV `enabled === true`.

## Counterevidence Checked

Fail-open may be an intentional availability trade-off for SSR, but it is not documented in README. In-package `publicStateRoute` normally returns a valid shape, so malformed `data` likely requires framework/runtime faults. Uncaught handler exceptions would propagate rather than fail-open. No test asserts fail-closed behavior on fetch failure.

## Suggested Next Step

Decide product policy: fail-closed (serve 503 or cached last-known enabled state on fetch error) vs documented fail-open. If fail-open is intended, document it; otherwise branch on `result.success === false` separately from `enabled === false`.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Product policy chosen (by maintainer): configurable, default fail-open. Added `failClosed?: boolean` middleware option. The single merged guard was split: a successful "disabled" read still fails open by design, while a failed/invalid read (missing handler, `result.success === false`, or shape validation failure) now routes through `onStateUnavailable`, which honors `failClosed` — serving the maintenance response (built from a synthetic enabled state; empty message falls back to `DEFAULT_MESSAGE`) when set, otherwise `next()`. Default behavior is unchanged and now documented in README "Available middleware options". Refactored maintenance-serving into a shared `serveMaintenance` helper. Added test "middleware fails open by default but fails closed when configured" covering read failure, invalid shape, and missing handler. Suite green (17 passing), typecheck clean.
- 2026-06-27: reopened after validation. The `failClosed` option blocks the failure path only when explicitly configured, but the original default-options counterexample is still reachable: failed/invalid public-state reads and missing handlers reach `onStateUnavailable`, and with default `failClosed` false it returns `next()`. README now documents the default fail-open policy, which may support a later `wontfix` decision, but the original counterexample is not blocked, so `fixed` is not justified.
- 2026-06-27: fixed. Public-state unavailability now fails closed by default: `onStateUnavailable` serves the maintenance response unless `failClosed: false` is explicitly configured. This blocks the original default-options counterexample for failed reads, invalid payloads, and missing handlers. Throwing caller callbacks still fail open by default so the separate callback-throw fix remains intact. Updated README and regression coverage for default fail-closed plus explicit fail-open behavior.
- 2026-06-27: fixed follow-up after independent review. A thrown/rejected public-state dispatcher is now caught next to the dispatcher call and routed through `onStateUnavailable`, so it follows the same default fail-closed policy as returned failures and invalid payloads instead of falling into the broad caller-callback catch. Regression coverage now includes thrown handlers and default-options missing handlers.

DEVANA-KEY: src/middleware.ts:86 | middleware-fail-open
DEVANA-SUMMARY: fixed | P2 | medium | Public-state fetch failures and invalid payloads call `next()`, keeping the site online while KV maintenance may still be enabled.
