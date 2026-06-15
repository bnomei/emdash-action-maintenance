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
  const url = context.url ?? new URL(context.request.url);

  if (shouldBypassDefault(url, options.template) || (await options.bypass?.(context, url))) {
    return next();
  }

  const handlePublicRoute = getPublicPluginApiRouteHandler(
    context.locals as PublicPluginRuntimeLocals | null | undefined,
  );
  if (!handlePublicRoute) return next();

  const stateUrl = new URL(context.request.url);
  const locale = resolveLocale(context, options);
  if (locale) stateUrl.searchParams.set("locale", locale);

  const stateRequest = new Request(stateUrl, {
    headers: context.request.headers,
    method: "GET",
  });

  const result = await handlePublicRoute(PLUGIN_ID, "GET", "/public-state", stateRequest);
  const state = isPublicMaintenanceState(result.data) ? result.data : null;

  if (!result.success || !state?.enabled) return next();

  setMaintenanceLocal(context, state);

  if (options.render) return options.render(state, context);

  const template = await resolveTemplate(options.template, state, context);
  if (template && context.rewrite) return context.rewrite(template);

  const responseOptions =
    typeof options.response === "function"
      ? await options.response(state, context)
      : options.response;

  return createMaintenanceResponse(state, responseOptions);
}

function shouldBypassDefault(url: URL, template?: MaintenanceMiddlewareTemplate) {
  if (DEFAULT_BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  if (DEFAULT_BYPASS_PATHS.includes(url.pathname)) return true;

  const templatePath = staticTemplatePath(template, url);
  return templatePath ? url.pathname === templatePath : false;
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
