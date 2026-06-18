export const PACKAGE_NAME = "@bnomei/emdash-action-maintenance";
export const PLUGIN_ID = "action-maintenance";
export const PLUGIN_VERSION = "0.4.0";
export const DEFAULT_MESSAGE = "This site is temporarily unavailable. Please check back soon.";

export function pluginRoute(route = "status") {
  return `/_emdash/api/plugins/${PLUGIN_ID}/${route}`;
}
