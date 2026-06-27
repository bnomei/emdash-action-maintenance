DEVANA-FINDING: v1
DEVANA-STATE: fixed | P3 | medium | security=no
DEVANA-KEY: src/data.ts:243 | retry-after-invalid-header

# Non-integer/negative/NaN `retryAfterSeconds` emits an invalid `Retry-After` header

## Finding

`createMaintenanceResponse` stringifies the caller-supplied retry value with no numeric validation:

```ts
const retryAfter = String(options.retryAfterSeconds ?? 300);   // data.ts:243
…
headers.set("Retry-After", retryAfter);                        // data.ts:270 (via Headers init at 267-271)
```

`String(NaN)` → `"NaN"`, `String(1.5)` → `"1.5"`, `String(-5)` → `"-5"`, all written verbatim into the header. The value comes from `options.response.retryAfterSeconds`, which the middleware forwards from integrator config or a per-request function (middleware.ts:95-100).

## Violated Invariant Or Contract

RFC 7231 §7.1.3: `Retry-After` must be a non-negative integer (`delta-seconds = 1*DIGIT`) or an HTTP-date. `NaN`, `1.5`, and `-5` satisfy none of these. The `?? 300` default signals integer-seconds intent.

## Oracle

RFC 7231 Retry-After grammar; conformant clients ignore a malformed value, defeating the purpose of advertising a retry window.

## Counterexample

`response: { retryAfterSeconds: NaN }` → header `Retry-After: NaN`; `1.5` → `Retry-After: 1.5`; `-5` → `Retry-After: -5`. `Headers.set` accepts the string without throwing, so the bug is silent.

## Why It Might Matter

Crawlers, monitoring, and CDNs that honor `Retry-After` cannot parse the value and fall back to their own behavior, so the maintenance window hint is silently lost. Low blast radius (no crash), hence P3.

## Proof

Counterexample value: `createMaintenanceResponse(state, { retryAfterSeconds: NaN }).headers.get("Retry-After") === "NaN"`. No `Number.isFinite` / `Math.trunc` / `>= 0` guard exists between the option and the header.

## Counterevidence Checked

- "Clients just ignore a bad Retry-After, so it's cosmetic." It still violates the header contract the field exists to satisfy; the integer `?? 300` default shows integer intent, and the only test (maintenance.test.mjs:186-191 region) covers only a valid value. The field is per-request caller-derivable, so a bad computed value is realistic.

## Suggested Next Step

Coerce/validate: `const n = Math.trunc(options.retryAfterSeconds ?? 300); const retryAfter = String(Number.isFinite(n) && n >= 0 ? n : 300);`.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static inspection via boundaries-oracles trail. Sibling to `response-status-range-crash` but distinct mechanism (silent bad header vs crash).
- 2026-06-27: fixed. Added `normalizeRetryAfter(seconds)` = `Math.trunc(seconds ?? 300)` then fall back to 300 unless `Number.isFinite && >= 0`. `createMaintenanceResponse` now stringifies the normalized value into the `Retry-After` header, so `NaN`/`-5`/`Infinity` become `300` and fractional values are truncated to integer seconds (RFC 7231 §7.1.3 `delta-seconds`). Valid integers (incl. 0) pass through. Added test "Retry-After header is coerced to a non-negative integer". Suite green (27 passing), typecheck clean.

DEVANA-KEY: src/data.ts:243 | retry-after-invalid-header
DEVANA-SUMMARY: fixed | P3 | medium | A non-integer/negative/NaN `retryAfterSeconds` is stringified straight into the `Retry-After` header, producing an RFC-invalid value that clients silently ignore.
