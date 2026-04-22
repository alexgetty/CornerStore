# Checkout Handler Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a `createCheckoutHandler` function from the corner-store package so users can wire checkout into any server, and make the checkout URL configurable so the static storefront can point to an external endpoint.

**Architecture:** The package already has pure checkout logic (`parseCheckoutRequest`, `buildLineItems`). We add a `createCheckoutHandler` factory that composes these with Stripe session creation. The handler takes a Stripe key and returns a framework-agnostic async function. The client-side code reads the checkout URL from a config value instead of hardcoding `/api/checkout`. The existing Astro API route (`src/pages/api/checkout.ts`) is removed since Astro doesn't serve pages from dependencies anyway.

**Tech Stack:** TypeScript, Stripe SDK, Vitest

**Spec:** `docs/superpowers/specs/2026-04-18-shopping-cart-design.md` (Checkout Flow section)

---

## File Structure

### New files

None. All changes are modifications to existing files.

### Modified files

| File | Change |
|------|--------|
| `src/lib/cart/checkout.ts` | Add `createCheckoutHandler` factory function |
| `src/lib/cart/index.ts` | Export `createCheckoutHandler` |
| `src/lib/storefront/types.ts` | Add `checkoutUrl` to StoreConfig |
| `src/lib/storefront/config.ts` | Parse `checkoutUrl` |
| `src/components/OrderSheet/OrderSheet.astro` | Accept and pass `checkoutUrl` prop |
| `src/components/OrderSheet/order-sheet.ts` | Read checkout URL from data attribute |
| `bin/init.mjs` | Update scaffolded order-sheet page to pass `checkoutUrl` |
| `package.json` | Add `corner-store/checkout` export |
| `tests/unit/cart/checkout.test.ts` | Add tests for `createCheckoutHandler` |
| `tests/unit/storefront/config.test.ts` | Add tests for `checkoutUrl` parsing |

### Removed files

| File | Reason |
|------|--------|
| `src/pages/api/checkout.ts` | Astro doesn't serve pages from dependencies. The handler factory replaces this. |

---

## Task 1: Add `checkoutUrl` to StoreConfig

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Modify: `src/lib/storefront/config.ts`
- Modify: `tests/unit/storefront/config.test.ts`

- [ ] **Step 1: Write failing tests for checkoutUrl parsing**

Add to `tests/unit/storefront/config.test.ts`:

```typescript
describe('checkoutUrl config', () => {
  it('parses checkoutUrl when valid string', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: 'https://api.example.com/checkout' });
    expect(config.checkoutUrl).toBe('https://api.example.com/checkout');
  });

  it('omits checkoutUrl when empty string', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: '' });
    expect(config.checkoutUrl).toBeUndefined();
  });

  it('omits checkoutUrl when not a string', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: 123 });
    expect(config.checkoutUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Add `checkoutUrl` to StoreConfig interface**

In `src/lib/storefront/types.ts`, add to StoreConfig:

```typescript
  checkoutUrl?: string;
```

- [ ] **Step 4: Add parsing logic**

In `src/lib/storefront/config.ts`, add after the `shippingFreeThreshold` block in `parseConfig`:

```typescript
  if (typeof obj.checkoutUrl === 'string' && obj.checkoutUrl) {
    config.checkoutUrl = obj.checkoutUrl;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/storefront/types.ts src/lib/storefront/config.ts tests/unit/storefront/config.test.ts
git commit -m "feat(config): add checkoutUrl to StoreConfig"
```

---

## Task 2: Add `createCheckoutHandler` to checkout module

**Files:**
- Modify: `src/lib/cart/checkout.ts`
- Modify: `tests/unit/cart/checkout.test.ts`

The handler factory composes the existing pure functions with Stripe session creation. It takes a Stripe secret key and returns an async function that accepts a request body (unknown) and origin URL string, and returns a `Response`.

- [ ] **Step 1: Write failing tests for createCheckoutHandler**

Add to `tests/unit/cart/checkout.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe - add this at the top of the file, before other imports
vi.mock('stripe', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn(() => ({
      checkout: { sessions: { create: mockCreate } },
    })),
    __mockCreate: mockCreate,
  };
});

// Mock loadConfig and loadCatalog
vi.mock('../../../src/lib/storefront/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/csv.js', () => ({
  loadCatalog: vi.fn(),
}));
```

Then add the test suite after the existing `buildLineItems` tests:

```typescript
import { createCheckoutHandler } from '../../../src/lib/cart/checkout.js';
import { loadConfig } from '../../../src/lib/storefront/config.js';
import { loadCatalog } from '../../../src/lib/catalog/csv.js';
import Stripe from 'stripe';

describe('createCheckoutHandler', () => {
  const mockCreate = (Stripe as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;

  beforeEach(() => {
    vi.mocked(loadConfig).mockResolvedValue({
      name: 'Test Store',
      home: 'home',
      nav: [],
      footerNav: [],
      wholesaleMargin: 0.5,
    });
    vi.mocked(loadCatalog).mockResolvedValue([
      {
        sku: 'A',
        name: 'Product A',
        price: 10.00,
        category: null,
        status: null,
        storefront: true,
        orderSheet: true,
        description: null,
        paymentLink: null,
        moq: null,
      },
    ]);
    mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session123' });
  });

  it('returns checkout URL on success', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const body = { items: [{ sku: 'A', quantity: 2 }] };
    const response = await handler(body, 'https://example.com');

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.url).toBe('https://checkout.stripe.com/session123');
  });

  it('returns 400 for invalid request body', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const response = await handler({}, 'https://example.com');

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it('returns 400 for unknown SKU', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const body = { items: [{ sku: 'UNKNOWN', quantity: 1 }] };
    const response = await handler(body, 'https://example.com');

    expect(response.status).toBe(400);
  });

  it('passes wholesale margin to line items', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const body = { items: [{ sku: 'A', quantity: 1 }] };
    await handler(body, 'https://example.com');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 500 }),
          }),
        ],
      }),
    );
  });

  it('sets success and cancel URLs from origin', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const body = { items: [{ sku: 'A', quantity: 1 }] };
    await handler(body, 'https://mystore.com');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://mystore.com/success',
        cancel_url: 'https://mystore.com/cancel',
      }),
    );
  });

  it('returns 500 when Stripe throws', async () => {
    mockCreate.mockRejectedValue(new Error('Stripe is down'));
    const handler = createCheckoutHandler('sk_test_123');
    const body = { items: [{ sku: 'A', quantity: 1 }] };
    const response = await handler(body, 'https://example.com');

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Stripe is down');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`
Expected: FAIL (createCheckoutHandler not found)

- [ ] **Step 3: Implement createCheckoutHandler**

Add to the end of `src/lib/cart/checkout.ts`:

```typescript
import { loadConfig } from '../storefront/config.js';
import { loadCatalog } from '../catalog/csv.js';
import Stripe from 'stripe';

export function createCheckoutHandler(stripeKey: string) {
  return async (body: unknown, origin: string): Promise<Response> => {
    const config = await loadConfig();
    const catalog = await loadCatalog();

    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
    }

    const minCartSizeRaw = config.minCartSize != null
      ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
      : undefined;

    const built = buildLineItems(parsed.items, catalog, config.wholesaleMargin, minCartSizeRaw);
    if (!built.ok) {
      return new Response(JSON.stringify({ error: built.error }), { status: 400 });
    }

    const stripe = new Stripe(stripeKey);

    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
    if (config.shippingFlat != null) {
      const freeThresholdRaw = config.shippingFreeThreshold != null
        ? decimalToRawPrice(config.shippingFreeThreshold, DEFAULT_CURRENCY)
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
              amount: decimalToRawPrice(config.shippingFlat, DEFAULT_CURRENCY),
              currency: DEFAULT_CURRENCY,
            },
            display_name: 'Standard Shipping',
          },
        });
      }
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: built.lineItems,
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

Note: The new imports (`loadConfig`, `loadCatalog`, `Stripe`) go at the top of the file with the existing imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/cart/checkout.ts tests/unit/cart/checkout.test.ts
git commit -m "feat(cart): add createCheckoutHandler factory"
```

---

## Task 3: Export handler and remove Astro API route

**Files:**
- Modify: `src/lib/cart/index.ts`
- Modify: `package.json`
- Remove: `src/pages/api/checkout.ts`
- Modify: `vitest.config.ts` (remove the pages exclude if it was only for this file)

- [ ] **Step 1: Add createCheckoutHandler to barrel export**

In `src/lib/cart/index.ts`, add:

```typescript
export { createCheckoutHandler, parseCheckoutRequest, buildLineItems } from './checkout.js';
export type { CheckoutItem } from './checkout.js';
```

- [ ] **Step 2: Add checkout export to package.json**

Add to the `exports` field in `package.json`:

```json
"./checkout": "./src/lib/cart/checkout.ts"
```

This gives users two import paths:
- `import { createCheckoutHandler } from 'corner-store/cart'` (via barrel)
- `import { createCheckoutHandler } from 'corner-store/checkout'` (direct)

- [ ] **Step 3: Remove the Astro API route**

```bash
rm src/pages/api/checkout.ts
rmdir src/pages/api 2>/dev/null || true
```

This file was never reachable from consumer projects (Astro doesn't serve pages from dependencies). The logic now lives in `createCheckoutHandler`.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/index.ts package.json vitest.config.ts
git rm src/pages/api/checkout.ts
git commit -m "feat(cart): export createCheckoutHandler, remove unreachable Astro route"
```

---

## Task 4: Make checkout URL configurable in the client

**Files:**
- Modify: `src/components/OrderSheet/OrderSheet.astro`
- Modify: `src/components/OrderSheet/order-sheet.ts`

- [ ] **Step 1: Add checkoutUrl prop to OrderSheet.astro**

In `src/components/OrderSheet/OrderSheet.astro`, add `checkoutUrl` to the Props interface:

```typescript
interface Props {
  storeName: string;
  contact: string;
  logo?: string;
  listings: Listing[];
  minCartSize?: number;
  minCartSizeRaw: number | null;
  currency: string;
  wholesaleMargin?: number;
  checkoutEnabled?: boolean;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
  checkoutUrl?: string;
}
```

Add to the destructuring and add a data attribute on the root div:

```
data-checkout-url={checkoutUrl ?? ''}
```

- [ ] **Step 2: Update order-sheet.ts to use configurable URL**

In `src/components/OrderSheet/order-sheet.ts`, in the `init` function, read the URL:

```typescript
const checkoutUrl = root.dataset.checkoutUrl || '/api/checkout';
```

Then in `attemptCheckout`, change line 281 from:

```typescript
const response = await fetch('/api/checkout', {
```

to:

```typescript
const response = await fetch(checkoutUrl, {
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/OrderSheet/OrderSheet.astro src/components/OrderSheet/order-sheet.ts
git commit -m "feat(cart): make checkout URL configurable via checkoutUrl prop"
```

---

## Task 5: Update init scaffolding

**Files:**
- Modify: `bin/init.mjs`

- [ ] **Step 1: Update the scaffolded order-sheet.astro in init.mjs**

Find the `order-sheet.astro` template string in `bin/init.mjs` (around line 221) and update the OrderSheet props to include `checkoutUrl`:

```html
  <OrderSheet
    storeName={config.name}
    contact={config.contact ?? ''}
    logo={config.logo}
    listings={listings}
    minCartSize={config.minCartSize}
    minCartSizeRaw={minCartSizeRaw}
    currency={DEFAULT_CURRENCY}
    wholesaleMargin={config.wholesaleMargin}
    checkoutEnabled={checkoutEnabled}
    shippingFlat={config.shippingFlat}
    shippingFreeThreshold={config.shippingFreeThreshold}
    checkoutUrl={config.checkoutUrl}
  />
```

- [ ] **Step 2: Commit**

```bash
git add bin/init.mjs
git commit -m "feat(init): pass checkoutUrl to scaffolded order sheet"
```

---

## Task 6: Verify end-to-end

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run coverage**

Run: `npx vitest run --coverage`
Expected: All new code covered. `createCheckoutHandler` coverage may need the checkout.ts added back to vitest includes (check if the `src/pages/**/*.ts` exclude was too broad).

- [ ] **Step 3: Verify package exports resolve**

```bash
node -e "console.log(Object.keys(require('./package.json').exports))"
```

Expected: includes `./checkout`, `./cart`, `./validation`
