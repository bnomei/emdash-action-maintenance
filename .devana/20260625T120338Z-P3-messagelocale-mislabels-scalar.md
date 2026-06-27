DEVANA-FINDING: v1
DEVANA-STATE: fixed | P3 | medium | security=no
DEVANA-KEY: src/data.ts:504 | messagelocale-mislabels-scalar

# `selectMessage` labels the scalar fallback `message` as `defaultLocale`, producing a wrong `messageLocale` / `<html lang>` / `Content-Language`

## Finding

When no locale-specific entry in `state.messages` matches the requested/fallback chain, `selectMessage` returns the generic scalar `state.message` but tags it `{ locale: defaultLocale }`. The scalar `message` carries no language information, yet it is asserted to be in `defaultLocale`. That label flows unchanged into `PublicMaintenanceState.messageLocale`, then into the maintenance page's `<html lang>` attribute and the `Content-Language` response header. If the scalar message text is authored in a language other than `defaultLocale`, the page declares the wrong language for its body.

## Violated Invariant Or Contract

`messageLocale` must identify the actual language of `message`. The custom-template contract in the README reads `const lang = state?.messageLocale ?? state?.locale ?? "en"`, so `messageLocale` is the authoritative language tag rendered into `<html lang>`. `selectMessage` assigns `defaultLocale` to a string whose language it cannot know.

## Oracle

- `PublicMaintenanceState.messageLocale` field purpose (`src/types.ts:26`) and its documented use as the page language (`README.md` custom-template example, `lang = state?.messageLocale ?? ...`).
- `createMaintenanceResponse` consumes it: `responseLocale = state.messageLocale ?? state.locale ?? "en"` → `<html lang="${lang}">` and `headers.set("Content-Language", responseLocale)` (`src/data.ts:244-272`).
- Existing tests only exercise the scalar fallback with English text and `defaultLocale: "en"` (`test/public-state.test.mjs:143-152`, `test/maintenance.test.mjs`), so the mismatch is never observed.

## Counterexample

1. Plugin configured with `defaultLocale: "en"` and no `defaultMessages` for `en`.
2. Operator sets the maintenance copy in a different language via the dashboard/API: `POST /enable` with body `{ "message": "Wir sind gleich zurück." }` (or configures `defaultMessage` in German on an `en`-default site).
3. `normalizeState` stores `{ enabled: true, message: "Wir sind gleich zurück.", messages: {} , ... }` — the scalar is non-blank so it is kept; `messages` has no `en` key (`src/data.ts:289-298`).
4. A public visitor requests the page with no `locale` (or a locale with no matching message). `readRequestLocale` → `null`; `publicState` → `selectMessage(state, null, "en")`: `chain = ["en"]`, `state.messages["en"]` is `undefined`, so the loop falls through to `return { message: state.message, locale: "en" }` (`src/data.ts:504`).
5. `PublicMaintenanceState.messageLocale = "en"`; `createMaintenanceResponse` emits `<html lang="en">` and `Content-Language: en` around German body text.

## Why It Might Matter

The maintenance page misdeclares its content language. Browser auto-translation, screen-reader pronunciation, and search-engine language indexing rely on `<html lang>` / `Content-Language`; a wrong tag degrades accessibility and correctness for the affected visitors. Impact is bounded (a transient maintenance page, and only when the scalar copy's language differs from `defaultLocale`), hence P3.

## Proof

**State-construction + dataflow trace:** `normalizeState` populates `message` independently of the `messages` map (`src/data.ts:293-298`), so a scalar whose language differs from `defaultLocale` with no matching map key is reachable. `selectMessage` then hardcodes `locale: defaultLocale` for that scalar (`src/data.ts:504`) → `publicState` sets `messageLocale: selected.locale` (`src/data.ts:168`) → `createMaintenanceResponse` renders it into `<html lang>` and `Content-Language` (`src/data.ts:244-247, 272`).

**Counterexample value:** stored `message: "Wir sind gleich zurück."`, `messages: {}`, `defaultLocale: "en"`, request locale `null` → `messageLocale: "en"`.

## Counterevidence Checked

- When `state.messages[defaultLocale]` exists (e.g. the README config where `defaultMessage` is English and `defaultLocale` is `en`), the matched map entry is returned and the label is correct — the bug needs the scalar-fallback branch with content language ≠ `defaultLocale`.
- The value is HTML-escaped, so this is not XSS; it is a metadata-correctness issue only.
- Tests at `test/public-state.test.mjs:143-152` assert `messageLocale: "en"` for the scalar fallback, but only with English scalar text, so they do not bless mislabeling a non-`en` message.
- Reachability requires the operator's scalar copy to be in a language other than `defaultLocale`; this is plausible (single message field, one default locale) but not universal, which is why impact is uncertain/low. The honest label for an untagged scalar would be `null` (consumers already handle `null` via `?? "en"`), not `defaultLocale`.

## Suggested Next Step

Return `{ message: state.message, locale: null }` from the `selectMessage` scalar fallback (or otherwise avoid asserting `defaultLocale` for the untagged scalar), and add a test where the scalar `message` language differs from `defaultLocale` asserting `messageLocale` is not falsely set.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. `selectMessage` scalar-fallback branch now returns `{ message: state.message, locale: null }` instead of `locale: defaultLocale`, so an untagged scalar is no longer falsely asserted to be in `defaultLocale`. `messageLocale` becomes `null` and consumers fall back via `?? state.locale ?? "en"` (a last-resort default rather than a false assertion). Verified existing public-state tests are unaffected — they all carry an `en` key in `state.messages` and hit the matched branch, not the scalar fallback. Added test "scalar message fallback is not falsely tagged with defaultLocale" (German scalar, empty `messages`, `defaultLocale: "en"` → `messageLocale === null`). Suite green (20 passing), typecheck clean.
- 2026-06-27: reopened after validation. The source no longer sets `messageLocale` to `defaultLocale` for the scalar fallback, but the built-in response still resolves `state.messageLocale ?? state.locale ?? "en"` and emits that value in `<html lang>` and `Content-Language`. For the original German scalar/no request-locale counterexample, both locales are `null`, so the response still declares `en` around German text. The partial fix improves `PublicMaintenanceState`, but it does not block the end-to-end response counterexample described in the report.
- 2026-06-27: fixed. `createMaintenanceResponse` now treats language metadata as optional: it uses only `messageLocale ?? locale`, omits `<html lang>` when neither is known, and sets `Content-Language` only when a real locale is available. The README custom-template example now follows the same conditional language-attribute pattern. This blocks the original German scalar/no request-locale counterexample from declaring `en` around untagged text.

DEVANA-KEY: src/data.ts:504 | messagelocale-mislabels-scalar
DEVANA-SUMMARY: fixed | P3 | medium | The scalar fallback `message` is labeled `defaultLocale`, so a maintenance message authored in another language renders with a wrong `<html lang>` / `Content-Language`.
