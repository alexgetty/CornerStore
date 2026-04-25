# Checkout: missing Stripe idempotency key

## Source

Red team review, 2026-04-25.

## Problem

`createCheckoutHandler` calls `stripe.checkout.sessions.create` without an `idempotency_key`. If the storefront POSTs to the checkout endpoint twice (double-submit, network retry, impatient buyer hammering the button, mobile flaky connection), Stripe creates two distinct checkout sessions. The buyer can land on either URL and pay twice for the same cart. Bulk wholesale buyers retry on slow networks more than DTC, so this lands harder for our use case.

**Location:** `src/lib/cart/handler.ts:159-166`

```ts
const session = await getStripe().checkout.sessions.create({
  mode: 'payment',
  line_items: lineItems,
  shipping_options: shippingOptions.length > 0 ? shippingOptions : undefined,
  shipping_address_collection: { allowed_countries: ['US'] },
  success_url: `${origin}/success`,
  cancel_url: `${origin}/cancel`,
});
```

No `{ idempotencyKey }` in the request options.

## Fix

Pass an `idempotencyKey` derived from a stable hash of the request payload. Candidate inputs:

- Sorted `items` (sku + quantity)
- `origin`
- A coarse time bucket (e.g. minute-precision) so a buyer who genuinely wants a second order an hour later still gets one

```ts
import { createHash } from 'node:crypto';

const idempotencyKey = createHash('sha256')
  .update(JSON.stringify({
    items: parsed.items.slice().sort((a, b) => a.sku.localeCompare(b.sku)),
    origin,
    bucket: Math.floor(Date.now() / 60_000),
  }))
  .digest('hex');

const session = await getStripe().checkout.sessions.create(
  { /* ...existing payload... */ },
  { idempotencyKey },
);
```

## Test

Add `tests/unit/cart/handler.test.ts` (or extend) to:

1. Mock the Stripe SDK and assert the second call within the time bucket reuses the same `idempotencyKey`.
2. Assert the key changes when items, quantities, or origin change.

## Severity

High. Direct revenue/refund exposure on the money path.
