# Changelog

## 0.4.0 - 2026-06-18

- Added EmDash-shaped `i18n` options with `locale`, `defaultLocale`,
  `locales`, `fallback`, and `messages` for maintenance action copy.
- Added localized action labels, confirmations, and toggle result messages
  while preserving the existing localized public maintenance page messages.
- Exported the default maintenance i18n catalog, message keys, and resolver helpers.

## 0.3.1 - 2026-06-18

- Bumped plugin metadata for the next maintenance-mode action provider patch release.

## 0.3.0 - 2026-06-18

- Added CI and npm release workflows with package/type validation.
- Added maintenance route and public state behavior tests.
- Validated public state request locales while preserving localized message and EmDash fallback resolution.
- Switched development instructions and lockfile metadata to npm.

## 0.2.0 - 2026-06-16

- Added the state-aware maintenance dashboard toggle contract for `@bnomei/emdash-actions`.
- Changed the action manifest to expose one persisted-state toggle button instead of separate dashboard enable and disable actions.
- Documented the stable action patch response used to update the button label after toggling.

## 0.1.0

- Initial maintenance action plugin scaffold.
