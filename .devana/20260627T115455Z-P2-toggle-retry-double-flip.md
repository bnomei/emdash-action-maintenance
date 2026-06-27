DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | medium | security=no
DEVANA-KEY: src/data.ts:68 | toggle-retry-double-flip

# `toggle` relative flip is non-idempotent: HTTP retry or concurrent click flips the wrong way

## Finding

`toggleRoute` computes the new `enabled` value relative to a freshly read state, across a non-atomic read→write gap:

```ts
const current = await readMaintenanceState(ctx, options);          // data.ts:66
const input = asRecord(ctx.input);
const enabled = readEnabledInput(input, !current.enabled);         // data.ts:68
const state = await writeMaintenanceState(ctx, { enabled, … });    // data.ts:69
```

The dashboard action descriptor carries no `enabled` payload (`route:"toggle"`, `method:"POST"`, data.ts:199-212), so the button path always falls through to `!current.enabled` — a relative flip. The KV surface is `get`/`set` only (test mock at maintenance.test.mjs:21-28; README:206 defers consistency to the backend and adds no guard), so the read-compute-write has no compare-and-swap or version check.

## Violated Invariant Or Contract

A relative toggle must apply exactly once per logical request and compose deterministically: two toggles return to the original state, and one logical request flips once regardless of HTTP retransmission. That requires the read-compute-write to be atomic/serializable per key, or the operation to be made idempotent.

## Oracle

`enable`/`disable` (data.ts:83-123) write absolute `enabled: true|false` independent of the prior read and are therefore retry/concurrency-safe. `toggle` is the only state-changing route that derives `enabled` from a stale read — an internal inconsistency that pinpoints the defect.

## Counterexample

Retry double-flip (no concurrency needed, at-least-once HTTP delivery):
- Stored `enabled=false`. A proxy/load-balancer/client retransmits a timed-out `POST /toggle`.
- Delivery #1: read `false` → write `enabled=true`. Response lost to timeout.
- Delivery #2 (automatic retry of the same logical request): read `true` → write `enabled=false`.
- One logical toggle nets to zero flips; the admin believes maintenance is enabled but the site is live.

Concurrent lost-toggle:
- Stored `enabled=false`. Two near-simultaneous `POST /toggle` (double-click / two tabs).
- Both read `false`, both compute `!false=true`, both `set(true)`. Two operations, one net flip; the user's "toggled twice → back to false" model is violated and the site is left in maintenance.

## Why It Might Matter

The public site is put into, or pulled out of, maintenance mode contrary to operator intent — a user-facing availability/state-correctness bug triggered by ordinary network retries, not just rare races.

## Proof

State-transition / event-order trace over the read(66)→compute(68)→set(69) gap: `enabled` is derived from a stale `current.enabled` and persisted with no CAS/version guard, so duplicated or interleaved relative POSTs reach a persisted `enabled` that contradicts the operation count.

## Counterevidence Checked

- "The KV backend or action framework serializes these writes." The consumed KV surface is only `get`/`set` (mock + every call site), there is no CAS/transaction in the code path, and README:206 explicitly defers consistency and disclaims extra guarantees. The retry counterexample needs no concurrency at all, so even a perfectly serializing KV does not fix it.
- "The dashboard sends an absolute `enabled`." The descriptor (data.ts:199-212) sends none; default semantics are the relative `!current.enabled` flip.
- Distinct from `toggle-messages-only-flips` (data.ts:68), which is about an input-shape flip when only `messages` is posted; this is about non-idempotent retry/concurrency of intended toggles.

## Suggested Next Step

Make the toggle idempotent per request (e.g. accept/require an explicit target `enabled`, or an idempotency key / version check), or use a CAS write if the backend supports it. At minimum, document that the dashboard must send an absolute `enabled`.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static inspection via state-lifecycle trail. Same line as `toggle-messages-only-flips` but a different mechanism (retry/concurrency idempotency vs input-shape flip).

DEVANA-KEY: src/data.ts:68 | toggle-retry-double-flip
DEVANA-SUMMARY: open | P2 | medium | `toggle` derives `enabled` from a stale read across a non-atomic write, so an HTTP retry (or concurrent click) flips the maintenance state the wrong way; `enable`/`disable` are absolute and safe.
