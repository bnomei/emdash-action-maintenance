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
  label: string;
  icon: string;
  tone: MaintenanceActionTone;
  confirm: string;
}

export interface MaintenanceActionDescriptor {
  id: string;
  label: string;
  icon: string;
  tone: MaintenanceActionTone;
  pluginId: string;
  route: string;
  method: "POST";
  confirm?: string;
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
}

export interface ActionMaintenanceCreatePluginOptions {
  defaultMessage?: string;
  defaultMessages?: LocalizedMaintenanceMessages;
  defaultLocale?: string;
  locales?: string[];
}
