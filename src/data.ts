import { PluginRouteError, getFallbackChain, getI18nConfig, type RouteContext } from "emdash";
import type {
  MaintenanceActionDescriptor,
  MaintenanceActionPatch,
  LocalizedMaintenanceMessages,
  MaintenanceActionResult,
  MaintenanceActionsManifest,
  MaintenanceLocaleConfig,
  MaintenanceState,
  MaintenanceStatus,
  PublicMaintenanceState,
} from "./types";
import { DEFAULT_MESSAGE, PLUGIN_ID } from "./shared";
import {
  localizedMaintenanceMessage,
  localizedString,
  maintenanceMessage,
  type MaintenanceI18nConfig,
} from "./i18n";

export { DEFAULT_MESSAGE, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION, pluginRoute } from "./shared";

const STATE_KEY = "state:maintenance";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_LOCALE_LENGTH = 40;
const MAX_LOCALE_MESSAGES = 64;
const LOCALE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
type MaintenanceStateContext = Pick<RouteContext, "kv"> & Partial<Pick<RouteContext, "site">>;

export interface MaintenanceRouteOptions {
  defaultMessage?: string;
  defaultMessages?: LocalizedMaintenanceMessages;
  defaultLocale?: string;
  locales?: string[];
  i18n?: MaintenanceI18nConfig;
}

export async function statusRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<MaintenanceStatus> {
  const state = await readMaintenanceState(ctx, options);
  return {
    ...state,
    ...localeConfig(ctx, options, state),
  };
}

export async function publicStateRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<PublicMaintenanceState> {
  const state = await readMaintenanceState(ctx, options);
  const config = localeConfig(ctx, options, state);
  return publicState(state, {
    ...config,
    locale: readRequestLocale(ctx, state, config),
  });
}

export async function toggleRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<MaintenanceActionResult> {
  assertPost(ctx);
  const current = await readMaintenanceState(ctx, options);
  const input = asRecord(ctx.input);
  const enabled = readEnabledInput(input, !current.enabled);
  const state = await writeMaintenanceState(
    ctx,
    {
      enabled,
      message: readMessageInput(input, current.message),
      messages: readMessagesInput(input, current.messages),
      updatedAt: new Date().toISOString(),
    },
    options,
  );

  return actionResult(state, routeI18n(ctx, options));
}

export async function enableRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<MaintenanceActionResult> {
  assertPost(ctx);
  const current = await readMaintenanceState(ctx, options);
  const input = asRecord(ctx.input);
  const state = await writeMaintenanceState(
    ctx,
    {
      enabled: true,
      message: readMessageInput(input, current.message),
      messages: readMessagesInput(input, current.messages),
      updatedAt: new Date().toISOString(),
    },
    options,
  );

  return actionResult(state, routeI18n(ctx, options));
}

export async function disableRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<MaintenanceActionResult> {
  assertPost(ctx);
  const current = await readMaintenanceState(ctx, options);
  const input = asRecord(ctx.input);
  const state = await writeMaintenanceState(
    ctx,
    {
      enabled: false,
      message: readMessageInput(input, current.message),
      messages: readMessagesInput(input, current.messages),
      updatedAt: new Date().toISOString(),
    },
    options,
  );

  return actionResult(state, routeI18n(ctx, options));
}

export async function actionsManifestRoute(
  ctx: RouteContext,
  options: MaintenanceRouteOptions = {},
): Promise<MaintenanceActionsManifest> {
  const state = await readMaintenanceState(ctx, options);
  const toggle = maintenanceToggleAction(state, routeI18n(ctx, options));

  return {
    actions: [maintenanceToggleDescriptor(toggle)],
  };
}

export async function readMaintenanceState(
  ctx: MaintenanceStateContext,
  options: MaintenanceRouteOptions | string = {},
): Promise<MaintenanceState> {
  const stored = await ctx.kv.get<Partial<MaintenanceState>>(STATE_KEY);
  return normalizeState(stored, normalizeOptions(options), ctx.site?.locale);
}

export async function writeMaintenanceState(
  ctx: MaintenanceStateContext,
  state: MaintenanceState,
  options: MaintenanceRouteOptions | string = {},
): Promise<MaintenanceState> {
  const normalized = normalizeState(state, normalizeOptions(options), ctx.site?.locale);
  await ctx.kv.set(STATE_KEY, normalized);
  return normalized;
}

export function publicState(
  state: MaintenanceState,
  options: MaintenanceLocaleConfig & { locale?: string | null } = {
    defaultLocale: "en",
    locales: ["en"],
  },
): PublicMaintenanceState {
  const locale = normalizeRequestedLocale(options.locale ?? null, state, options);
  const selected = selectMessage(state, locale, options.defaultLocale);
  return {
    enabled: state.enabled,
    locale,
    message: selected.message,
    messageLocale: selected.locale,
    updatedAt: state.updatedAt,
  };
}

export function actionResult(
  state: MaintenanceState,
  i18n: MaintenanceI18nConfig = {},
): MaintenanceActionResult {
  const message = state.enabled
    ? maintenanceMessage("enabled", i18n)
    : maintenanceMessage("disabled", i18n);
  const action = maintenanceToggleAction(state, i18n);
  const label = localizedString(action.label, i18n);

  return {
    ok: true,
    severity: state.enabled ? "warning" : "success",
    status: 200,
    message,
    label,
    icon: action.icon,
    action,
    notification: {
      type: state.enabled ? "warning" : "success",
      message,
    },
    state,
  };
}

function maintenanceToggleDescriptor(action: MaintenanceActionPatch): MaintenanceActionDescriptor {
  return {
    id: "maintenance.toggle",
    label: action.label,
    icon: action.icon,
    tone: action.tone,
    pluginId: PLUGIN_ID,
    route: "toggle",
    method: "POST",
    confirm: action.confirm,
    resultMode: "emdash-action-result-v1",
    placement: "dashboard",
  };
}

function maintenanceToggleAction(
  state: Pick<MaintenanceState, "enabled">,
  i18n: MaintenanceI18nConfig = {},
): MaintenanceActionPatch {
  return state.enabled
    ? {
        label: localizedMaintenanceMessage("disableLabel", i18n),
        icon: "warning",
        tone: "danger",
        confirm: localizedMaintenanceMessage("disableConfirm", i18n),
      }
    : {
        label: localizedMaintenanceMessage("enableLabel", i18n),
        icon: "check",
        tone: "positive",
        confirm: localizedMaintenanceMessage("enableConfirm", i18n),
      };
}

export function createMaintenanceResponse(
  state: PublicMaintenanceState,
  options: {
    status?: number;
    title?: string;
    retryAfterSeconds?: number;
  } = {},
): Response {
  const title = escapeHtml(options.title ?? maintenanceMessage("maintenance", undefined));
  const message = escapeHtml(state.message || DEFAULT_MESSAGE);
  const retryAfter = String(options.retryAfterSeconds ?? 300);
  const responseLocale = state.messageLocale ?? state.locale ?? "en";
  const lang = escapeHtml(responseLocale);
  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#111827}
    main{max-width:40rem;padding:2rem;text-align:center}
    h1{font-size:clamp(2rem,6vw,3.75rem);line-height:1;margin:0 0 1rem}
    p{font-size:1.05rem;line-height:1.6;margin:0;color:#4b5563}
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Retry-After": retryAfter,
  });
  headers.set("Content-Language", responseLocale);

  return new Response(html, {
    status: options.status ?? 503,
    headers,
  });
}

function normalizeState(
  value: Partial<MaintenanceState> | null | undefined,
  options: MaintenanceRouteOptions,
  siteLocale?: string,
): MaintenanceState {
  const defaultLocale = resolveDefaultLocale(options, siteLocale);
  const defaultMessages = normalizeMessages(options.defaultMessages);
  const defaultMessage =
    options.defaultMessage ?? defaultMessages[defaultLocale] ?? DEFAULT_MESSAGE;
  const storedMessages = normalizeMessages(value?.messages);

  return {
    enabled: value?.enabled === true,
    message:
      typeof value?.message === "string" && value.message.trim() ? value.message : defaultMessage,
    messages: {
      ...defaultMessages,
      ...storedMessages,
    },
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function readMessageInput(input: Record<string, unknown>, fallback: string) {
  if (!Object.hasOwn(input, "message")) return fallback;
  const message = input.message;
  if (typeof message !== "string") {
    throw PluginRouteError.badRequest("message must be a string");
  }
  const cleanMessage = message.trim();
  if (!cleanMessage) return fallback;
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    throw PluginRouteError.badRequest(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  return cleanMessage;
}

function readMessagesInput(
  input: Record<string, unknown>,
  fallback: LocalizedMaintenanceMessages,
): LocalizedMaintenanceMessages {
  if (!Object.hasOwn(input, "messages")) return fallback;
  if (!input.messages || typeof input.messages !== "object" || Array.isArray(input.messages)) {
    throw PluginRouteError.badRequest("messages must be an object keyed by locale");
  }
  return normalizeMessages(input.messages, true);
}

function readEnabledInput(input: Record<string, unknown>, fallback: boolean) {
  if (!Object.hasOwn(input, "enabled")) return fallback;
  if (typeof input.enabled !== "boolean") {
    throw PluginRouteError.badRequest("enabled must be a boolean");
  }
  return input.enabled;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeOptions(options: MaintenanceRouteOptions | string): MaintenanceRouteOptions {
  return typeof options === "string" ? { defaultMessage: options } : options;
}

function routeI18n(
  ctx: Pick<RouteContext, "site">,
  options: MaintenanceRouteOptions,
): MaintenanceI18nConfig {
  const emdashI18n = getI18nConfig();
  return {
    defaultLocale:
      options.i18n?.defaultLocale ??
      options.defaultLocale ??
      emdashI18n?.defaultLocale ??
      ctx.site.locale,
    fallback: options.i18n?.fallback ?? emdashI18n?.fallback,
    locale: options.i18n?.locale ?? ctx.site.locale,
    locales: options.i18n?.locales ?? options.locales ?? emdashI18n?.locales,
    messages: options.i18n?.messages,
  };
}

function normalizeMessages(value: unknown, strict = false): LocalizedMaintenanceMessages {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value);
  if (strict && entries.length > MAX_LOCALE_MESSAGES) {
    throw PluginRouteError.badRequest(
      `messages must contain ${MAX_LOCALE_MESSAGES} locales or fewer`,
    );
  }

  const messages: LocalizedMaintenanceMessages = {};
  for (const [locale, message] of entries) {
    const cleanLocale = locale.trim();
    if (!isLocaleKey(cleanLocale)) {
      if (strict) throw PluginRouteError.badRequest(`Invalid locale key: ${locale}`);
      continue;
    }
    if (typeof message !== "string") {
      if (strict) throw PluginRouteError.badRequest(`Message for ${cleanLocale} must be a string`);
      continue;
    }
    const cleanMessage = message.trim();
    if (!cleanMessage) continue;
    if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
      if (strict) {
        throw PluginRouteError.badRequest(
          `Message for ${cleanLocale} must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
        );
      }
      continue;
    }
    messages[cleanLocale] = cleanMessage;
  }
  return messages;
}

function localeConfig(
  ctx: Pick<RouteContext, "site">,
  options: MaintenanceRouteOptions,
  state?: MaintenanceState,
): MaintenanceLocaleConfig {
  const i18n = getI18nConfig();
  const defaultLocale = resolveDefaultLocale(options, ctx.site.locale);
  const optionLocales = options.locales ?? i18n?.locales ?? [];
  const messageLocales = Object.keys({
    ...options.defaultMessages,
    ...state?.messages,
  });
  const locales = uniqueStrings([defaultLocale, ...optionLocales, ...messageLocales]);

  return {
    defaultLocale,
    locales: locales.length > 0 ? locales : [defaultLocale],
  };
}

function readRequestLocale(
  ctx: RouteContext,
  state: MaintenanceState,
  config: MaintenanceLocaleConfig,
): string | null {
  const inputLocale = asRecord(ctx.input).locale;
  if (typeof inputLocale === "string") {
    const locale = normalizeRequestedLocale(inputLocale, state, config);
    if (locale) return locale;
  }

  try {
    return normalizeRequestedLocale(
      new URL(ctx.request.url).searchParams.get("locale"),
      state,
      config,
    );
  } catch {
    return null;
  }
}

function normalizeRequestedLocale(
  locale: string | null,
  state: MaintenanceState,
  options: MaintenanceLocaleConfig,
): string | null {
  if (typeof locale !== "string") return null;
  const cleanLocale = locale.trim();
  if (!cleanLocale || !isLocaleKey(cleanLocale)) return null;

  const availableLocales = uniqueStrings([...options.locales, ...Object.keys(state.messages)]);
  if (availableLocales.includes(cleanLocale)) return cleanLocale;

  const configuredFallbacks = new Set(configuredFallbackLocales(cleanLocale));
  const implicitDefaultLocales = uniqueStrings([
    options.defaultLocale,
    getI18nConfig()?.defaultLocale,
  ]);
  const fallbackLocales = getFallbackChain(cleanLocale).filter(
    (candidate) => candidate !== cleanLocale,
  );
  return fallbackLocales.some(
    (candidate) =>
      availableLocales.includes(candidate) &&
      (!implicitDefaultLocales.includes(candidate) || configuredFallbacks.has(candidate)),
  )
    ? cleanLocale
    : null;
}

function configuredFallbackLocales(locale: string): string[] {
  const fallback = getI18nConfig()?.fallback;
  if (!fallback) return [];

  const locales: string[] = [];
  const visited = new Set<string>([locale]);
  let current = locale;

  while (fallback[current]) {
    const next = fallback[current];
    if (!next || visited.has(next)) break;
    locales.push(next);
    visited.add(next);
    current = next;
  }

  return locales;
}

function selectMessage(
  state: MaintenanceState,
  locale: string | null,
  defaultLocale: string,
): { message: string; locale: string | null } {
  const chain = locale
    ? uniqueStrings([locale, ...getFallbackChain(locale), defaultLocale])
    : [defaultLocale];

  for (const candidate of chain) {
    const message = state.messages[candidate];
    if (message) return { message, locale: candidate };
  }

  return { message: state.message, locale: defaultLocale };
}

function assertPost(ctx: RouteContext) {
  if (ctx.request.method.toUpperCase() !== "POST") {
    throw new PluginRouteError("METHOD_NOT_ALLOWED", "This route only accepts POST", 405);
  }
}

function resolveDefaultLocale(options: MaintenanceRouteOptions, siteLocale?: string) {
  return options.defaultLocale ?? getI18nConfig()?.defaultLocale ?? siteLocale ?? "en";
}

function isLocaleKey(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_LOCALE_LENGTH &&
    LOCALE_PATTERN.test(value) &&
    !value.includes("..")
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = typeof value === "string" ? value.trim() : "";
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return character;
    }
  });
}
