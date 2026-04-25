# Checkout: missing upper bound on item quantity

## Source

Red team review, 2026-04-25.

## Problem

`parseCheckoutRequest` validates that quantity is a positive integer but enforces no upper bound:

**Location:** `src/lib/cart/checkout.ts:33-35`

```ts
if (typeof rec.quantity !== 'number' || rec.quantity <= 0 || !Number.isInteger(rec.quantity)) {
  return { ok: false, error: 'Each item must have a positive integer quantity' };
}
```

Stripe itself caps line-item quantity at 999,999 so the truly absurd floating-point overflow attack on `subtotal += unitAmount * item.quantity` (`handler.ts:108`) does not land cleanly. But that leaves a wide exploitable band:

- Buyer sends qty 100,000 of a $10 item: subtotal blows past `shippingFreeThreshold` trivially. We pay shipping on a fictitious order.
- Buyer sends qty just below Stripe's cap: subtotal also passes any `minCartSize` floor, and the order may be technically valid in Stripe but operationally absurd.
- A typo (`qty: 1000` instead of `100`) on a real wholesale order goes through with no sanity check.

There is no `MAX_QUANTITY` constant to reason about anywhere in `src/lib/cart/`.

## Fix

1. Define `MAX_QUANTITY` in `src/lib/validation/quantity.ts` (lives next to the existing `validateQuantity` MOQ helper). Pick a value that fits real wholesale orders but rejects abuse. Suggest `10_000` as a starting default; revisit per-product later if needed.
2. Reject in `parseCheckoutRequest` before the request even reaches catalog/Stripe lookup. Return a 400 with a clear error.
3. Mirror the cap in the cart UI so the operator can't even submit it from the storefront, but the server is the source of truth.

## Test

Extend `tests/unit/cart/checkout.test.ts`:

- qty = MAX_QUANTITY → ok
- qty = MAX_QUANTITY + 1 → rejected
- qty = Number.MAX_SAFE_INTEGER → rejected
- qty = 1.5 → rejected (already covered, keep)

## Severity

High. Compounds with any shipping or min-cart logic that reads `subtotal`. Cheap to fix.
