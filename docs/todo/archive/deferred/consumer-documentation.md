# Consumer Documentation

## Status

Deferred.

## Note

Consumer-facing documentation (onboarding flow, README rewrite, "getting started" guide, configuration reference) is explicitly deferred until the package is ready to go public. Alex is the sole user pre-launch and writes documentation against working knowledge, not against published docs. Re-open before public release of the npm package.

The previous `docs/SETUP.md` was deleted during the catalog-visibility refactor cleanup; do NOT re-add SETUP.md-style deep links in error messages or code comments until the replacement is written. Stale docs are bugs (CLAUDE.md). Better to have no link than a stale one.

When the work re-opens, the doc rewrite will need to cover at minimum:
- `cornerstore init` walkthrough.
- `cornerstore.config.js` reference (every key, every default).
- BYO-server checkout setup with `createCheckoutHandler`.
- PDF mode setup.
- CSV catalog format and the Stripe sync workflow.
- Theming and CSS architecture (cross-link to `docs/principles.md`).
- localStorage usage disclosure (cross-link the deferred privacy item if EU targeting matters).

## Source

Gap B from the dissolved `docs/todo/archive/init-parity-audit.md`.
