# Stateless checkout handler: drop catalog + Stripe SKU caches

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the staleness bomb in `createCheckoutHandler` by removing both module-scoped caches and reading the catalog from disk on every checkout request. CSV becomes the sole source of truth at checkout time; Stripe is no longer consulted at request-time.

**Architecture:** Today the handler caches `loadCatalog()` results AND a `skuMap` paginated from `stripe.products.list`. Both caches live forever in the long-running BYO-server process. We delete both. On every request the handler calls `loadCatalog()` (cheap CSV parse) and hands the result to `buildLineItems` (already exists in `src/lib/cart/checkout.ts` and is fully unit-tested). The Stripe round-trip disappears entirely because `buildLineItems` builds inline `price_data` line items from catalog price + wholesale margin — exactly the values the current handler shoves into `price_data` after a no-op detour through Stripe.

**Tech Stack:** TypeScript, Vitest, Astro, Stripe SDK, csv-parse.

---

## File Structure

- `src/lib/cart/handler.ts` — modified. Strip cache state, replace inline loop with `buildLineItems` call. Keep shipping logic and error handling.
- `tests/unit/cart/checkout.test.ts` — modified. Delete the cache-asserting test, add a regression test that proves CSV mutation is reflected on the next request without restart. Remove now-unused `mockList` (Stripe `products.list` is never called).

No new files. No deletions. The library export surface is unchanged.

---

## Constraint: do not commit

Per `CLAUDE.md`, the executor must NOT run `git commit` at any point. After the final task, leave the working tree dirty and report status. Alex commits when satisfied.

---

## Task 1: Invert the cache test and add the mid-flight mutation regression test

**Files:**
- Modify: `tests/unit/cart/checkout.test.ts:460-466` (the existing "caches the catalog across requests" test)
- Modify: `tests/unit/cart/checkout.test.ts:332-344` (drop unused `mockList` and `products.list` wiring from the Stripe mock; the new handler does not page through Stripe products)

- [ ] **Step 1: Read the current test file**

Read `tests/unit/cart/checkout.test.ts` in full to understand the existing `beforeEach` setup and the `createCheckoutHandler` describe block.

- [ ] **Step 2: Replace the "caches the catalog across requests" test with its inverse**

Find the test at the bottom of the `createCheckoutHandler` describe block:

```ts
it('caches the catalog across requests (loadCatalog called once over two requests)', async () => {
  const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
  await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }] }, 'https://mystore.com');
  await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }] }, 'https://mystore.com');

  expect(mockLoadCatalog).toHaveBeenCalledTimes(1);
});
```

Replace it with two tests that pin the new contract:

```ts
it('reads the catalog from disk on every request (no caching)', async () => {
  const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
  await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }] }, 'https://mystore.com');
  await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }] }, 'https://mystore.com');

  expect(mockLoadCatalog).toHaveBeenCalledTimes(2);
});

it('reflects a catalog mutation between requests without restart', async () => {
  const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });

  // First request: SKU is available, checkout succeeds.
  const first = await handler(
    { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
    'https://mystore.com',
  );
  expect(first.status).toBe(200);

  // Operator hides the SKU on disk (simulated by changing the next loadCatalog return).
  mockLoadCatalog.mockResolvedValueOnce([
    makeProduct({ sku: 'WIDGET-001', name: 'Widget', price: 20.00, hidden: true }),
  ]);

  // Second request to the SAME handler instance must reflect the change.
  const second = await handler(
    { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
    'https://mystore.com',
  );
  expect(second.status).toBe(400);
  const body = await second.json();
  expect(body.error).toMatch(/Unavailable SKU/);
  expect(body.error).toContain('WIDGET-001');
});
```

- [ ] **Step 3: Strip the unused Stripe `products.list` mock from `beforeEach`**

In the `beforeEach` block of the `createCheckoutHandler` describe, find and delete the `mockList` block:

```ts
// DELETE this entire block:
mockList = vi.fn().mockReturnValue({
  async *[Symbol.asyncIterator]() {
    yield {
      metadata: { sku: 'WIDGET-001' },
      default_price: { id: 'price_123', unit_amount: 2000, currency: 'usd' },
    };
  },
});
```

And remove `products: { list: mockList },` from the `Stripe.default.mockImplementation` so it becomes:

```ts
(Stripe.default as any).mockImplementation(() => ({
  checkout: { sessions: { create: mockCreate } },
}));
```

Also delete the `let mockList: ReturnType<typeof vi.fn>;` declaration at the top of the describe block (no longer referenced).

- [ ] **Step 4: Run the test file and confirm the new tests fail in the expected way**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`

Expected:
- "reads the catalog from disk on every request (no caching)" — FAIL with `expected 1 to be 2` (current handler caches).
- "reflects a catalog mutation between requests without restart" — FAIL with `expected 400 to be ... actually 200` or similar (current handler serves the cached non-hidden catalog on the second request).
- "applies wholesale margin to unit amount" — should still pass; the catalog mock returns `price: 20.00` which yields the same `unit_amount: 1000` as the previous Stripe-sourced value.
- All `parseCheckoutRequest` and `buildLineItems` tests still pass.

If "applies wholesale margin to unit amount" fails because the new handler isn't in place yet, that's expected — the test was previously passing because the handler used the Stripe-mocked `unit_amount: 2000`. Once Task 2 lands, it will pass via the catalog price path.

DO NOT commit.

---

## Task 2: Make the handler stateless

**Files:**
- Modify: `src/lib/cart/handler.ts` (the entire `createCheckoutHandler` body)

- [ ] **Step 1: Replace `src/lib/cart/handler.ts` with the stateless implementation**

Overwrite the file with the following content. Note that `decimalToRawPrice` and `DEFAULT_CURRENCY` are still needed for `minCartSize` and shipping math. `Stripe` is still needed for the SDK and the line-item type. `loadCatalog` is now called per-request. `buildLineItems` does the per-item validation, MOQ check, hidden/status gate, price calc, and minimum-cart-size check.

```ts
import { parseCheckoutRequest, buildLineItems } from './checkout.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import Stripe from 'stripe';

export interface CheckoutHandlerConfig {
  stripeKey: string;
  wholesaleMargin?: number;
  minCartSize?: number;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
}

export function createCheckoutHandler(options: CheckoutHandlerConfig) {
  // Defer Stripe initialization to first request (env vars may not be loaded at import time).
  let stripe: Stripe | null = null;
  function getStripe(): Stripe {
    if (!stripe) stripe = new Stripe(options.stripeKey);
    return stripe;
  }

  return async (body: unknown, origin: string): Promise<Response> => {
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
    }

    // Read the catalog fresh on every request. The CSV is the source of truth at checkout time;
    // a hidden SKU, price change, or new product takes effect on the next request with no
    // process restart, no cache flush, no IPC handshake with the sync CLI.
    const catalog = await loadCatalog();

    const minCartSizeRaw = options.minCartSize != null
      ? decimalToRawPrice(options.minCartSize, DEFAULT_CURRENCY)
      : undefined;

    const built = buildLineItems(parsed.items, catalog, options.wholesaleMargin, minCartSizeRaw);
    if (!built.ok) {
      return new Response(JSON.stringify({ error: built.error }), { status: 400 });
    }

    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
    if (options.shippingFlat != null) {
      const freeThresholdRaw = options.shippingFreeThreshold != null
        ? decimalToRawPrice(options.shippingFreeThreshold, DEFAULT_CURRENCY)
        : null;
      const qualifiesForFree = freeThresholdRaw != null && built.subtotal >= freeThresholdRaw;

      if (qualifiesForFree) {
        shippingOptions.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: DEFAULT_CURRENCY },
            display_name: 'Free Shipping',
          },
        });
      } else {
        shippingOptions.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: decimalToRawPrice(options.shippingFlat, DEFAULT_CURRENCY),
              currency: DEFAULT_CURRENCY,
            },
            display_name: 'Standard Shipping',
          },
        });
      }
    }

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        line_items: built.lineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
        shipping_options: shippingOptions.length > 0 ? shippingOptions : undefined,
        shipping_address_collection: { allowed_countries: ['US'] },
        success_url: `${origin}/success`,
        cancel_url: `${origin}/cancel`,
      });

      return new Response(JSON.stringify({ url: session.url }), { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout session creation failed';
      return new Response(JSON.stringify({ error: message }), { status: 500 });
    }
  };
}
```

Things deleted in this rewrite (do not re-add): the `skuMap` cache, the `getSkuMap` function, the Stripe `products.list` pagination, the `catalogCache` map, the `getCatalog` function, the inline catalog availability gate (now lives in `buildLineItems`), the inline line-item building loop (now lives in `buildLineItems`), the `subtotal` accumulator (returned by `buildLineItems`), the `minCartSize` check after the loop (folded into the `buildLineItems` call via `minCartSizeRaw`), the `CatalogProduct` import (no longer referenced).

- [ ] **Step 2: Run the cart test file and confirm everything passes**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`

Expected: all tests pass, including the two new ones from Task 1.

If "applies wholesale margin to unit amount" still asserts `unit_amount: 1000` — that should pass because catalog `price: 20.00` × margin `0.5` = `unit_amount: 1000` cents, identical to the prior Stripe-sourced value.

- [ ] **Step 3: Run the full test suite to catch any unrelated breakage**

Run: `npm test`

Expected: all tests pass. There are no other call sites for `getSkuMap`, `getCatalog`, `catalogCache`, or `skuMap` (verified via grep earlier in this session); the only consumer of `createCheckoutHandler` is the BYO-server pattern documented in `docs/todo/init-parity-audit.md`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: clean. The `buildLineItems` return type (`StripeLineItem[]`) is structurally compatible with `Stripe.Checkout.SessionCreateParams.LineItem[]` (both use `price_data.currency`, `product_data.name`, `unit_amount`, and `quantity`), and the cast in step 1 makes that assignment explicit.

If typecheck fails on the cast, the most likely cause is a Stripe SDK type that requires an additional optional property. Inspect the error and add the field to `StripeLineItem` in `src/lib/cart/checkout.ts` rather than removing the cast.

- [ ] **Step 5: Run the library build**

Run: `npm run build:lib`

Expected: clean. This verifies the published `dist/cart/handler.js` artifact compiles.

DO NOT commit.

---

## Task 3: Update tracking docs

**Files:**
- Modify: `docs/todo/init-parity-audit.md` — the "Still open" section may reference the cache staleness issue. Add a note that the BYO-server cache concern is closed by this change so the audit doesn't drift.

- [ ] **Step 1: Read the audit's "Still open" section**

Read `docs/todo/init-parity-audit.md` and look for any mention of cache staleness, `catalogCache`, `skuMap`, or "long-running server". If found, leave a one-line note that the staleness category is now closed by removing the caches in `src/lib/cart/handler.ts`. If not found, this task is a no-op — skip to step 2.

- [ ] **Step 2: Report status**

Print `git status --short` and the diff of all changed files for Alex's review. Do not run `git add` or `git commit`. The execution session ends here.

---

## Self-Review

**Spec coverage:**
- "Drop the catalog cache" → Task 2 step 1 (deletes `catalogCache` and `getCatalog`).
- "Drop the Stripe SKU cache and round-trip" → Task 2 step 1 (deletes `skuMap`, `getSkuMap`, removes `products.list` call). Task 1 step 3 (drops the now-unused mock).
- "Read CSV per request, use `buildLineItems`" → Task 2 step 1.
- "Regression test for mid-flight mutation" → Task 1 step 2.
- "Don't commit" → Constraint section + every task's "DO NOT commit" line + Task 3 step 2.

**Placeholder scan:** Every code block is concrete. Every command is exact. No "TBD", no "similar to above", no "add appropriate handling".

**Type consistency:** `buildLineItems` is called with the same signature it already exports in `src/lib/cart/checkout.ts` (`items, catalog, wholesaleMargin, minCartSizeRaw?`). The cast `as Stripe.Checkout.SessionCreateParams.LineItem[]` matches the original handler's type for `lineItems`. `loadCatalog()` returns `Promise<CatalogProduct[]>`, which matches `buildLineItems`' second parameter.
