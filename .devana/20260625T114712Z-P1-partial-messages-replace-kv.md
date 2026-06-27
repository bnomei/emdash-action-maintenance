DEVANA-FINDING: v1
DEVANA-STATE: fixed | P1 | high | security=no
DEVANA-KEY: src/data.ts:317 | partial-messages-replace-kv

# Partial `messages` POST replaces stored locale map instead of merging

## Finding

When a mutation route receives a request body that includes a `messages` field, `readMessagesInput` returns only the locales present in that payload. Previously persisted locale entries from KV are discarded before write. An admin or client sending a partial locale update (as shown in the README toggle example) silently deletes unstated locales from persisted state.

## Violated Invariant Or Contract

Updating one locale in `messages` should preserve other stored locale entries. The README persistence section describes `messages` as accumulated locale-specific storage, and the toggle payload example sends only `{ de: "..." }`, which implies partial update semantics.

## Oracle

README toggle example (`README.md` lines 227–234) and persistence docs (`README.md` lines 201–204). Contrast with `readMessageInput`, which preserves the current scalar `message` when the field is absent or blank.

## Counterexample

1. KV state: `{ enabled: true, message: "Base", messages: { en: "Custom EN", de: "Custom DE", fr: "Custom FR" }, updatedAt: "2026-06-17T00:00:00.000Z" }`
2. `POST /toggle` body: `{ enabled: true, messages: { de: "Updated DE" } }`
3. `readMessagesInput` returns `{ de: "Updated DE" }` (does not merge with `current.messages`)
4. `normalizeState` writes `{ ...defaultMessages, de: "Updated DE" }` to KV
5. `en`, `fr`, and any other KV-only locales are gone

Sending `messages: {}` has the same effect: all custom locales are wiped, leaving only plugin `defaultMessages`.

## Why It Might Matter

Operators can lose localized maintenance copy without warning. A dashboard or script that patches one locale can erase others, and the API response still looks successful (`ok: true`). Public visitors may see wrong or default language text after an innocent-looking update.

## Proof

**Dataflow trace:** `toggleRoute`/`enableRoute`/`disableRoute` → `readMessagesInput(input, current.messages)` → when `Object.hasOwn(input, "messages")` is true, returns `normalizeMessages(input.messages, true)` only (`src/data.ts:321–325`) → `writeMaintenanceState` → `normalizeState` merges `options.defaultMessages` with that subset (`src/data.ts:295–298`) but never re-applies `current.messages`.

**Counterexample value:** `{ messages: { de: "Updated DE" } }` against stored `{ en: "Custom EN", de: "Custom DE", fr: "Custom FR" }`.

## Counterevidence Checked

When the `messages` key is absent, `readMessagesInput` correctly returns the full `current.messages` fallback. `normalizeState` on read merges `defaultMessages` with stored messages, which masks loss on read if dropped locales happen to match defaults. No test covers partial `messages` writes (`test/maintenance.test.mjs`).

## Suggested Next Step

Merge incoming `messages` with `current.messages` before normalization (e.g. `{ ...fallback, ...normalizeMessages(input.messages, true) }`), and add a test that partial updates preserve unstated locales.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. `readMessagesInput` now returns `{ ...fallback, ...normalizeMessages(input.messages, true) }`, merging incoming locales over `current.messages` so partial updates preserve unstated locales and `messages: {}` is a no-op. Added regression test "partial messages POST merges with stored locales instead of replacing them" in `test/maintenance.test.mjs`. Full suite green (15 passing).

DEVANA-KEY: src/data.ts:317 | partial-messages-replace-kv
DEVANA-SUMMARY: fixed | P1 | high | Partial `messages` POST bodies replace the entire persisted locale map, dropping unstated KV locales despite README partial-update examples.