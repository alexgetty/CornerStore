# Shipping Feature Completion

## Status

Open. Stub-level. Alex will design and complete this intentionally before public release. Do NOT have an agent flesh out the design.

## Why this todo exists

A partial shipping feature exists in the cart today. It was not a documented product decision, it is not in `principles.md`, and the surface area below is what currently ships in code. This todo records what is already wired so future-Alex can decide what to keep, change, or replace when designing the real feature.

## Current surface area

Config keys (`src/lib/storefront/types.ts`, `config.ts`):
- `shippingFlat?: number`
- `shippingFreeThreshold?: number`

Cart component (`src/components/Cart/Cart.astro`, `cart.ts`, `Cart.css`):
- `data-shipping-flat`, `data-shipping-free-threshold` data attributes on `.cs-cart`.
- `.cs-cart-summary > .cs-shipping-status` markup block.
- `updateCartSummary` in `cart.ts` renders one of: "Free shipping", "$X more for free shipping", or "$X shipping" based on subtotal vs. threshold.
- PDF strip removes `.cs-cart-summary` from generated order forms.

Scaffold (`bin/scaffold.mjs`):
- Both keys appear as commented-out optional hints in the generated `cornerstore.config.js`.
- Both are passed as props to `<CartPage>` in the generated `src/pages/cart.astro`.

Tests:
- `tests/unit/storefront/config.test.ts` covers parsing of both keys.

## What "complete" looks like

Open. To be designed by Alex. Likely candidates: principles.md documentation, broader test coverage, intentional UX, possible config-shape changes. Not prescribed here.

## Constraints

- Must remain consistent with "infrastructure not middleman" (CLAUDE.md). Corner Store does not compute carrier rates or facilitate fulfillment. Whatever ships should be a seller-controlled display, not a fulfillment quote.
- Init parity applies: any config-shape or prop-shape change must update `bin/scaffold.mjs` in the same commit.
