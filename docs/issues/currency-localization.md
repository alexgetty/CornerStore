# Long-term: dynamic currency display and localization

## Context

V1 ships with a static locale config (defaulting to `en-US`). This covers the immediate need — deterministic formatting regardless of build machine.

Full localization is out of scope for V1 but is a natural growth feature for international adoption.

## Future capabilities

Two distinct config properties:

1. **Accepted currencies** — which currencies the seller prices in (already derived from Stripe product data, but a config-level constraint could validate/filter)
2. **Display locale** — how currencies are formatted for the buyer

## Possible approaches

- **Client-side locale detection** — use `navigator.language` at runtime to format prices in the buyer's locale. No server needed. Requires client-side JavaScript to reformat prices after page load.
- **Multi-locale static builds** — generate separate pages per locale at build time. Heavier, but no JS required.
- **Seller-defined locale list** — config specifies supported locales, build generates variants.

## Not yet scoped

This is a direction marker, not a spec. Scope and design when international adoption becomes a priority.
