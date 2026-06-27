DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | medium | security=no
DEVANA-KEY: src/data.ts:490 | scalar-message-no-public-update

# POST `message` succeeds but does not change the public maintenance copy when `messages[defaultLocale]` exists

## Finding

Mutating routes (`enable`, `disable`, `toggle`) update the scalar `message` field via `readMessageInput` while preserving the existing `messages` map when the body omits `messages`. `publicStateRoute` and middleware always resolve visitor text through `selectMessage`, which walks `state.messages` before the scalar `message`. When `defaultMessages` or prior KV state seeds `messages[defaultLocale]`, a successful admin POST that sets only `message` persists a new scalar but leaves the public maintenance page unchanged.

## Violated Invariant Or Contract

README documents `message` in action payloads and describes toggle as “optionally with a new message.” A successful mutation response reports `state.message` as updated (`test/maintenance.test.mjs` lines 80–83). Public visitors should see the maintenance text that admin actions intended to set.

## Oracle

README persistence section (`message` fallback vs `messages` locale map, lines 201–204) and toggle payload example (lines 227–234). `selectMessage` map-before-scalar order at `src/data.ts:499–504`. `normalizeState` merges `defaultMessages` into `messages` on every read (`src/data.ts:295–298`).

## Counterexample

1. Plugin options: `defaultLocale: "en"`, `defaultMessages: { en: "Plugin default EN" }`.
2. `POST /enable` body: `{ "message": "Operator override" }` (no `messages` key).
3. `readMessageInput` → `"Operator override"`; `readMessagesInput` → `{ en: "Plugin default EN" }` from merged defaults.
4. KV persists `{ message: "Operator override", messages: { en: "Plugin default EN" } }`.
5. `GET /public-state` (or middleware HTML) with default locale → `selectMessage` chain `["en"]` hits `messages.en` → public `message` stays `"Plugin default EN"`.
6. `actionResult.state.message` is `"Operator override"` — admin response and public output diverge.

## Why It Might Matter

Operators updating maintenance copy through dashboard buttons or API clients that send only `message` believe the site text changed. Visitors continue seeing the old localized/default-map string while admin UI shows the new scalar, causing silent publishing failure during maintenance incidents.

## Proof

Dataflow trace:

- **Source:** `ctx.input.message` on `POST /enable|disable|toggle`
- **Missing check:** no reconciliation between scalar `message` and `messages[defaultLocale]` on write
- **Sink:** `publicStateRoute` → `selectMessage` prefers map entry → middleware `createMaintenanceResponse` / custom template reads stale text

## Counterevidence Checked

- README also calls scalar `message` a “fallback” when locale-specific text is absent — behavior matches that narrow definition when `messages[defaultLocale]` is missing.
- README install example seeds only `de`/`fr` in `defaultMessages`, so English via top-level `message` works in that specific config; failure requires `defaultMessages[defaultLocale]` or a stored `messages[defaultLocale]`.
- Not the same as `partial-messages-replace-kv` (locale map wipe) or `toggle-messages-only-flips` (`enabled` fallback).

Strongest false-positive reason: dual-field semantics may require operators to update `messages.en` explicitly once defaults seed the map. Evidence against: README toggle example still sends top-level `message` as if it updates visible copy; tests assert scalar write success without checking `publicStateRoute` output when a conflicting map entry exists.

## Suggested Next Step

On mutating writes, mirror scalar `message` into `messages[defaultLocale]` when `messages` is omitted, or make `selectMessage` prefer the scalar when a POST just updated it.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection across all nine trails (`--all`).

DEVANA-KEY: src/data.ts:490 | scalar-message-no-public-update
DEVANA-SUMMARY: open | P2 | medium | Admin POST bodies that set only `message` update the scalar in KV but `selectMessage` keeps serving `messages[defaultLocale]`, so public copy does not change.