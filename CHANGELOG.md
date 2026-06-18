# Changelog

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
