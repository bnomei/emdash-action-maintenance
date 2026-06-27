import {
  getPublicPluginApiRouteHandler,
  type PublicPluginRuntimeLocals,
} from "emdash/plugin-utils";
import { createMaintenanceResponse } from "./data";
import { PLUGIN_ID } from "./shared";
import type { PublicMaintenanceState } from "./types";

export type MaintenanceMiddlewareNext = () => Response | Promise<Response>;

export interface MaintenanceMiddlewareContext {
  request: Request;
  locals?: unknown;
  currentLocale?: string;
  rewrite?: (payload: string | URL | Request) => Response | Promise<Response>;
  url?: URL;
}

export type MaintenanceMiddlewareTemplate =
  | string
  | URL
  | Request
  | ((
      state: PublicMaintenanceState,
      context: MaintenanceMiddlewareContext,
    ) => string | URL | Request | Promise<string | URL | Request>);

export interface MaintenanceMiddlewareResponseOptions {
  status?: number;
  title?: string;
  retryAfterSeconds?: number;
}

export interface MaintenanceMiddlewareOptions {
  bypass?: (context: MaintenanceMiddlewareContext, url: URL) => boolean | Promise<boolean>;
  /**
   * When the public-state read fails (missing handler, unsuccessful fetch, or
   * an invalid payload shape) the middleware cannot tell whether maintenance is
   * enabled. By default it fails closed and serves the maintenance response, so
   * a transient backend error during an outage does not reopen the public site.
   * Set `failClosed: false` to fail open and call `next()` instead.
   */
  failClosed?: boolean;
  locale?: string | ((context: MaintenanceMiddlewareContext) => string | null | undefined);
  render?: (
    state: PublicMaintenanceState,
    context: MaintenanceMiddlewareContext,
  ) => Response | Promise<Response>;
  response?:
    | MaintenanceMiddlewareResponseOptions
    | ((
        state: PublicMaintenanceState,
        context: MaintenanceMiddlewareContext,
      ) => MaintenanceMiddlewareResponseOptions | Promise<MaintenanceMiddlewareResponseOptions>);
  template?: MaintenanceMiddlewareTemplate;
}

const DEFAULT_BYPASS_PREFIXES = ["/_emdash", "/_astro"];
const DEFAULT_BYPASS_PATHS = ["/favicon.ico", "/robots.txt", "/sitemap.xml"];

export function createMaintenanceMiddleware(options: MaintenanceMiddlewareOptions = {}) {
  return (context: MaintenanceMiddlewareContext, next: MaintenanceMiddlewareNext) =>
    handleMaintenanceMode(context, next, options);
}

export async function handleMaintenanceMode(
  context: MaintenanceMiddlewareContext,
  next: MaintenanceMiddlewareNext,
  options: MaintenanceMiddlewareOptions = {},
): Promise<Response> {
  try {
    return await runMaintenanceMode(context, next, options);
  } catch {
    // Preserve the fail-open contract for throwing caller callbacks
    // (bypass/locale/render/template/response), so a buggy
    // callback can never break the public pipeline with a 500 — most importantly
    // for `bypass`/`locale`, which run before the enabled gate. When
    // `failClosed` is set, serve the built-in maintenance response WITHOUT
    // re-invoking the (possibly throwing) callbacks.
    if (options.failClosed !== true) return next();
    const locale = safeResolveLocale(context, options);
    const state: PublicMaintenanceState = {
      enabled: true,
      locale,
      message: "",
      messageLocale: null,
      updatedAt: null,
    };
    setMaintenanceLocal(context, state);
    return createMaintenanceResponse(
      state,
      typeof options.response === "function" ? undefined : options.response,
    );
  }
}

async function runMaintenanceMode(
  context: MaintenanceMiddlewareContext,
  next: MaintenanceMiddlewareNext,
  options: MaintenanceMiddlewareOptions = {},
): Promise<Response> {
  const url = context.url ?? new URL(context.request.url);

  if (shouldBypassStatic(url) || (await options.bypass?.(context, url))) {
    return next();
  }

  // A request that already landed on the static template route still needs the
  // public state populated on `locals.maintenance` so the Astro page can render
  // the persisted copy — but it must render the page itself (next()), never the
  // built-in response, to avoid a rewrite loop back to the same path.
  const isTemplatePath = matchesStaticTemplatePath(options.template, url);

  const locale = resolveLocale(context, options);

  const handlePublicRoute = getPublicPluginApiRouteHandler(
    context.locals as PublicPluginRuntimeLocals | null | undefined,
  );
  if (!handlePublicRoute) {
    return isTemplatePath ? next() : onStateUnavailable(context, next, options, locale);
  }

  const stateUrl = new URL(context.request.url);
  if (locale) stateUrl.searchParams.set("locale", locale);

  const stateRequest = new Request(stateUrl, {
    headers: context.request.headers,
    method: "GET",
  });

  let result;
  try {
    result = await handlePublicRoute(PLUGIN_ID, "GET", "/public-state", stateRequest);
  } catch {
    return isTemplatePath ? next() : onStateUnavailable(context, next, options, locale);
  }
  const state = isPublicMaintenanceState(result.data) ? result.data : null;

  // Distinguish a successful "disabled" read from a failed/invalid read: the
  // former is fail-open by design, the latter honors the `failClosed` policy.
  if (!result.success || !state) {
    return isTemplatePath ? next() : onStateUnavailable(context, next, options, locale);
  }

  // On the template path, always refresh locals from the current read (even when
  // disabled) so a direct visit gets fresh state and a stale rewrite pass-two
  // cannot leave an old snapshot behind.
  if (isTemplatePath) {
    setMaintenanceLocal(context, state);
    // `render` takes priority over `template` even on the template path itself,
    // so an enabled state uses the same response producer everywhere. Without
    // `render`, the request already landed on the template route — render it via
    // next() (whether reached directly or by rewrite pass-two).
    if (state.enabled && options.render) return options.render(state, context);
    return next();
  }

  if (!state.enabled) return next();

  setMaintenanceLocal(context, state);
  return serveMaintenance(state, context, options, next);
}

function onStateUnavailable(
  context: MaintenanceMiddlewareContext,
  next: MaintenanceMiddlewareNext,
  options: MaintenanceMiddlewareOptions,
  locale: string | null,
): Response | Promise<Response> {
  if (options.failClosed === false) return next();
  const state: PublicMaintenanceState = {
    enabled: true,
    locale,
    message: "",
    messageLocale: null,
    updatedAt: null,
  };
  setMaintenanceLocal(context, state);
  return serveMaintenance(state, context, options, next);
}

async function serveMaintenance(
  state: PublicMaintenanceState,
  context: MaintenanceMiddlewareContext,
  options: MaintenanceMiddlewareOptions,
  next: MaintenanceMiddlewareNext,
): Promise<Response> {
  if (options.render) return options.render(state, context);

  const template = await resolveTemplate(options.template, state, context);
  if (template && context.rewrite) {
    // A function template is invisible to the static pass-two bypass, so if the
    // resolved target is the path we are already on, render it via next()
    // instead of rewriting to ourselves (which would loop).
    const url = context.url ?? new URL(context.request.url);
    const templatePath = staticTemplatePath(template, url);
    if (templatePath && normalizePath(url.pathname) === normalizePath(templatePath)) {
      setMaintenanceLocal(context, state);
      return next();
    }
    return context.rewrite(template);
  }

  const responseOptions =
    typeof options.response === "function"
      ? await options.response(state, context)
      : options.response;

  return createMaintenanceResponse(state, responseOptions);
}

function shouldBypassStatic(url: URL) {
  if (DEFAULT_BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  return DEFAULT_BYPASS_PATHS.includes(url.pathname);
}

function matchesStaticTemplatePath(template: MaintenanceMiddlewareTemplate | undefined, url: URL) {
  const templatePath = staticTemplatePath(template, url);
  // Compare trailing-slash-insensitively so `/maintenance` matches the canonical
  // `/maintenance/` emitted under Astro `trailingSlash: "always"` and vice versa.
  return templatePath ? normalizePath(url.pathname) === normalizePath(templatePath) : false;
}

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function staticTemplatePath(template: MaintenanceMiddlewareTemplate | undefined, url: URL) {
  if (!template || typeof template === "function") return null;
  if (template instanceof Request) return new URL(template.url).pathname;
  if (template instanceof URL) return template.pathname;
  try {
    return new URL(template, url).pathname;
  } catch {
    return null;
  }
}

function resolveLocale(
  context: MaintenanceMiddlewareContext,
  options: MaintenanceMiddlewareOptions,
) {
  if (typeof options.locale === "function") return options.locale(context) ?? null;
  return options.locale ?? context.currentLocale ?? null;
}

// Resolve the locale for the fail-closed catch path without letting a throwing
// `locale` callback escape (it is what may have triggered the catch).
function safeResolveLocale(
  context: MaintenanceMiddlewareContext,
  options: MaintenanceMiddlewareOptions,
): string | null {
  try {
    return resolveLocale(context, options);
  } catch {
    return null;
  }
}

async function resolveTemplate(
  template: MaintenanceMiddlewareTemplate | undefined,
  state: PublicMaintenanceState,
  context: MaintenanceMiddlewareContext,
) {
  if (!template) return null;
  return typeof template === "function" ? template(state, context) : template;
}

function setMaintenanceLocal(context: MaintenanceMiddlewareContext, state: PublicMaintenanceState) {
  if (context.locals && typeof context.locals === "object") {
    (context.locals as Record<string, unknown>).maintenance = state;
  }
}

function isPublicMaintenanceState(value: unknown): value is PublicMaintenanceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.enabled === "boolean" &&
    (record.locale === null || typeof record.locale === "string") &&
    typeof record.message === "string" &&
    (record.messageLocale === null || typeof record.messageLocale === "string") &&
    (record.updatedAt === null || typeof record.updatedAt === "string")
  );
}
