DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | medium | security=no
DEVANA-KEY: src/data.ts:274 | response-status-range-crash

# Out-of-range `response.status` throws RangeError, turning the maintenance page into a 500

## Finding

`createMaintenanceResponse` passes a caller-supplied status straight to the `Response` constructor with no validation:

```ts
return new Response(html, {
  status: options.status ?? 503,   // data.ts:274-277
  headers,
});
```

The WHATWG Fetch `Response(body, init)` constructor throws a `RangeError` when `init.status` is outside `[200, 599]`. The status flows from the middleware's `options.response` (middleware.ts:95-100), which is integrator config or a per-request function `(state, context) => MaintenanceMiddlewareResponseOptions`.

## Violated Invariant Or Contract

`createMaintenanceResponse` is documented/typed to return a maintenance `Response`. The `status: options.status ?? 503` default signals the field is expected to hold a valid HTTP status. There is no try/catch between `options.response` and the constructor, so an out-of-range value escapes as an unhandled throw.

## Oracle

Fetch spec: `new Response(body, { status })` throws `RangeError` if `status < 200` or `status > 599`. The plugin's contract is "serve a maintenance page," not "crash the request."

## Counterexample

Integrator config `response: { status: 600 }` (also `0`, `1000`, `199`), or the dynamic form `response: (state, ctx) => ({ status: deriveFrom(ctx) })`:

```
new Response(html, { status: 600 })  // throws RangeError
```

The throw propagates out of `handleMaintenanceMode` (an async function), so the framework returns an unhandled 500 instead of the 503 maintenance page — a crash while maintenance is active.

## Why It Might Matter

A misconfigured or computed status (e.g. clamped to a CDN-specific code, or an off-by-one) converts the intended graceful maintenance response into a hard 500 for every visitor while maintenance is enabled.

## Proof

Control-flow trace: `options.response` (config/function) → `responseOptions` (middleware.ts:95-100) passed verbatim to `createMaintenanceResponse` → `new Response(html, { status: 600 })` (data.ts:274) → `RangeError` → rejected middleware promise → 500. No clamp or catch anywhere on the path.

## Counterevidence Checked

- "Status is integrator config, not attacker input, so garbage-in/garbage-out is fine." The failure mode is a hard `RangeError` crash, not a benign wrong value; the `?? 503` default and the dynamic `(state, context)` signature show the field is meant to carry an arbitrary computed status, making an out-of-range value a realistic mistake. No upstream validation exists, and no test exercises out-of-range status (only `status: 503` at maintenance.test.mjs:136 path).

## Suggested Next Step

Clamp or validate `options.status` (and reject/round non-integers) before constructing the `Response`, or wrap construction so an invalid status falls back to 503. A one-line `Number.isInteger(s) && s >= 200 && s <= 599` guard suffices.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static inspection via boundaries-oracles trail. Reachability confirmed through middleware `options.response` passthrough.

DEVANA-KEY: src/data.ts:274 | response-status-range-crash
DEVANA-SUMMARY: open | P2 | medium | A caller-supplied `response.status` outside 200–599 makes the `Response` constructor throw `RangeError`, replacing the maintenance page with an unhandled 500.
