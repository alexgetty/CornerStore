# Shipping Logic Audit

## Status

Open. Investigation only; no removal until decision is made.

## Problem

The cart contains shipping-related code that may not belong in this package. Corner Store is storefront infrastructure for indie makers; shipping fulfillment is the seller's responsibility, handled outside the cart (via the seller's checkout / fulfillment workflow). Shipping logic in the cart was not part of any documented product decision and predates current memory.

The code computes a free-shipping progress message and a flat-rate shipping note, surfaced through `.cs-cart-summary > .cs-shipping-status`. It runs whenever `shippingFlat` is configured.

## Surface area to audit

DOM:
- `src/components/Cart/Cart.astro:151-153` — `.cs-cart-summary` wrapper with `.cs-shipping-status` paragraph
- `src/components/Cart/Cart.astro:48` (or thereabouts) — `data-shipping-flat`, `data-shipping-free-threshold` attributes if present

JS:
- `src/components/Cart/cart.ts:41-42` — `cartSummary`, `shippingStatus` query selectors
- `src/components/Cart/cart.ts:68-71` — `shippingFlatDecimal`, `shippingFreeThresholdDecimal` data reads + raw conversions
- `src/components/Cart/cart.ts:350-372` — `updateCartSummary` body (entirely shipping logic)
- Call sites of `updateCartSummary`

Config:
- `StoreConfig` keys: `shippingFlat`, `shippingFreeThreshold` (verify exact names in schema)
- `bin/init.mjs` / scaffold templates that surface those keys to consumers
- `cornerstore.config.js` example output

CSS:
- `Cart.css` rules for `.cs-cart-summary`, `.cs-shipping-status`

PDF strip path:
- `cart.ts:513` strip list includes `.cs-cart-summary`

Docs:
- `docs/principles.md`, any setup or config reference docs
- README mentions

## Questions to answer

1. When did shipping logic enter the codebase? (`git log -S "shipping"` across the repo)
2. Is it documented in `principles.md` or any config doc as a supported feature?
3. Does the scaffold expose it to consumers, or is it dead config?
4. Does any test exercise it?
5. Is there a path where shipping is essential (e.g., wholesale invoice context) that we'd lose by removing it?

## Decision required

After audit, decide:
- **Remove entirely** — rip out DOM, JS, config keys, CSS, scaffold mentions. Aligns with infrastructure-not-middleman principle (we don't compute fulfillment).
- **Keep, but document** — add to principles.md and config docs as a supported feature with rationale.

Default lean: remove. Sellers handle their own shipping; the cart subtotal is what we owe the seller's checkout, not a fulfillment quote.

## Out of scope for this todo

The cart tfoot subtotal alignment work. Shipping audit must not block that change. The tfoot task leaves shipping code untouched.
