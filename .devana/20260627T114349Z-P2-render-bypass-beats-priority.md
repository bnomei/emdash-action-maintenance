DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | medium | security=no
DEVANA-KEY: src/middleware.ts:65 | render-bypass-beats-priority

# Template-path bypass runs before `render`, violating documented render priority

## Finding

README states that `render` “takes priority over `template`.” In code, `shouldBypassDefault` returns `next()` for requests matching the static template pathname before any state fetch or `options.render` call. When both `template` and `render` are configured, non-template paths use `render` but direct visits to the template path bypass maintenance handling entirely.

## Violated Invariant Or Contract

README middleware options (`README.md` line 288): `render` takes priority over `template`. The same enabled maintenance state should produce the `render` response regardless of which URL the visitor requests.

## Oracle

README render-over-template priority statement. Middleware control-flow order: bypass check (line 65) precedes state fetch (line 83) and `options.render` (line 90).

## Counterexample

1. KV: `{ enabled: true, message: "Down for maintenance" }`.
2. `createMaintenanceMiddleware({ template: "/maintenance", render: (state) => new Response(state.message, { status: 503 }) })`.
3. `GET /page` → fetch → `enabled: true` → `render()` → body `"Down for maintenance"`.
4. `GET /maintenance` (bookmark, refresh, or failed rewrite) → `shouldBypassDefault` true → `next()` immediately → Astro template route renders; `render()` never runs.
5. Two URLs show different maintenance UIs for the same KV state.

## Why It Might Matter

Integrators combining `render` (uniform custom response) with `template` (rewrite target) get inconsistent visitor experience. Direct template URL visits leak the normal Astro page or an unstyled template while other paths show the `render` output.

## Proof

Cross-entry mismatch:

- Entry A (`/page`): bypass false → state fetch → line 90 `options.render(state, context)`.
- Entry B (`/maintenance`): line 65–66 `shouldBypassDefault` true → `next()` — `render` branch unreachable.

Same KV `enabled: true`, different response producers.

## Counterevidence Checked

- `render` alone (no `template`) always reaches line 90 when enabled — correct.
- `template` alone (no `render`) relies on bypass + `next()` for pass-two — intentional for the documented custom-page flow.
- Combining both options is uncommon; README examples never use them together.

Strongest false-positive reason: priority may mean “`render` beats template rewrite on blocked paths” only, not on direct template visits. Evidence against: README wording is global (“takes priority over `template`”) with no path qualifier.

## Suggested Next Step

When `render` is set, skip template-path bypass (or invoke `render` before bypass) so every enabled request uses the same response function.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection across all nine trails (`--all`).
- 2026-06-27: fixed. The template-path branch (introduced by the report-4 fix) now invokes `options.render` when maintenance is enabled and `render` is configured, before falling back to `next()`. So `render` takes priority over `template` on the template path too, matching the README ("render takes priority over template"); the same enabled state produces the same `render` output on `/page` and a direct `/maintenance` visit. Disabled visits still populate locals and `next()`; enabled visits without `render` still `next()` to the Astro page. (First tried routing through `serveMaintenance`, but that falls through to the built-in 503 when `context.rewrite` is unwired, breaking direct-visit tests — reverted to the surgical render check.) Added test "render takes priority over template even on direct template path visits". Suite green (23 passing), typecheck clean.

DEVANA-KEY: src/middleware.ts:65 | render-bypass-beats-priority
DEVANA-SUMMARY: fixed | P2 | medium | Direct visits to the static template path bypass maintenance before `render` runs, so `render`-over-`template` priority holds only on non-template URLs.