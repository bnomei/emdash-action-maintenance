export type LocalizedString = string | Record<string, string | undefined>;

export type MaintenanceMessageKey =
  | "disableConfirm"
  | "disableLabel"
  | "disabled"
  | "enableConfirm"
  | "enableLabel"
  | "enabled"
  | "maintenance";

export type MaintenanceI18nMessages = Partial<
  Record<string, Partial<Record<MaintenanceMessageKey, string | undefined>>>
>;

export type MaintenanceI18nConfig = {
  locale?: string;
  defaultLocale?: string;
  locales?: string[];
  fallback?: Record<string, string>;
  messages?: MaintenanceI18nMessages;
};

export const DEFAULT_LOCALE = "en";

export const DEFAULT_MAINTENANCE_I18N = {
  defaultLocale: DEFAULT_LOCALE,
  locales: [DEFAULT_LOCALE],
  messages: {
    en: {
      disableConfirm: "Bring the public site back online?",
      disableLabel: "Disable maintenance mode",
      disabled: "Maintenance mode disabled.",
      enableConfirm: "Put the public site into maintenance mode?",
      enableLabel: "Enable maintenance mode",
      enabled: "Maintenance mode enabled.",
      maintenance: "Maintenance",
    },
  },
} satisfies {
  defaultLocale: string;
  locales: string[];
  messages: Record<typeof DEFAULT_LOCALE, Record<MaintenanceMessageKey, string>>;
};

export function normalizeLocale(locale: string | null | undefined): string {
  return (locale ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE;
}

export function localeFallbacks(i18n: MaintenanceI18nConfig | string | null | undefined): string[] {
  const config = typeof i18n === "string" ? { locale: i18n } : (i18n ?? {});
  const defaultLocale = normalizeLocale(
    config.defaultLocale ?? DEFAULT_MAINTENANCE_I18N.defaultLocale,
  );
  const startLocale = normalizeLocale(config.locale ?? defaultLocale);
  const chain: string[] = [startLocale];
  const visited = new Set(chain);
  let current = startLocale;

  while (config.fallback?.[current]) {
    const next = config.fallback[current];
    if (!next || visited.has(next)) break;
    chain.push(next);
    visited.add(next);
    current = next;
  }

  if (!visited.has(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}

export function localizedString(
  value: LocalizedString | null | undefined,
  i18n: MaintenanceI18nConfig | string | null | undefined,
  fallback = "",
): string {
  if (typeof value === "string") return value;
  if (!value) return fallback;

  for (const candidate of localeFallbacks(i18n)) {
    const translated = value[candidate];
    if (typeof translated === "string" && translated.length > 0) return translated;
  }

  const source = value[DEFAULT_LOCALE];
  if (typeof source === "string" && source.length > 0) return source;

  const first = Object.values(value).find(
    (translated): translated is string => typeof translated === "string" && translated.length > 0,
  );
  return first ?? fallback;
}

export function maintenanceMessage(
  key: MaintenanceMessageKey,
  i18n: MaintenanceI18nConfig | string | null | undefined,
): string {
  const config = typeof i18n === "string" ? { locale: i18n } : (i18n ?? {});

  for (const locale of localeFallbacks(config)) {
    const override = config.messages?.[locale]?.[key];
    if (typeof override === "string" && override.length > 0) return override;

    const defaultMessage = DEFAULT_MAINTENANCE_I18N.messages.en[key];
    if (locale === DEFAULT_LOCALE && defaultMessage) return defaultMessage;
  }

  const sourceOverride = config.messages?.[DEFAULT_LOCALE]?.[key];
  if (typeof sourceOverride === "string" && sourceOverride.length > 0) return sourceOverride;

  return DEFAULT_MAINTENANCE_I18N.messages.en[key] ?? key;
}

export function localizedMaintenanceMessage(
  key: MaintenanceMessageKey,
  i18n: MaintenanceI18nConfig | string | null | undefined,
): LocalizedString {
  const config = typeof i18n === "string" ? { locale: i18n } : (i18n ?? {});
  const messages: Record<string, string> = {
    [DEFAULT_LOCALE]: DEFAULT_MAINTENANCE_I18N.messages.en[key],
  };

  for (const [locale, catalog] of Object.entries(config.messages ?? {})) {
    const message = catalog?.[key];
    if (typeof message === "string" && message.length > 0) {
      messages[locale] = message;
    }
  }

  return messages;
}
