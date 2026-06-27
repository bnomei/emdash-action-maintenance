DEVANA-FINDING: v1
DEVANA-STATE: fixed | P3 | medium | security=no
DEVANA-KEY: src/middleware.ts:75 | callback-throw-breaks-pipeline

# A throwing `locale`/`bypass` callback 500s every request — even when maintenance is OFF

## Finding

`handleMaintenanceMode` fails open for all of its *own* error sources but runs caller-supplied callbacks unguarded, and two of them run *before* the maintenance-enabled gate:

```ts
if (shouldBypassDefault(url, options.template) || (await options.bypass?.(context, url))) return next();  // :65
…
const locale = resolveLocale(context, options);   // :75 → options.locale(context) at :126
…
if (!result.success || !state?.enabled) return next();   // :86  (enabled gate)
```

`options.bypass` (:65) and `options.locale` (:75 → :126) execute before line 86. If either throws, the `async` middleware rejects → the framework returns 500 — for *every* public request, regardless of whether maintenance is enabled. `options.render` (:90), `template` fn (:92→:136) and `options.response` fn (:97) throw only while maintenance is enabled (500 instead of the maintenance page).

## Violated Invariant Or Contract

The middleware establishes a consistent fail-open contract everywhere internally: missing handler → `next()` (:72), state-read failure / invalid shape → `next()` (:86), bad request URL → caught (data.ts:431), bad template URL → caught (:115). The implied invariant — "the maintenance middleware must never break the public request pipeline" — is broken for caller-callback errors, asymmetrically with the deliberate fail-open elsewhere.

## Oracle

Compare the deliberate `next()` fallbacks (:72, :86) and defensive try/catch (data.ts:431, middleware.ts:115) against the unguarded callback invocations (:65, :75/:126, :90, :92/:136, :97). The plugin chose fail-open as its error philosophy; the unguarded callbacks contradict it.

## Counterexample

`createMaintenanceMiddleware({ locale: (ctx) => ctx.currentLocale.split("-")[0] })`. When Astro invokes the middleware with `currentLocale` undefined, `resolveLocale` (:126) throws `TypeError` at :75 — before the enabled gate — so every public request 500s even with maintenance disabled. The same pre-gate exposure applies to a throwing `options.bypass` at :65.

## Why It Might Matter

A trivial, common mistake in an integrator's locale/bypass callback (assuming `currentLocale` is always defined) converts the whole public site into a site-wide 500 outage while maintenance is off — the opposite of the plugin's stated "don't break the site" purpose. Contingent on integrator callback code, hence P3.

## Proof

Control-flow / cross-path mismatch: `:75 resolveLocale → :126 options.locale(context)` is not wrapped, the throw escapes the async function as a rejected promise → 500, with no `next()` fallback — in direct contrast to the explicit `next()` at :86. Executes before the enabled gate, so blast radius is all requests.

## Counterevidence Checked

- "User-callback throwing is the caller's bug, not the plugin's." The plugin already chose fail-open for its own errors and even guards `new URL(...)`; turning a trivial locale-selection throw into a site-wide 500 while maintenance is disabled is an inconsistent, surprising contract. Honest caveat: it requires a buggy caller callback, which is why this is P3 rather than higher.

## Suggested Next Step

Either wrap callback invocations so a throw falls open to `next()` (preserving the documented philosophy), or document explicitly that `bypass`/`locale`/`render`/`response`/`template` callbacks must not throw. At minimum, guard the pre-gate `bypass`/`locale` calls.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static inspection via contracts-errors trail. Distinct from `middleware-fail-open` (:86), which is about fetch failure / invalid payload calling `next()`; this is about caller callbacks failing *closed* (500), asymmetrically.
- 2026-06-27: fixed. Extracted the handler body into `runMaintenanceMode` and wrapped it in `handleMaintenanceMode` with a try/catch that preserves the fail-open contract for throwing caller callbacks (`bypass`/`locale`/`render`/`template`/`response`) — most importantly the pre-gate `bypass`/`locale`, which previously 500'd every request even with maintenance off. On a callback throw it falls open to `next()` by default; when `failClosed` is set it serves the built-in `createMaintenanceResponse` WITHOUT re-invoking the (possibly throwing) callbacks (locale resolved via `safeResolveLocale`, and a function `response` is skipped to avoid re-throwing). Added test "throwing locale/bypass callbacks fail open instead of 500ing the pipeline" (throwing `locale` and `bypass` → `next()`; with `failClosed` → 503). Suite green (28 passing), typecheck clean.

DEVANA-KEY: src/middleware.ts:75 | callback-throw-breaks-pipeline
DEVANA-SUMMARY: fixed | P3 | medium | Unguarded `bypass`/`locale` callbacks run before the enabled gate, so a throwing callback 500s every public request even when maintenance is off, contradicting the middleware's fail-open contract.
