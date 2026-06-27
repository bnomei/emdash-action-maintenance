import type { LocalizedString, MaintenanceI18nConfig } from "./i18n";

export type MaintenanceSeverity = "success" | "info" | "warning" | "error";
export type MaintenanceActionTone = "default" | "positive" | "warning" | "danger" | "info";

export type LocalizedMaintenanceMessages = Record<string, string>;

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  messages: LocalizedMaintenanceMessages;
  updatedAt: string | null;
}

export interface MaintenanceLocaleConfig {
  defaultLocale: string;
  locales: string[];
}

export interface MaintenanceStatus extends MaintenanceState, MaintenanceLocaleConfig {}

export interface PublicMaintenanceState {
  enabled: boolean;
  locale: string | null;
  message: string;
  messageLocale: string | null;
  updatedAt: string | null;
}

export interface MaintenanceActionResult {
  ok: boolean;
  severity: MaintenanceSeverity;
  status: number;
  message: string;
  label: string;
  icon: string;
  action: MaintenanceActionPatch;
  notification: {
    type: MaintenanceSeverity;
    message: string;
  };
  state: MaintenanceState;
}

export interface MaintenanceActionPatch {
  label: LocalizedString;
  icon: string;
  tone: MaintenanceActionTone;
  confirm: LocalizedString;
  // Absolute route the button should POST to next ("enable" when maintenance is
  // currently off, "disable" when on). Absolute routes are idempotent, so an
  // HTTP retry or double-click cannot flip the state the wrong way.
  route: "enable" | "disable";
}

export interface MaintenanceActionDescriptor {
  id: string;
  label: LocalizedString;
  icon: string;
  tone: MaintenanceActionTone;
  pluginId: string;
  route: string;
  method: "POST";
  confirm?: LocalizedString;
  resultMode: "emdash-action-result-v1";
  placement: "dashboard" | "global";
}

export interface MaintenanceActionsManifest {
  actions: MaintenanceActionDescriptor[];
}

export interface ActionMaintenanceDescriptorOptions {
  entrypoint?: string;
  defaultMessage?: string;
  defaultMessages?: LocalizedMaintenanceMessages;
  defaultLocale?: string;
  locales?: string[];
  i18n?: MaintenanceI18nConfig;
}

export interface ActionMaintenanceCreatePluginOptions {
  defaultMessage?: string;
  defaultMessages?: LocalizedMaintenanceMessages;
  defaultLocale?: string;
  locales?: string[];
  i18n?: MaintenanceI18nConfig;
}
