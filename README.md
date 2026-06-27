# @bnomei/emdash-action-maintenance

[![npm version](https://img.shields.io/npm/v/@bnomei/emdash-action-maintenance.svg)](https://www.npmjs.com/package/@bnomei/emdash-action-maintenance)
[![npm downloads](https://img.shields.io/npm/dm/@bnomei/emdash-action-maintenance.svg)](https://www.npmjs.com/package/@bnomei/emdash-action-maintenance)
[![license](https://img.shields.io/npm/l/@bnomei/emdash-action-maintenance.svg)](https://www.npmjs.com/package/@bnomei/emdash-action-maintenance)
[![types](https://img.shields.io/badge/types-included-blue.svg)](./package.json)
[![source](https://img.shields.io/badge/source-GitHub-181717.svg?logo=github)](https://github.com/bnomei/emdash-action-maintenance)

Maintenance mode for EmDash sites.

`emdash-action-maintenance` stores a shared maintenance state, exposes admin routes for toggling it, and provides action descriptors that `@bnomei/emdash-actions` can render as dashboard buttons. It does not own your public routing by itself. Your Astro app opts in by adding the middleware helper from this package.

## Install

```sh
npm install @bnomei/emdash-action-maintenance
```

Register the native plugin with EmDash. This goes in the Astro config file where your `emdash()` integration is configured:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionMaintenance } from "@bnomei/emdash-action-maintenance";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionMaintenance({
          defaultMessage: "This site is temporarily unavailable. Please check back soon.",
          defaultMessages: {
            de: "Diese Website ist vorubergehend nicht erreichbar.",
            fr: "Ce site est temporairement indisponible.",
          },
        }),
      ],
    }),
  ],
});
```

## Middleware

Add the helper to your Astro middleware file, usually `src/middleware.ts`, to make maintenance mode affect public visitors:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createMaintenanceMiddleware } from "@bnomei/emdash-action-maintenance";

export const onRequest = defineMiddleware(createMaintenanceMiddleware());
```

When maintenance mode is disabled, the helper calls `next()`. When it is enabled, the helper returns a `503` HTML response with `Cache-Control: no-store` and a `Retry-After` header.

The helper skips EmDash routes, Astro assets, and common metadata paths by default. Add a custom bypass in `src/middleware.ts` when your project has public routes that must stay online:

```ts
// src/middleware.ts
export const onRequest = defineMiddleware(
  createMaintenanceMiddleware({
    bypass: (_context, url) =>
      url.pathname.startsWith("/api/webhooks/") || url.pathname === "/health",
  }),
);
```

## Custom Template

If you want a custom maintenance page, first ask the helper to rewrite to it from `src/middleware.ts`:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createMaintenanceMiddleware } from "@bnomei/emdash-action-maintenance";

export const onRequest = defineMiddleware(
  createMaintenanceMiddleware({
    template: "/maintenance",
  }),
);
```

Then add the Astro page at `src/pages/maintenance.astro`:

```astro
---
import { DEFAULT_MESSAGE } from "@bnomei/emdash-action-maintenance";

Astro.response.status = 503;
Astro.response.headers.set("Cache-Control", "no-store");
Astro.response.headers.set("Retry-After", "300");

const state = Astro.locals.maintenance;
const message = state?.message ?? DEFAULT_MESSAGE;
const lang = state?.messageLocale ?? state?.locale;
const htmlAttrs = lang ? { lang } : {};
---

<!doctype html>
<html {...htmlAttrs}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Maintenance</title>
  </head>
  <body>
    <main>
      <h1>Maintenance</h1>
      <p>{message}</p>
    </main>
  </body>
</html>
```

The helper stores the public state on `Astro.locals.maintenance` before rewriting. For TypeScript projects, add this to `src/env.d.ts`:

```ts
// src/env.d.ts
declare namespace App {
  interface Locals {
    maintenance?: import("@bnomei/emdash-action-maintenance").PublicMaintenanceState;
  }
}
```

For complete control, return your own response from `src/middleware.ts` instead of using a template:

```ts
// src/middleware.ts
export const onRequest = defineMiddleware(
  createMaintenanceMiddleware({
    render: (state) =>
      new Response(`Maintenance: ${state.message}`, {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": "300",
        },
      }),
  }),
);
```

## Dashboard Buttons

Use this package with `@bnomei/emdash-actions` when you want maintenance controls in the EmDash dashboard:

```sh
npm install @bnomei/emdash-actions @bnomei/emdash-action-maintenance
```

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";
import {
  PLUGIN_ID as MAINTENANCE_PLUGIN_ID,
  actionMaintenance,
} from "@bnomei/emdash-action-maintenance";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionsPlugin({
          providers: [
            {
              pluginId: MAINTENANCE_PLUGIN_ID,
              label: "Maintenance",
            },
          ],
        }),
        actionMaintenance(),
      ],
    }),
  ],
});
```

The provider exposes a single state-aware dashboard toggle action. The dashboard button label is read from the persisted maintenance state and updates after each successful toggle. Direct `enable` and `disable` routes remain available for custom clients, but the action manifest uses one `maintenance.toggle` button.

## Persistence

The plugin stores one state record in EmDash plugin KV. This is the persisted state shape, not a file you create manually:

```ts
type MaintenanceState = {
  enabled: boolean;
  message: string;
  messages: Record<string, string>;
  updatedAt: string | null;
};
```

Key details:

- `enabled` controls whether the middleware blocks public requests.
- `message` is the fallback public message.
- `messages` stores locale-specific messages keyed by locale code.
- `updatedAt` records when an admin action last changed the state.

The state is not kept in process memory. Admin actions write to plugin KV, and the middleware reads the public state route for each request. In a scaled Cloudflare/serverless deployment, every instance uses the same EmDash plugin KV backend instead of a local variable. Propagation and consistency follow the configured KV/storage backend; this plugin does not add an extra in-memory cache.

If no state has been saved yet, maintenance mode is disabled and the configured default message is used as the fallback.

## Routes

The plugin exposes these routes under `/_emdash/api/plugins/action-maintenance/`:

| Route                 | Auth   | Purpose                                                              |
| --------------------- | ------ | -------------------------------------------------------------------- |
| `status`              | Admin  | Read the full maintenance state and locale config.                   |
| `summary`             | Admin  | Alias for `status`, useful for generic action dashboards.            |
| `enable`              | Admin  | Enable maintenance mode. Accepts `POST` only.                        |
| `disable`             | Admin  | Disable maintenance mode. Accepts `POST` only.                       |
| `toggle`              | Admin  | Set maintenance mode from an explicit `enabled`, optionally with a new message. `POST` only. |
| `public-state`        | Public | Read the public state from SSR middleware. Accepts `?locale=fr`.     |
| `.well-known/actions` | Admin  | Return the state-aware dashboard toggle action descriptor.           |

Action payloads may include `message`, `messages`, and for `toggle`, `enabled`. The `toggle` route requires an explicit `enabled` boolean when changing state; content-only `message`/`messages` patches preserve the current state. These payloads are request bodies sent to the plugin routes by dashboard buttons or custom clients:

```ts
// POST /_emdash/api/plugins/action-maintenance/toggle
{
  enabled: true,
  message: "This site is temporarily unavailable. Please check back soon.",
  messages: {
    de: "Diese Website ist vorubergehend nicht erreichbar.",
  },
}
```

The mutation routes return the persisted state plus the stable action patch consumed by `@bnomei/emdash-actions`. When maintenance mode is disabled, the manifest returns `Enable maintenance mode`; after a successful enable, the response patches the same button to `Disable maintenance mode`. The next successful disable patches it back.

The action patch (and the `.well-known/actions` descriptor) carries an absolute `route` — `enable` when maintenance is currently off, `disable` when on — rather than the `toggle` route. Because `enable`/`disable` write an absolute target, a retransmitted or concurrent click is idempotent and cannot flip the state the wrong way. The `toggle` route remains available for clients that send an explicit `enabled` target or content-only copy patches.

```ts
// Response body from POST /_emdash/api/plugins/action-maintenance/enable
{
  ok: true,
  message: "Maintenance mode enabled.",
  action: {
    label: "Disable maintenance mode",
    icon: "warning",
    tone: "danger",
    confirm: "Bring the public site back online?",
    route: "disable",
  },
}
```

Messages are bounded before storage to keep the routes suitable for Cloudflare/serverless plugin KV.

## Options

These options go into the `actionMaintenance()` call in `astro.config.mjs`:

```ts
// astro.config.mjs
actionMaintenance({
  defaultMessage: "This site is temporarily unavailable. Please check back soon.",
  defaultMessages: {
    de: "Diese Website ist vorubergehend nicht erreichbar.",
  },
  defaultLocale: "en",
  locales: ["en", "de"],
});
```

Available plugin options:

- `defaultMessage`: Fallback message used before a custom state is saved.
- `defaultMessages`: Locale-specific default messages.
- `defaultLocale`: Locale used when no request locale is available.
- `locales`: Supported locale list exposed by the status route.
- `entrypoint`: Native plugin entrypoint. Defaults to `@bnomei/emdash-action-maintenance`.

The public state route only honors request locales from `ctx.input.locale` or
`?locale=` when they match a configured locale, an available message locale, or
an EmDash i18n fallback locale. Unknown, invalid, blank, or missing request
locales are ignored, so the returned message falls back to `defaultLocale`
consistently for both input sources.

Available middleware options:

- `template`: Astro route to rewrite to when maintenance is enabled.
- `render`: Custom response function. Takes priority over `template`.
- `response`: Options for the built-in HTML response.
- `locale`: Locale override. Defaults to `context.currentLocale`.
- `bypass`: Additional route bypass function.
- `failClosed`: How to behave when the public-state read fails (missing
  handler, unsuccessful fetch, or invalid payload). Defaults to fail-closed:
  the maintenance response is served so a transient backend error during an
  outage does not reopen the public site. Set to `false` to fail open and let
  the request continue to the normal page.

## Development

```sh
npm install
npm run typecheck
npm run build
npm run pack:check
```
