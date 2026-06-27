DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | medium | security=no
DEVANA-KEY: src/data.ts:295 | persisted-defaults-mask-config

# Config `defaultMessages`/`defaultMessage` get baked into KV and mask later config changes

## Finding

`normalizeState` merges configured defaults into the persisted message map on every read:

```ts
messages: { ...defaultMessages, ...storedMessages }   // data.ts:295-298
```

`writeMaintenanceState` (data.ts:150-151) re-runs `normalizeState` before `ctx.kv.set`, so the merged object — including locales that were *only* config defaults and never admin-authored — is written into KV under `state:maintenance`. On the next read, `storedMessages` wins the spread, so the baked-in default permanently shadows the live config value.

The same applies to the scalar `message` (data.ts:293-294): if no admin message is ever set, the configured `defaultMessage` is persisted as a non-empty `message` and later config changes to `defaultMessage` are masked.

## Violated Invariant Or Contract

`defaultMessages`/`defaultMessage` are configuration fallbacks, not persisted state. README:274 describes `defaultMessages` as "Locale-specific default messages" and README:206 says the plugin keeps no extra cache and reads fresh each request — implying config is re-resolved, not frozen. The KV record should hold only admin-authored content so that changing or removing a configured default takes effect.

## Oracle

After enabling maintenance with `defaultMessages={fr:"A"}` and no `messages` input, then changing config to `defaultMessages={fr:"B"}` (or removing `fr`), a later read/public response should serve `"B"` (or stop advertising `fr`). It keeps serving `"A"` and keeps advertising `fr`.

## Counterexample

1. KV empty. Config `defaultMessages = { en:"…", fr:"A" }`. Admin clicks the dashboard toggle (`toggleRoute`, no `messages` field).
   - `readMaintenanceState` → `current.messages = {en, fr:"A"}` (defaults merged on read).
   - `readMessagesInput(input, current.messages)` returns `{en, fr:"A"}` (no `messages` key in input).
   - `writeMaintenanceState` → `normalizeState` → `kv.set` persists `messages.fr="A"`. The pure default is now stored data.
2. Operator edits config: `fr → "B"` (or removes `fr`), redeploys.
3. Any read: `{ ...{fr:"B"}, ...{fr:"A"} }` → `"A"` wins. If `fr` was removed from config, `fr:"A"` is still present, so `localeConfig`/`normalizeRequestedLocale` still advertise and serve a locale the operator deliberately removed.

Every plain enable/disable/toggle (the common admin path, no `messages` input) re-bakes the current defaults, making the stale value sticky — it can only be cleared by submitting an explicit `messages` object that omits the locale.

## Why It Might Matter

Operators editing default copy or removing a locale in plugin config will silently keep serving the old copy/locale on the public maintenance page. Config edits to defaults appear to have no effect, which is hard to diagnose.

## Proof

Dataflow trace: config option → `normalizeState` read-merge fills defaults into `messages` (data.ts:295) → merged object becomes caller pre-state (toggle/enable/disable lines 74/95/116) → flows unchanged into `writeMaintenanceState` → re-`normalizeState` → `kv.set` persists defaults as stored data → subsequent read's stored-wins merge masks the new config value.

## Counterevidence Checked

- "Merge order is intended." The read-side precedence (admin overrides beat defaults) is correct; the bug is that defaults are *persisted* at all, not the order. `normalizeMessages` does not strip default-origin keys, so once written they are indistinguishable from admin data.
- "No caller configures `defaultMessages`." Only sites using the documented feature are affected, but for those it triggers on the first write.
- Test lock-in: `test/maintenance.test.mjs` (lines 40-69) asserts only the read-side merge; no test inspects `kv.store` after a write, so the persistence behavior is unverified, not an intended contract. README:206/274 frame defaults as config fallback, contradicting persistence.

## Suggested Next Step

On the write path, persist only admin-authored messages (e.g. normalize/store `input.messages` and the scalar without merging configured defaults), and apply defaults only on read. Confirm by reading `kv.store` after a default-only toggle.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static inspection; corroborated independently by inside-out-paths and cache-persistence trails. Distinct from `partial-messages-replace-kv` (that is about partial input replacing the whole map; this is about config defaults being persisted and freezing).
- 2026-06-27: fixed (suggested approach). Split the single `normalizeState` into `normalizeStoredState(value)` — validates down to admin-authored content only, never merging configured defaults (scalar `message` becomes `""` when unset, `messages` holds only admin locales) — and `resolveState(stored, options, siteLocale)` — applies `defaultMessages`/`defaultMessage` for serving. `writeMaintenanceState` now persists `normalizeStoredState(state)` (admin-only) and returns `resolveState(...)` so action responses still show effective copy. `readMaintenanceState` resolves on read. New internal `readStoredState(ctx)` returns admin-only state, and the three mutation routes (toggle/enable/disable) now base their writes on it, so the report-1 merge and report-8 mirror operate on admin-only fallbacks and never re-bake defaults. Net effect: KV holds only admin content, so editing/removing a configured default takes effect on the next read. Exported `readMaintenanceState`/`writeMaintenanceState` keep their resolved-return contract. Added test "configured defaults are not baked into KV and later config changes take effect" which inspects `kv.store` after a bare default-only toggle (asserts `messages: {}`, `message: ""`) and confirms a changed/removed default is honored on reread. Suite green (24 passing), typecheck clean.

DEVANA-KEY: src/data.ts:295 | persisted-defaults-mask-config
DEVANA-SUMMARY: fixed | P2 | medium | Configured `defaultMessages`/`defaultMessage` are merged into the persisted KV blob on write, so later config changes to defaults are masked and removed default locales keep being served.
