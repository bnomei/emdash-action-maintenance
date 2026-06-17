import { definePlugin, type PluginDescriptor } from "emdash";
import {
  PACKAGE_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  actionsManifestRoute,
  disableRoute,
  enableRoute,
  publicStateRoute,
  statusRoute,
  toggleRoute,
} from "./data";
import type {
  ActionMaintenanceCreatePluginOptions,
  ActionMaintenanceDescriptorOptions,
} from "./types";

export type {
  ActionMaintenanceCreatePluginOptions,
  ActionMaintenanceDescriptorOptions,
  LocalizedMaintenanceMessages,
  MaintenanceActionDescriptor,
  MaintenanceActionPatch,
  MaintenanceActionResult,
  MaintenanceActionTone,
  MaintenanceActionsManifest,
  MaintenanceLocaleConfig,
  MaintenanceSeverity,
  MaintenanceState,
  MaintenanceStatus,
  PublicMaintenanceState,
} from "./types";
export type { MaintenanceRouteOptions } from "./data";
export type {
  MaintenanceMiddlewareContext,
  MaintenanceMiddlewareNext,
  MaintenanceMiddlewareOptions,
  MaintenanceMiddlewareResponseOptions,
  MaintenanceMiddlewareTemplate,
} from "./middleware";
export {
  DEFAULT_MESSAGE,
  PACKAGE_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  actionResult,
  actionsManifestRoute,
  createMaintenanceResponse,
  disableRoute,
  enableRoute,
  pluginRoute,
  publicState,
  publicStateRoute,
  readMaintenanceState,
  statusRoute,
  toggleRoute,
  writeMaintenanceState,
} from "./data";
export { createMaintenanceMiddleware, handleMaintenanceMode } from "./middleware";

export function actionMaintenance(
  options: ActionMaintenanceDescriptorOptions = {},
): PluginDescriptor<ActionMaintenanceCreatePluginOptions> {
  const entrypoint = options.entrypoint ?? PACKAGE_NAME;

  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint,
    options: {
      defaultLocale: options.defaultLocale,
      defaultMessage: options.defaultMessage,
      defaultMessages: options.defaultMessages,
      locales: options.locales,
    },
  };
}

export function createPlugin(options: ActionMaintenanceCreatePluginOptions = {}) {
  const routeOptions = {
    defaultLocale: options.defaultLocale,
    defaultMessage: options.defaultMessage,
    defaultMessages: options.defaultMessages,
    locales: options.locales,
  };

  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    routes: {
      status: {
        handler: (ctx) => statusRoute(ctx, routeOptions),
      },
      summary: {
        handler: (ctx) => statusRoute(ctx, routeOptions),
      },
      "public-state": {
        public: true,
        handler: (ctx) => publicStateRoute(ctx, routeOptions),
      },
      toggle: {
        handler: (ctx) => toggleRoute(ctx, routeOptions),
      },
      enable: {
        handler: (ctx) => enableRoute(ctx, routeOptions),
      },
      disable: {
        handler: (ctx) => disableRoute(ctx, routeOptions),
      },
      ".well-known/actions": {
        handler: (ctx) => actionsManifestRoute(ctx, routeOptions),
      },
    },
  });
}

export const maintenancePlugin = actionMaintenance;
export default actionMaintenance;
