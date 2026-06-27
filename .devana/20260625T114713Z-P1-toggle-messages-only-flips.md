DEVANA-FINDING: v1
DEVANA-STATE: fixed | P1 | high | security=no
DEVANA-KEY: src/data.ts:68 | toggle-messages-only-flips

# `toggle` route flips `enabled` when body contains only `messages`

## Finding

`toggleRoute` calls `readEnabledInput(input, !current.enabled)`. When the request body omits `enabled` but includes `messages`, the fallback is `!current.enabled`, so maintenance mode is toggled even though the caller may only intend to update localized copy. Combined with partial `messages` replacement, a message-only patch can both flip maintenance state and drop locale entries.

## Violated Invariant Or Contract

Optional body fields should be independently optional on `toggle`. Supplying only `messages` should update messages without changing `enabled`. README lists `message`, `messages`, and `enabled` as separate optional toggle fields.

## Oracle

`readMessageInput` and `readMessagesInput` preserve current values when their keys are absent. `readEnabledInput` should behave the same, but its fallback is `!current.enabled` (toggle semantics) rather than `current.enabled` (preserve semantics).

## Counterexample

1. Current KV state: `{ enabled: true, messages: { en: "Down for maintenance", de: "Wartung" } }`
2. `POST /toggle` body: `{ messages: { de: "Wir sind gleich zurück" } }` (no `enabled` field)
3. `readEnabledInput(input, !current.enabled)` evaluates `!true` → `false`
4. Persisted state becomes `{ enabled: false, messages: { de: "Wir sind gleich zurück" } }` (also loses `en` via partial-messages bug)
5. Public site comes back online while the operator believed they only edited German copy

## Why It Might Matter

Custom clients, scripts, or future dashboard actions that PATCH localized messages through `toggle` can accidentally disable maintenance mode during an active outage, exposing the public site.

## Proof

**Control-flow trace:** `toggleRoute` (`src/data.ts:68`) → `readEnabledInput(input, !current.enabled)` (`src/data.ts:328–333`) → when `enabled` key absent, returns toggle fallback, not `current.enabled` → `writeMaintenanceState` persists flipped boolean.

**Counterexample value:** `enabled: true` in KV, POST body `{ messages: { de: "Neu" } }`.

## Counterevidence Checked

Bare POST toggle with empty body correctly toggles (`!current.enabled` is intentional for that case; covered by `test/maintenance.test.mjs` lines 111–115 with explicit `enabled: true`). `enableRoute`/`disableRoute` hard-code `enabled` and are unaffected. No test covers messages-only toggle POST.

## Suggested Next Step

Use `current.enabled` as the fallback in `toggleRoute` when `enabled` is absent (reserve `!current.enabled` only for empty-body toggle), or reject bodies that mix `messages`/`message` without an explicit `enabled` field.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. `toggleRoute` now computes `isContentPatch` (body has `message` or `messages`) and uses `current.enabled` as the fallback for content patches, reserving `!current.enabled` for bare empty-body toggles. Explicit `enabled` is still always honored. Added regression test "toggle preserves enabled for message-only patches but flips on bare toggle". Full suite green (16 passing).

DEVANA-KEY: src/data.ts:68 | toggle-messages-only-flips
DEVANA-SUMMARY: fixed | P1 | high | POST to `toggle` with only `messages` toggles `enabled` via `!current.enabled` fallback, unintentionally bringing the site online or putting it into maintenance.