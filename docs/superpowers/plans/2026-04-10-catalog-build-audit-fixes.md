# Catalog Build Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 findings from `docs/todo/catalog-build-audit.md`: CLI execution, description sync loop, error recovery, image parser redesign, sync all products, CLI tests, override model, old price cleanup, and currency centralization.

**Architecture:** Small targeted fixes first (CLI, description loop, currency, old prices), then structural changes (sync all products, retry/recovery), then redesigns (image parser, override model), finally CLI test coverage. Ordered to minimize merge conflicts within shared files (`sync.ts`, `catalog-cli.ts`, `get-listings.ts`).

**Tech Stack:** TypeScript, Vitest, Stripe SDK, tsx, gray-matter, csv-parse

---

## File Map

**New files:**
- `bin/catalog.ts` (replaces `bin/catalog.mjs`)
- `src/lib/stripe/retry.ts`
- `tests/unit/stripe/retry.test.ts`
- `tests/unit/stripe/catalog-cli.test.ts`

**Modified files (by task):**

| File | Tasks |
|------|-------|
| `src/lib/stripe/client.ts` | 1 |
| `src/lib/stripe/sync.ts` | 2, 4, 5, 6, 7 |
| `src/lib/stripe/catalog-cli.ts` | 3, 5, 7 |
| `src/lib/storefront/pricing.ts` | 3 |
| `src/lib/storefront/get-listings.ts` | 3, 8, 9 |
| `src/lib/storefront/index.ts` | 3 |
| `src/lib/storefront/types.ts` | 9 |
| `src/lib/catalog/images.ts` | 8 |
| `src/lib/catalog/types.ts` | 8, 9 |
| `src/lib/catalog/overrides.ts` | 9 |
| `src/lib/catalog/index.ts` | 8 |
| `src/lib/stripe/index.ts` | 6, 7 |
| `vitest.config.ts` | 10 |
| `package.json` | 1 |
| `tests/unit/stripe/sync.test.ts` | 2, 4, 5, 7 |
| `tests/unit/catalog/images.test.ts` | 8 |
| `tests/unit/catalog/overrides.test.ts` | 9 |
| `tests/unit/storefront/get-listings.test.ts` | 8, 9 |
| `tests/unit/storefront/pricing.test.ts` | 3 |

---

### Task 1: Fix CLI Execution (Audit #1)

**Files:**
- Modify: `src/lib/stripe/client.ts:5`
- Delete: `bin/catalog.mjs`
- Create: `bin/catalog.ts`
- Modify: `package.json` (scripts + tsx devDep)

- [ ] **Step 1: Change `client.ts` to use `process.env`**

`src/lib/stripe/client.ts` line 5:

```typescript
// Before:
  const key = import.meta.env.STRIPE_SECRET_KEY;
// After:
  const key = process.env.STRIPE_SECRET_KEY;
```

- [ ] **Step 2: Run existing client tests (no test changes needed)**

Run: `npx vitest run tests/unit/stripe/client.test.ts`
Expected: All 6 tests PASS. `vi.stubEnv` stubs both `process.env` and `import.meta.env`.

- [ ] **Step 3: Install tsx**

```bash
npm install -D tsx
```

- [ ] **Step 4: Replace bin/catalog.mjs with bin/catalog.ts**

Delete `bin/catalog.mjs`. Create `bin/catalog.ts`:

```typescript
const command = process.argv[2];
const validCommands = ['diff', 'add', 'update', 'sync'] as const;
type Command = (typeof validCommands)[number];

function isValidCommand(cmd: string | undefined): cmd is Command {
  return typeof cmd === 'string' && (validCommands as readonly string[]).includes(cmd);
}

if (!isValidCommand(command)) {
  console.log('Usage: catalog <command>\n');
  console.log('Commands:');
  console.log('  diff    Show what would change (read-only)');
  console.log('  add     Create new Stripe products from catalog');
  console.log('  update  Update existing Stripe products from catalog');
  console.log('  sync    Run add + update');
  process.exit(command === undefined ? 0 : 1);
}

try {
  const { runCatalogSync } = await import('../src/lib/stripe/catalog-cli.js');
  await runCatalogSync(command);
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
```

- [ ] **Step 5: Update package.json scripts**

Change all five catalog scripts from `node bin/catalog.mjs` to `tsx bin/catalog.ts`:

```json
"catalog": "tsx bin/catalog.ts",
"catalog:diff": "tsx bin/catalog.ts diff",
"catalog:add": "tsx bin/catalog.ts add",
"catalog:update": "tsx bin/catalog.ts update",
"catalog:sync": "tsx bin/catalog.ts sync"
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```
fix: CLI execution — tsx loader + process.env for Node.js compatibility
```

---

### Task 2: Fix Description Sync Infinite Loop (Audit #2)

**Files:**
- Modify: `src/lib/stripe/sync.ts:54`
- Test: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Write failing test for empty string normalization**

Add to `readStripeState` describe block in `tests/unit/stripe/sync.test.ts`:

```typescript
  it('normalizes empty description to null', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: '',
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
      }])
    );
    const state = await readStripeState(stripe as any);
    expect(state.get('W')!.description).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "normalizes empty description"`
Expected: FAIL. `description` is `''`, not `null`.

- [ ] **Step 3: Fix normalization**

`src/lib/stripe/sync.ts` line 54:

```typescript
// Before:
      description: product.description ?? null,
// After:
      description: product.description || null,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
fix: normalize empty Stripe description to null, preventing infinite sync loop
```

---

### Task 3: Centralize Currency Constant (Audit #9)

**Files:**
- Modify: `src/lib/storefront/pricing.ts`
- Modify: `src/lib/storefront/index.ts`
- Modify: `src/lib/stripe/catalog-cli.ts:1,9`
- Modify: `src/lib/storefront/get-listings.ts:3,7`
- Test: `tests/unit/storefront/pricing.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/unit/storefront/pricing.test.ts`:

```typescript
describe('DEFAULT_CURRENCY', () => {
  it('is usd', async () => {
    const { DEFAULT_CURRENCY } = await import('../../../src/lib/storefront/pricing.js');
    expect(DEFAULT_CURRENCY).toBe('usd');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/storefront/pricing.test.ts -t "is usd"`
Expected: FAIL. `DEFAULT_CURRENCY` not exported.

- [ ] **Step 3: Add constant and update consumers**

Add at top of `src/lib/storefront/pricing.ts`:

```typescript
export const DEFAULT_CURRENCY = 'usd';
```

In `src/lib/storefront/index.ts`, add to the pricing export:

```typescript
export { formatPrice, rawPriceToDecimal, decimalToRawPrice, DEFAULT_CURRENCY } from './pricing.js';
```

In `src/lib/stripe/catalog-cli.ts`, add import and replace hardcoded value:

```typescript
import { DEFAULT_CURRENCY } from '../storefront/pricing.js';
```

Line 9: change `const currency = 'usd';` to `const currency = DEFAULT_CURRENCY;`

In `src/lib/storefront/get-listings.ts`, replace the local constant:

```typescript
// Remove: const CURRENCY = 'usd';
// Add DEFAULT_CURRENCY to existing pricing import:
import { formatPrice, decimalToRawPrice, DEFAULT_CURRENCY } from './pricing.js';
```

Replace all 3 occurrences of `CURRENCY` with `DEFAULT_CURRENCY` in the file (lines 17, 25, 26).

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```
refactor: centralize currency constant in pricing.ts
```

---

### Task 4: Deactivate Old Prices on Update (Audit #8)

**Files:**
- Modify: `src/lib/stripe/sync.ts` (inside `catalogUpdate`, after new price creation)
- Test: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Add `pricesUpdateMock` to catalogUpdate test setup**

In `tests/unit/stripe/sync.test.ts`, `catalogUpdate` describe block:

Add declaration alongside existing mocks:

```typescript
  let pricesUpdateMock: ReturnType<typeof vi.fn>;
```

In `beforeEach`, initialize and add to mock Stripe:

```typescript
    pricesUpdateMock = vi.fn().mockResolvedValue({});
    Stripe.mockImplementation(() => ({
      products: { update: productsUpdateMock },
      prices: { create: pricesCreateMock, update: pricesUpdateMock },
      paymentLinks: { create: paymentLinksCreateMock, update: paymentLinksUpdateMock },
    }) as unknown as InstanceType<typeof Stripe>);
```

- [ ] **Step 2: Write failing test**

Add test in `catalogUpdate` describe:

```typescript
  it('deactivates old price when price changes', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });

    const existing = makeExistingState({ priceId: 'price_old' });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesUpdateMock).toHaveBeenCalledWith('price_old', { active: false });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "deactivates old price"`
Expected: FAIL. `pricesUpdateMock` not called.

- [ ] **Step 4: Add price deactivation to catalogUpdate**

In `src/lib/stripe/sync.ts`, inside `catalogUpdate`, after the `stripe.prices.create` call (around line 163), add:

```typescript
      await stripe.prices.update(entry.existing.priceId, { active: false });
```

Place it right after the `const newPrice = await stripe.prices.create(...)` line and before the payment link deactivation block.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```
fix: deactivate old Stripe price when product price changes
```

---

### Task 5: Sync All Catalog Products (Audit #5)

**Files:**
- Modify: `src/lib/stripe/sync.ts:66-103` (catalogDiff), `:105-140` (catalogAdd), `:142-192` (catalogUpdate)
- Modify: `src/lib/stripe/catalog-cli.ts` (diff output labels)
- Test: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Update the storefront-filter test to expect inclusion**

In `tests/unit/stripe/sync.test.ts`, replace the `catalogDiff` test `'only diffs storefront products (storefront: false skipped)'`:

```typescript
  it('includes non-storefront products in diff', () => {
    const catalog = [
      makeCatalogProduct({ sku: 'STORE-001', storefront: true }),
      makeCatalogProduct({ sku: 'WHOLESALE-001', storefront: false }),
    ];
    const stripeState = new Map();
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(2);
    expect(result.toAdd.map((e) => e.sku)).toContain('STORE-001');
    expect(result.toAdd.map((e) => e.sku)).toContain('WHOLESALE-001');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "includes non-storefront"`
Expected: FAIL. Only 1 product (storefront filter still active).

- [ ] **Step 3: Remove storefront filter from catalogDiff**

In `src/lib/stripe/sync.ts`, replace lines 74-77:

```typescript
// Before:
  const storefrontProducts = catalog.filter((p) => p.storefront);
  const catalogSkus = new Set(storefrontProducts.map((p) => p.sku));

  for (const product of storefrontProducts) {

// After:
  const catalogSkus = new Set(catalog.map((p) => p.sku));

  for (const product of catalog) {
```

- [ ] **Step 4: Run diff tests**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: catalogDiff tests PASS.

- [ ] **Step 5: Write failing test for non-storefront add (no payment link)**

Add to `catalogAdd` describe:

```typescript
  it('skips Payment Link creation for non-storefront products', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{
      sku: 'BULK-001',
      product: makeCatalogProduct({ sku: 'BULK-001', storefront: false }),
    }];
    const links = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsCreateMock).toHaveBeenCalledTimes(1);
    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(links.size).toBe(0);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "skips Payment Link creation for non-storefront"`
Expected: FAIL. Payment link is still created unconditionally.

- [ ] **Step 7: Add conditional payment link to catalogAdd**

Replace the `for (const entry of toAdd)` loop body in `catalogAdd`:

```typescript
  for (const entry of toAdd) {
    const product = await stripe.products.create({
      name: entry.product.name,
      description: entry.product.description ?? undefined,
      metadata: { sku: entry.sku },
    });

    const rawPrice = decimalToRawPrice(entry.product.price, currency);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: rawPrice,
      currency,
    });

    const metadata: Record<string, string> = { sku: entry.sku };

    if (entry.product.storefront) {
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
      });
      metadata.payment_link_id = link.id;
      metadata.payment_link_url = link.url;
      newLinks.set(entry.sku, link.url);
    }

    await stripe.products.update(product.id, {
      metadata,
      default_price: price.id,
    });

    console.log(`[Sync] Created: ${entry.sku} — ${entry.product.name}`);
  }
```

- [ ] **Step 8: Verify existing catalogAdd tests still pass**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All catalogAdd tests PASS. The `'stores payment link ID and URL in product metadata'` test should still pass since the default helper creates storefront products.

- [ ] **Step 9: Write failing test for non-storefront update (no payment link recreation)**

Add to `catalogUpdate` describe:

```typescript
  it('skips Payment Link recreation for non-storefront product on price change', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });

    const existing = makeExistingState({ paymentLinkId: null, paymentLinkUrl: null });
    const toUpdate = [{
      sku: 'BULK-001',
      product: makeCatalogProduct({ sku: 'BULK-001', storefront: false, price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    const links = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(links.size).toBe(0);
  });
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "skips Payment Link recreation for non-storefront"`
Expected: FAIL.

- [ ] **Step 11: Add conditional payment link to catalogUpdate**

In `catalogUpdate`, wrap the payment link block inside the `if (priceChanged)` with a storefront check:

```typescript
    if (priceChanged) {
      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const newPrice = await stripe.prices.create({
        product: entry.existing.productId,
        unit_amount: rawPrice,
        currency,
      });
      await stripe.prices.update(entry.existing.priceId, { active: false });
      productUpdate.default_price = newPrice.id;

      if (entry.product.storefront) {
        if (entry.existing.paymentLinkId) {
          await stripe.paymentLinks.update(entry.existing.paymentLinkId, { active: false });
        }

        const newLink = await stripe.paymentLinks.create({
          line_items: [{ price: newPrice.id, quantity: 1 }],
        });

        productUpdate.metadata = {
          sku: entry.sku,
          payment_link_id: newLink.id,
          payment_link_url: newLink.url,
        };

        updatedLinks.set(entry.sku, newLink.url);
        console.log(`[Sync] Updated: ${entry.sku} — price changed, new Payment Link created`);
      } else {
        console.log(`[Sync] Updated: ${entry.sku} — price changed`);
      }
    } else {
      console.log(`[Sync] Updated: ${entry.sku} — ${entry.changes.join(', ')}`);
    }
```

- [ ] **Step 12: Run sync tests**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All tests PASS.

- [ ] **Step 13: Update diff output in catalog-cli.ts for product type labels**

In `src/lib/stripe/catalog-cli.ts`, around line 18, change the add output line:

```typescript
// Before:
        console.log(`  + ${entry.sku}: ${entry.product.name} — $${entry.product.price}`);
// After:
        const type = entry.product.storefront ? 'storefront' : 'order sheet';
        console.log(`  + ${entry.sku}: ${entry.product.name} — $${entry.product.price} (${type})`);
```

- [ ] **Step 14: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 15: Commit**

```
feat: sync all catalog products to Stripe, skip Payment Links for order sheet products
```

---

### Task 6: Retry Wrapper (Audit #3 Part 1)

**Files:**
- Create: `src/lib/stripe/retry.ts`
- Create: `tests/unit/stripe/retry.test.ts`
- Modify: `src/lib/stripe/index.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/stripe/retry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('withRetry', () => {
  let withRetry: typeof import('../../../src/lib/stripe/retry.js').withRetry;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ withRetry } = await import('../../../src/lib/stripe/retry.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws last error after max attempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'));

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff (500ms, 1000ms)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn);

    // First attempt fires immediately
    expect(fn).toHaveBeenCalledTimes(1);

    // 499ms: second attempt has NOT fired
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);

    // 500ms: second attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // 1500ms total: third attempt fires
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);

    await promise;
  });

  it('respects custom maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, 1);
    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not delay after final failed attempt', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, 2);
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stripe/retry.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement withRetry**

Create `src/lib/stripe/retry.ts`:

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * (2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/stripe/retry.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `src/lib/stripe/index.ts`:

```typescript
export { withRetry } from './retry.js';
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS, 100% coverage.

- [ ] **Step 7: Commit**

```
feat: add retry wrapper with exponential backoff for Stripe API calls
```

---

### Task 7: Self-Healing + Error Recovery (Audit #3 Parts 2-3)

**Files:**
- Modify: `src/lib/stripe/sync.ts` (readStripeState return type, catalogAdd self-healing + retry + try/catch, catalogUpdate retry)
- Modify: `src/lib/stripe/catalog-cli.ts` (destructure new return shape, pass incompleteSkus)
- Modify: `src/lib/stripe/index.ts` (export new type)
- Test: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Write failing test for incompleteSkus detection**

Add to `readStripeState` describe in `tests/unit/stripe/sync.test.ts`:

```typescript
  it('tracks products with SKU but no default_price as incomplete', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([
        {
          id: 'prod_orphan', name: 'Incomplete', description: null,
          metadata: { sku: 'BROKEN-001' }, default_price: null,
        },
        {
          id: 'prod_ok', name: 'Complete', description: null,
          metadata: { sku: 'OK-001' },
          default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
        },
      ])
    );
    const result = await readStripeState(stripe as any);
    expect(result.state.size).toBe(1);
    expect(result.state.has('OK-001')).toBe(true);
    expect(result.incompleteSkus.size).toBe(1);
    expect(result.incompleteSkus.get('BROKEN-001')).toBe('prod_orphan');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "tracks products with SKU but no default_price"`
Expected: FAIL. `readStripeState` returns a Map, not `{ state, incompleteSkus }`.

- [ ] **Step 3: Add ReadStripeResult type and update readStripeState**

In `src/lib/stripe/sync.ts`, add the type and modify the function:

```typescript
export interface ReadStripeResult {
  state: StripeState;
  incompleteSkus: Map<string, string>;
}

export async function readStripeState(stripe: Stripe): Promise<ReadStripeResult> {
  const state: StripeState = new Map();
  const incompleteSkus = new Map<string, string>();

  for await (const product of stripe.products.list({ active: true, expand: ['data.default_price'] })) {
    const sku = product.metadata?.sku;
    if (!sku) continue;

    const defaultPrice = product.default_price as Stripe.Price | null;
    if (!defaultPrice || typeof defaultPrice === 'string') {
      incompleteSkus.set(sku, product.id);
      continue;
    }

    state.set(sku, {
      productId: product.id,
      name: product.name,
      description: product.description || null,
      priceId: defaultPrice.id,
      unitAmount: defaultPrice.unit_amount ?? 0,
      currency: defaultPrice.currency,
      paymentLinkId: product.metadata?.payment_link_id ?? null,
      paymentLinkUrl: product.metadata?.payment_link_url ?? null,
    });
  }

  return { state, incompleteSkus };
}
```

- [ ] **Step 4: Update ALL existing readStripeState tests to destructure `state`**

Every test that does `const state = await readStripeState(...)` becomes `const { state } = await readStripeState(...)`. Apply to all 7+ existing tests.

The `'skips products without a default price'` test now verifies the product goes to `incompleteSkus`:

```typescript
  it('skips products without a default price (tracked as incomplete)', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: null,
      }])
    );
    const { state, incompleteSkus } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
    expect(incompleteSkus.get('W')).toBe('prod_1');
  });
```

The `'skips products where default_price is a string (not expanded)'` test similarly:

```typescript
  it('skips products where default_price is a string (tracked as incomplete)', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: 'price_123',
      }])
    );
    const { state, incompleteSkus } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
    expect(incompleteSkus.get('W')).toBe('prod_1');
  });
```

- [ ] **Step 5: Update catalog-cli.ts for new return shape**

In `src/lib/stripe/catalog-cli.ts`:

```typescript
// Before:
  const state = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);
// After:
  const { state, incompleteSkus } = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);
```

Pass `incompleteSkus` to `catalogAdd`:

```typescript
// Before:
      const newLinks = await catalogAdd(stripe, diff.toAdd, currency);
// After:
      const newLinks = await catalogAdd(stripe, diff.toAdd, currency, incompleteSkus);
```

- [ ] **Step 6: Run tests to verify readStripeState changes pass**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All readStripeState tests PASS.

- [ ] **Step 7: Write failing test for self-healing in catalogAdd**

Add to `catalogAdd` describe:

```typescript
  it('reuses existing incomplete product instead of creating new one', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'RESUME-001', product: makeCatalogProduct({ sku: 'RESUME-001' }) }];
    const incompleteSkus = new Map([['RESUME-001', 'prod_existing']]);

    const links = await catalogAdd(stripe as any, toAdd, 'usd', incompleteSkus);

    expect(productsCreateMock).not.toHaveBeenCalled();
    expect(pricesCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      product: 'prod_existing',
    }));
    expect(links.get('RESUME-001')).toBe('https://buy.stripe.com/test');
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run tests/unit/stripe/sync.test.ts -t "reuses existing incomplete"`
Expected: FAIL. `catalogAdd` doesn't accept `incompleteSkus` parameter.

- [ ] **Step 9: Rewrite catalogAdd with self-healing, retry, and error recovery**

Add import at top of `src/lib/stripe/sync.ts`:

```typescript
import { withRetry } from './retry.js';
```

Replace `catalogAdd` function body:

```typescript
export async function catalogAdd(
  stripe: Stripe,
  toAdd: DiffEntry[],
  currency: string,
  incompleteSkus: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  const newLinks = new Map<string, string>();

  for (const entry of toAdd) {
    try {
      let productId: string;

      if (incompleteSkus.has(entry.sku)) {
        productId = incompleteSkus.get(entry.sku)!;
        console.log(`[Sync] Resuming incomplete product: ${entry.sku}`);
      } else {
        const product = await withRetry(() => stripe.products.create({
          name: entry.product.name,
          description: entry.product.description ?? undefined,
          metadata: { sku: entry.sku },
        }));
        productId = product.id;
      }

      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const price = await withRetry(() => stripe.prices.create({
        product: productId,
        unit_amount: rawPrice,
        currency,
      }));

      const metadata: Record<string, string> = { sku: entry.sku };

      if (entry.product.storefront) {
        const link = await withRetry(() => stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
        }));
        metadata.payment_link_id = link.id;
        metadata.payment_link_url = link.url;
        newLinks.set(entry.sku, link.url);
      }

      await withRetry(() => stripe.products.update(productId, {
        metadata,
        default_price: price.id,
      }));

      console.log(`[Sync] Created: ${entry.sku} — ${entry.product.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Sync] Failed to create ${entry.sku}: ${message}`);
      throw err;
    }
  }

  return newLinks;
}
```

- [ ] **Step 10: Wrap catalogUpdate Stripe calls with withRetry**

In `catalogUpdate`, wrap each Stripe API call:

```typescript
      const newPrice = await withRetry(() => stripe.prices.create({...}));
      await withRetry(() => stripe.prices.update(entry.existing.priceId, { active: false }));
      // ...
        await withRetry(() => stripe.paymentLinks.update(entry.existing.paymentLinkId!, { active: false }));
      // ...
        const newLink = await withRetry(() => stripe.paymentLinks.create({...}));
      // ...
      await withRetry(() => stripe.products.update(entry.existing.productId, productUpdate));
```

- [ ] **Step 11: Write test for error context logging**

Add to `catalogAdd` describe:

```typescript
  it('logs error context with SKU when creation fails after retries', async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    productsCreateMock.mockRejectedValue(new Error('Stripe API down'));

    const toAdd = [{ sku: 'FAIL-001', product: makeCatalogProduct({ sku: 'FAIL-001' }) }];

    const promise = catalogAdd(stripe as any, toAdd, 'usd');
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow('Stripe API down');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL-001'));

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });
```

- [ ] **Step 12: Run all sync tests**

Run: `npx vitest run tests/unit/stripe/sync.test.ts`
Expected: All tests PASS.

- [ ] **Step 13: Export ReadStripeResult from barrel**

In `src/lib/stripe/index.ts`:

```typescript
export type { StripeProductState, StripeState, CatalogDiffResult, ReadStripeResult } from './sync.js';
```

- [ ] **Step 14: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS, 100% coverage.

- [ ] **Step 15: Commit**

```
feat: self-healing for incomplete Stripe products, retry with exponential backoff, error context logging
```

---

### Task 8: Redesign Image Filename Parsing (Audit #4)

**Files:**
- Modify: `src/lib/catalog/types.ts` (add ProductImage)
- Modify: `src/lib/catalog/images.ts` (new parseImageFilename + loadProductImages)
- Modify: `src/lib/catalog/index.ts` (export ProductImage)
- Modify: `src/lib/storefront/get-listings.ts` (pass catalogSkus, handle new return type)
- Rewrite: `tests/unit/catalog/images.test.ts`
- Modify: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Add ProductImage type**

In `src/lib/catalog/types.ts`:

```typescript
export interface ProductImage {
  url: string;
  filename: string;
}
```

Export from `src/lib/catalog/index.ts`:

```typescript
export type { CatalogProduct, CatalogValidationError, ProductOverride, ProductImage } from './types.js';
```

- [ ] **Step 2: Write failing tests for new parseImageFilename**

Replace the `parseImageFilename` describe block in `tests/unit/catalog/images.test.ts`:

```typescript
describe('parseImageFilename', () => {
  let parseImageFilename: typeof import('../../../src/lib/catalog/images.js').parseImageFilename;
  const skus = new Set(['WIDGET', 'GADGET', 'ABC-123', 'COOL-THING']);

  beforeEach(async () => {
    vi.resetModules();
    ({ parseImageFilename } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('parses ordered image: SKU-1.jpg', () => {
    expect(parseImageFilename('WIDGET-1.jpg', skus)).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('parses ordered image with multi-digit order', () => {
    expect(parseImageFilename('WIDGET-10.jpg', skus)).toEqual({ sku: 'WIDGET', order: 10 });
  });

  it('matches full filename as unordered when SKU exists', () => {
    expect(parseImageFilename('WIDGET.jpg', skus)).toEqual({ sku: 'WIDGET', order: null });
  });

  it('prefers full filename match over hyphen-split for hyphenated SKUs', () => {
    expect(parseImageFilename('ABC-123.jpg', skus)).toEqual({ sku: 'ABC-123', order: null });
  });

  it('parses non-numeric suffix as unordered', () => {
    expect(parseImageFilename('WIDGET-lifestyle.jpg', skus)).toEqual({ sku: 'WIDGET', order: null });
  });

  it('parses hyphenated SKU with non-numeric suffix as unordered', () => {
    expect(parseImageFilename('COOL-THING-detail.jpg', skus)).toEqual({ sku: 'COOL-THING', order: null });
  });

  it('returns null for non-image extension', () => {
    expect(parseImageFilename('WIDGET-1.md', skus)).toBeNull();
  });

  it('returns null when no SKU matches', () => {
    expect(parseImageFilename('UNKNOWN-1.jpg', skus)).toBeNull();
  });

  it('returns null when filename has no hyphen and does not match a SKU', () => {
    expect(parseImageFilename('random.jpg', skus)).toBeNull();
  });

  it('returns null for empty SKU portion (hyphen at start)', () => {
    expect(parseImageFilename('-1.jpg', skus)).toBeNull();
  });

  it('returns null for zero order', () => {
    expect(parseImageFilename('WIDGET-0.jpg', skus)).toBeNull();
  });

  it('returns null for leading-zero order', () => {
    expect(parseImageFilename('WIDGET-01.jpg', skus)).toBeNull();
  });

  it('returns null when neither ABC nor ABC-123 are in catalog', () => {
    const noMatch = new Set(['OTHER']);
    expect(parseImageFilename('ABC-123.jpg', noMatch)).toBeNull();
  });

  it.each(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'])(
    'handles %s extension',
    (ext) => {
      expect(parseImageFilename(`WIDGET-1${ext}`, skus)).toEqual({ sku: 'WIDGET', order: 1 });
    },
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/catalog/images.test.ts`
Expected: FAIL. `parseImageFilename` doesn't accept second parameter.

- [ ] **Step 4: Implement new parseImageFilename**

Replace in `src/lib/catalog/images.ts`:

```typescript
export function parseImageFilename(
  filename: string,
  catalogSkus: Set<string>,
): { sku: string; order: number | null } | null {
  const ext = extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const name = filename.slice(0, -ext.length);

  // Most specific: full filename matches a catalog SKU
  if (catalogSkus.has(name)) {
    return { sku: name, order: null };
  }

  // Last-hyphen split
  const lastHyphen = name.lastIndexOf('-');
  if (lastHyphen <= 0) return null;

  const prefix = name.slice(0, lastHyphen);
  const suffix = name.slice(lastHyphen + 1);

  if (!catalogSkus.has(prefix)) return null;

  const order = parseInt(suffix, 10);
  if (!isNaN(order) && order >= 1 && String(order) === suffix) {
    return { sku: prefix, order };
  }

  return { sku: prefix, order: null };
}
```

- [ ] **Step 5: Run parseImageFilename tests**

Run: `npx vitest run tests/unit/catalog/images.test.ts`
Expected: parseImageFilename tests PASS, loadProductImages tests FAIL (signature changed).

- [ ] **Step 6: Write failing tests for new loadProductImages**

Replace the `loadProductImages` describe block:

```typescript
describe('loadProductImages', () => {
  let loadProductImages: typeof import('../../../src/lib/catalog/images.js').loadProductImages;
  let mocks: Awaited<ReturnType<typeof getFsMocks>>;
  const skus = new Set(['WIDGET', 'GADGET', 'ABC-123']);

  beforeEach(async () => {
    vi.resetModules();
    mocks = await getFsMocks();
    ({ loadProductImages } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mocks.readdir.mockRejectedValue(err);
    const result = await loadProductImages(skus, '/fake/product-images');
    expect(result).toEqual(new Map());
  });

  it('groups ordered images by SKU sorted by order number', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-2.jpg', 'WIDGET-1.jpg', 'GADGET-1.png'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      { url: '/product-images/WIDGET-1.jpg', filename: 'WIDGET-1.jpg' },
      { url: '/product-images/WIDGET-2.jpg', filename: 'WIDGET-2.jpg' },
    ]);
    expect(result.get('GADGET')).toEqual([
      { url: '/product-images/GADGET-1.png', filename: 'GADGET-1.png' },
    ]);
  });

  it('sorts ordered before unordered, unordered alphabetically', async () => {
    mocks.readdir.mockResolvedValue([
      'WIDGET-mockup.jpg', 'WIDGET-1.jpg', 'WIDGET-detail.jpg',
    ] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');
    const filenames = result.get('WIDGET')!.map((i) => i.filename);

    expect(filenames).toEqual([
      'WIDGET-1.jpg',
      'WIDGET-detail.jpg',
      'WIDGET-mockup.jpg',
    ]);
  });

  it('handles full-filename SKU match as unordered', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      { url: '/product-images/WIDGET.jpg', filename: 'WIDGET.jpg' },
    ]);
  });

  it('warns for unmatched image files', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['UNKNOWN-1.jpg'] as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('UNKNOWN-1.jpg'),
    );
    consoleSpy.mockRestore();
  });

  it('does not warn for non-image files', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['README.md', 'notes.txt'] as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('copies matched images to public directory', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(mocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('product-images'),
      { recursive: true },
    );
    expect(mocks.copyFile).toHaveBeenCalledWith(
      expect.stringContaining('WIDGET-1.jpg'),
      expect.stringContaining('WIDGET-1.jpg'),
    );
  });

  it('does not mkdir or copy when no images match', async () => {
    mocks.readdir.mockResolvedValue(['README.md'] as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('rethrows non-ENOENT errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mocks.readdir.mockRejectedValue(err);
    await expect(loadProductImages(skus, '/fake/product-images')).rejects.toThrow('EACCES');
  });

  it('uses default directory when no dir provided', async () => {
    mocks.readdir.mockResolvedValue([] as never);
    const result = await loadProductImages(skus);
    expect(result).toEqual(new Map());
    expect(mocks.readdir).toHaveBeenCalledWith(expect.stringContaining('product-images'));
  });
});
```

- [ ] **Step 7: Implement new loadProductImages**

Replace in `src/lib/catalog/images.ts`:

```typescript
import type { ProductImage } from './types.js';

export async function loadProductImages(
  catalogSkus: Set<string>,
  dir?: string,
): Promise<Map<string, ProductImage[]>> {
  const imagesDir = dir ?? join(process.cwd(), 'product-images');
  const imageMap = new Map<string, { order: number | null; url: string; filename: string }[]>();

  let files: string[];
  try {
    files = ((await readdir(imagesDir)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return new Map();
    }
    throw err;
  }

  for (const filename of files) {
    const parsed = parseImageFilename(filename, catalogSkus);
    if (!parsed) {
      const ext = extname(filename).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        console.log(`[Catalog] Warning: product-images/${filename}: no matching SKU in catalog — skipped`);
      }
      continue;
    }

    const entries = imageMap.get(parsed.sku) ?? [];
    entries.push({
      order: parsed.order,
      url: `/product-images/${filename}`,
      filename,
    });
    imageMap.set(parsed.sku, entries);
  }

  if (imageMap.size > 0) {
    await mkdir(PUBLIC_IMAGES_DIR, { recursive: true });
    for (const [, entries] of imageMap) {
      for (const entry of entries) {
        await copyFile(
          join(imagesDir, entry.filename),
          join(PUBLIC_IMAGES_DIR, entry.filename),
        );
      }
    }
  }

  const result = new Map<string, ProductImage[]>();
  for (const [sku, entries] of imageMap) {
    entries.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.filename.localeCompare(b.filename);
    });
    result.set(sku, entries.map((e) => ({ url: e.url, filename: e.filename })));
  }

  return result;
}
```

- [ ] **Step 8: Run image tests**

Run: `npx vitest run tests/unit/catalog/images.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Update getListings to pass catalogSkus and handle ProductImage[]**

In `src/lib/storefront/get-listings.ts`:

```typescript
export async function getListings(): Promise<Listing[]> {
  const catalog = await loadCatalog();
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  const images = await loadProductImages(catalogSkus);
  const overrides = await loadProductOverrides(catalog);

  const storefrontProducts = catalog.filter((p) => p.storefront);

  const listings: Listing[] = storefrontProducts.map((product) => {
    const productImages = images.get(product.sku);
    const primaryImage = productImages?.[0]?.url ?? null;
    const override = overrides.get(product.sku);

    const rawPrice = decimalToRawPrice(product.price, DEFAULT_CURRENCY);

    return {
      sku: product.sku,
      name: product.name,
      description: override?.description ?? product.description,
      image: primaryImage,
      imageAlt: override?.imageAlt ?? product.name,
      price: formatPrice(rawPrice, DEFAULT_CURRENCY),
      rawPrice,
      currency: DEFAULT_CURRENCY,
      category: product.category,
      status: product.status,
      paymentLink: product.paymentLink,
    };
  });

  // ... rest unchanged
```

Note: `image` / `imageAlt` remain on the Listing type for now. Task 9 changes this to `images[]`.

- [ ] **Step 10: Update get-listings test mocks for ProductImage return shape**

In `tests/unit/storefront/get-listings.test.ts`, update every mock that returns image data:

```typescript
// Before:
loadProductImagesMock.mockResolvedValue(
  new Map([['TEST-001', ['/product-images/TEST-001-1.jpg', '/product-images/TEST-001-2.jpg']]])
);

// After:
loadProductImagesMock.mockResolvedValue(
  new Map([['TEST-001', [
    { url: '/product-images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' },
    { url: '/product-images/TEST-001-2.jpg', filename: 'TEST-001-2.jpg' },
  ]]])
);
```

Apply to tests: `'applies primary image from image map'`, `'logs plural "products"'`, and any other test providing image mock data.

- [ ] **Step 11: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 12: Commit**

```
feat: redesign image parser with catalog-aware SKU matching and ordered/unordered support
```

---

### Task 9: Redesign Override Model (Audit #7/#10)

**Files:**
- Modify: `src/lib/catalog/types.ts` (ProductOverride)
- Modify: `src/lib/catalog/overrides.ts`
- Modify: `src/lib/storefront/types.ts` (Listing)
- Modify: `src/lib/storefront/get-listings.ts`
- Rewrite: `tests/unit/catalog/overrides.test.ts`
- Modify: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Update ProductOverride type**

In `src/lib/catalog/types.ts`:

```typescript
// Before:
export interface ProductOverride {
  sku: string;
  description: string | null;
  imageAlt: string | null;
}

// After:
export interface ProductOverride {
  sku: string;
  description: string | null;
  imageAlts: Map<string, string>;
}
```

- [ ] **Step 2: Write failing tests for new loadProductOverrides**

Replace describe block in `tests/unit/catalog/overrides.test.ts`:

```typescript
describe('loadProductOverrides', () => {
  let loadProductOverrides: typeof import('../../../src/lib/catalog/overrides.js').loadProductOverrides;
  let mocks: Awaited<ReturnType<typeof getFsMocks>>;

  beforeEach(async () => {
    vi.resetModules();
    mocks = await getFsMocks();
    ({ loadProductOverrides } = await import('../../../src/lib/catalog/overrides.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when directory does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mocks.readdir.mockRejectedValue(err);
    const result = await loadProductOverrides([], '/fake/products');
    expect(result).toEqual(new Map());
  });

  it('parses markdown body as rich description', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\nHand-poured soy candle.\nBurns for 40 hours.' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.description).toBe('Hand-poured soy candle.\nBurns for 40 hours.');
  });

  it('returns null description when markdown body is empty', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.description).toBeNull();
  });

  it('parses image_alts map from frontmatter', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue(
      '---\nsku: WIDGET-001\nimage_alts:\n  WIDGET-001-1.jpg: A lit candle\n  WIDGET-001-detail.jpg: Close-up of wax\n---\n' as never,
    );

    const result = await loadProductOverrides(catalog, '/fake/products');
    const alts = result.get('WIDGET-001')!.imageAlts;

    expect(alts.get('WIDGET-001-1.jpg')).toBe('A lit candle');
    expect(alts.get('WIDGET-001-detail.jpg')).toBe('Close-up of wax');
  });

  it('defaults imageAlts to empty map when not provided', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.imageAlts.size).toBe(0);
  });

  it('ignores non-object image_alts value', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\nimage_alts: not an object\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.imageAlts.size).toBe(0);
  });

  it('warns and skips override with no sku', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\ndescription: No SKU\n---\n' as never);

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing required "sku" field'));
  });

  it('warns when override references unknown SKU', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    mocks.readdir.mockResolvedValue(['unknown.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: UNKNOWN\n---\n' as never);

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no matching product'));
  });

  it('warns on duplicate SKU, uses last file alphabetically', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['a-widget.md', 'b-widget.md'] as never);
    mocks.readFile
      .mockResolvedValueOnce('---\nsku: WIDGET-001\n---\nFirst file' as never)
      .mockResolvedValueOnce('---\nsku: WIDGET-001\n---\nSecond file' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.description).toBe('Second file');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate override'));
    consoleSpy.mockRestore();
  });

  it('logs when rich description is present', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\nRich content' as never);

    await loadProductOverrides(catalog, '/fake/products');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('using rich description'));
    consoleSpy.mockRestore();
  });

  it('ignores non-markdown files', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget.md', 'notes.txt'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(1);
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-ENOENT readdir errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mocks.readdir.mockRejectedValue(err);
    await expect(loadProductOverrides([], '/fake/products')).rejects.toThrow('EACCES');
  });

  it('uses default directory when no dir provided', async () => {
    mocks.readdir.mockResolvedValue([] as never);
    const result = await loadProductOverrides([]);
    expect(result).toEqual(new Map());
    expect(mocks.readdir).toHaveBeenCalledWith(expect.stringContaining('products'));
  });

  it('warns and skips when readFile fails with Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockRejectedValue(new Error('disk error'));

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed to read'));
    consoleSpy.mockRestore();
  });

  it('warns and skips when readFile fails with non-Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockRejectedValue('raw string error');

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed to read'));
    consoleSpy.mockRestore();
  });

  it('warns and skips when frontmatter parsing fails with Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const matterMock = await getMatterMock();
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('content' as never);
    matterMock.mockImplementationOnce(() => { throw new Error('parse error'); });

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed to parse frontmatter'));
    consoleSpy.mockRestore();
  });

  it('warns and skips when frontmatter parsing fails with non-Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const matterMock = await getMatterMock();
    mocks.readdir.mockResolvedValue(['widget.md'] as never);
    mocks.readFile.mockResolvedValue('content' as never);
    matterMock.mockImplementationOnce(() => { throw 'raw failure'; });

    const result = await loadProductOverrides([makeCatalogProduct()], '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed to parse frontmatter'));
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/catalog/overrides.test.ts`
Expected: FAIL. `ProductOverride` has `imageAlt` not `imageAlts`, no markdown body parsing.

- [ ] **Step 4: Implement new loadProductOverrides**

Replace function body in `src/lib/catalog/overrides.ts`:

```typescript
export async function loadProductOverrides(
  catalog: CatalogProduct[],
  dir?: string,
): Promise<Map<string, ProductOverride>> {
  const overridesDir = dir ?? PRODUCTS_DIR;
  const overrides = new Map<string, ProductOverride>();
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  const sourceFiles = new Map<string, string>();

  let files: string[];
  try {
    files = ((await readdir(overridesDir)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return overrides;
    }
    throw err;
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const file of mdFiles) {
    let raw: string;
    try {
      raw = await readFile(join(overridesDir, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    let content: string;
    try {
      ({ data, content } = matter(raw));
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to parse frontmatter — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!data.sku || typeof data.sku !== 'string') {
      console.log(`[Catalog] Warning: products/${file}: missing required "sku" field — skipped`);
      continue;
    }

    const sku = data.sku.trim();

    if (!catalogSkus.has(sku)) {
      console.log(`[Catalog] Warning: products/${file}: SKU "${sku}" has no matching product in catalog — skipped`);
      continue;
    }

    if (sourceFiles.has(sku)) {
      console.log(`[Catalog] Warning: products/${file}: duplicate override for SKU "${sku}" (already defined in products/${sourceFiles.get(sku)}) — using this one`);
    }

    const imageAlts = new Map<string, string>();
    if (data.image_alts && typeof data.image_alts === 'object' && !Array.isArray(data.image_alts)) {
      for (const [key, value] of Object.entries(data.image_alts as Record<string, unknown>)) {
        if (typeof value === 'string') {
          imageAlts.set(key, value);
        }
      }
    }

    const trimmed = content.trim();
    const description = trimmed.length > 0 ? trimmed : null;

    if (description) {
      console.log(`[Catalog] ${sku}: using rich description from products/${file} (CSV description still used for Stripe)`);
    }

    sourceFiles.set(sku, file);
    overrides.set(sku, { sku, description, imageAlts });
  }

  return overrides;
}
```

- [ ] **Step 5: Run override tests**

Run: `npx vitest run tests/unit/catalog/overrides.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Update Listing type to use images array**

In `src/lib/storefront/types.ts`, replace `image` and `imageAlt` with `images`:

```typescript
export interface Listing {
  sku: string;
  name: string;
  description: string | null;
  images: { url: string; alt: string }[];
  price: string;
  rawPrice: number;
  currency: string;
  category: string | null;
  status: string | null;
  paymentLink: string | null;
}
```

- [ ] **Step 7: Update getListings to build images with alt text**

In `src/lib/storefront/get-listings.ts`, update the listing construction:

```typescript
    const listingImages = productImages.map((img) => ({
      url: img.url,
      alt: override?.imageAlts.get(img.filename) ?? '',
    }));

    return {
      sku: product.sku,
      name: product.name,
      description: override?.description ?? product.description,
      images: listingImages,
      price: formatPrice(rawPrice, DEFAULT_CURRENCY),
      rawPrice,
      currency: DEFAULT_CURRENCY,
      category: product.category,
      status: product.status,
      paymentLink: product.paymentLink,
    };
```

Where `productImages` is `images.get(product.sku) ?? []` (a `ProductImage[]`).

- [ ] **Step 8: Update get-listings tests for new Listing shape**

Update all tests in `tests/unit/storefront/get-listings.test.ts`. Key changes:

Replace `image` / `imageAlt` assertions with `images` array:

```typescript
  it('builds listings from catalog products', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('TEST-001');
    expect(listings[0]!.images).toEqual([]);
  });

  it('builds images with alt text from overrides', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', [
        { url: '/product-images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' },
        { url: '/product-images/TEST-001-2.jpg', filename: 'TEST-001-2.jpg' },
      ]]])
    );
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', {
        sku: 'TEST-001',
        description: null,
        imageAlts: new Map([['TEST-001-1.jpg', 'Primary photo']]),
      }]])
    );
    const listings = await getListings();
    expect(listings[0]!.images).toEqual([
      { url: '/product-images/TEST-001-1.jpg', alt: 'Primary photo' },
      { url: '/product-images/TEST-001-2.jpg', alt: '' },
    ]);
  });

  it('defaults image alt to empty string when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', [
        { url: '/product-images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' },
      ]]])
    );
    const listings = await getListings();
    expect(listings[0]!.images[0]!.alt).toBe('');
  });

  it('applies override description over CSV', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: 'Rich desc', imageAlts: new Map() }]])
    );
    const listings = await getListings();
    expect(listings[0]!.description).toBe('Rich desc');
  });

  it('falls back to CSV description when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    const listings = await getListings();
    expect(listings[0]!.description).toBe('CSV desc');
  });
```

Remove old tests for `image` and `imageAlt` properties (they no longer exist on Listing).

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```
feat: redesign override model — markdown body as rich description, per-image alt text map
```

---

### Task 10: CLI Test Coverage (Audit #6)

**Files:**
- Modify: `vitest.config.ts` (remove catalog-cli.ts from exclude)
- Create: `tests/unit/stripe/catalog-cli.test.ts`

- [ ] **Step 1: Remove catalog-cli.ts from coverage exclude**

In `vitest.config.ts`, remove `'src/lib/stripe/catalog-cli.ts'` from the `exclude` array:

```typescript
exclude: ['src/env.d.ts', 'src/lib/storefront/types.ts', 'src/components/index.ts', 'src/lib/catalog/types.ts', 'src/lib/catalog/index.ts', 'src/lib/storefront/index.ts'],
```

- [ ] **Step 2: Verify coverage now fails**

Run: `npx vitest run --coverage`
Expected: Coverage threshold fails (catalog-cli.ts at 0%).

- [ ] **Step 3: Write comprehensive tests**

Create `tests/unit/stripe/catalog-cli.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from '../catalog/helpers.js';

vi.mock('../../../src/lib/catalog/csv.js', () => ({
  loadCatalog: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/csv-writer.js', () => ({
  updateCatalogPaymentLinks: vi.fn(),
}));

vi.mock('../../../src/lib/stripe/client.js', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('../../../src/lib/stripe/sync.js', () => ({
  readStripeState: vi.fn(),
  catalogDiff: vi.fn(),
  catalogAdd: vi.fn(),
  catalogUpdate: vi.fn(),
}));

describe('runCatalogSync', () => {
  let runCatalogSync: typeof import('../../../src/lib/stripe/catalog-cli.js').runCatalogSync;
  let loadCatalogMock: ReturnType<typeof vi.fn>;
  let getStripeClientMock: ReturnType<typeof vi.fn>;
  let readStripeStateMock: ReturnType<typeof vi.fn>;
  let catalogDiffMock: ReturnType<typeof vi.fn>;
  let catalogAddMock: ReturnType<typeof vi.fn>;
  let catalogUpdateMock: ReturnType<typeof vi.fn>;
  let updatePaymentLinksMock: ReturnType<typeof vi.fn>;

  const emptyDiff = { toAdd: [], toUpdate: [], orphaned: [] };

  beforeEach(async () => {
    vi.resetModules();
    const csv = await import('../../../src/lib/catalog/csv.js');
    const csvWriter = await import('../../../src/lib/catalog/csv-writer.js');
    const client = await import('../../../src/lib/stripe/client.js');
    const sync = await import('../../../src/lib/stripe/sync.js');

    loadCatalogMock = vi.mocked(csv.loadCatalog);
    getStripeClientMock = vi.mocked(client.getStripeClient);
    readStripeStateMock = vi.mocked(sync.readStripeState);
    catalogDiffMock = vi.mocked(sync.catalogDiff);
    catalogAddMock = vi.mocked(sync.catalogAdd);
    catalogUpdateMock = vi.mocked(sync.catalogUpdate);
    updatePaymentLinksMock = vi.mocked(csvWriter.updateCatalogPaymentLinks);

    loadCatalogMock.mockResolvedValue([]);
    getStripeClientMock.mockReturnValue({} as any);
    readStripeStateMock.mockResolvedValue({ state: new Map(), incompleteSkus: new Map() });
    catalogDiffMock.mockReturnValue(emptyDiff);
    catalogAddMock.mockResolvedValue(new Map());
    catalogUpdateMock.mockResolvedValue(new Map());
    updatePaymentLinksMock.mockResolvedValue(undefined);

    ({ runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  describe('diff mode', () => {
    it('prints "Everything is in sync" when no changes', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCatalogSync('diff');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Everything is in sync'));
      spy.mockRestore();
    });

    it('prints new products with count and product type', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toAdd: [{ sku: 'NEW-001', product: makeCatalogProduct({ sku: 'NEW-001', name: 'Widget', price: 19.99 }) }],
      });
      await runCatalogSync('diff');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('New products (1)'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('NEW-001'));
      spy.mockRestore();
    });

    it('prints products to update with changes', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toUpdate: [{
          sku: 'UPD-001', product: makeCatalogProduct(), existing: {} as any, changes: ['name', 'price'],
        }],
      });
      await runCatalogSync('diff');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Products to update (1)'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('name, price'));
      spy.mockRestore();
    });

    it('prints orphaned Stripe products', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        orphaned: [{ sku: 'OLD-001', state: { name: 'Discontinued' } as any }],
      });
      await runCatalogSync('diff');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Orphaned in Stripe (1)'));
      spy.mockRestore();
    });

    it('does not call write APIs', async () => {
      await runCatalogSync('diff');
      expect(catalogAddMock).not.toHaveBeenCalled();
      expect(catalogUpdateMock).not.toHaveBeenCalled();
      expect(updatePaymentLinksMock).not.toHaveBeenCalled();
    });
  });

  describe('add mode', () => {
    it('calls catalogAdd with incompleteSkus and writes payment links', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const incompleteSkus = new Map([['INC-001', 'prod_inc']]);
      readStripeStateMock.mockResolvedValue({ state: new Map(), incompleteSkus });
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toAdd: [{ sku: 'NEW-001', product: makeCatalogProduct() }],
      });
      catalogAddMock.mockResolvedValue(new Map([['NEW-001', 'https://buy.stripe.com/test']]));

      await runCatalogSync('add');

      expect(catalogAddMock).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), incompleteSkus,
      );
      expect(updatePaymentLinksMock).toHaveBeenCalledWith(
        new Map([['NEW-001', 'https://buy.stripe.com/test']]),
      );
      spy.mockRestore();
    });

    it('does not call catalogUpdate', async () => {
      await runCatalogSync('add');
      expect(catalogUpdateMock).not.toHaveBeenCalled();
    });

    it('logs when no products to add', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCatalogSync('add');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('No new products to add'));
      spy.mockRestore();
    });
  });

  describe('update mode', () => {
    it('calls catalogUpdate and writes payment links', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toUpdate: [{
          sku: 'UPD-001', product: makeCatalogProduct(), existing: {} as any, changes: ['price'],
        }],
      });
      catalogUpdateMock.mockResolvedValue(new Map([['UPD-001', 'https://buy.stripe.com/new']]));

      await runCatalogSync('update');

      expect(catalogUpdateMock).toHaveBeenCalledTimes(1);
      expect(updatePaymentLinksMock).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('does not call catalogAdd', async () => {
      await runCatalogSync('update');
      expect(catalogAddMock).not.toHaveBeenCalled();
    });

    it('logs when no products to update', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runCatalogSync('update');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('No products to update'));
      spy.mockRestore();
    });
  });

  describe('sync mode', () => {
    it('calls both catalogAdd and catalogUpdate', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        toAdd: [{ sku: 'A', product: makeCatalogProduct() }],
        toUpdate: [{ sku: 'B', product: makeCatalogProduct(), existing: {} as any, changes: ['name'] }],
        orphaned: [],
      });
      catalogAddMock.mockResolvedValue(new Map([['A', 'url1']]));
      catalogUpdateMock.mockResolvedValue(new Map([['B', 'url2']]));

      await runCatalogSync('sync');

      expect(catalogAddMock).toHaveBeenCalledTimes(1);
      expect(catalogUpdateMock).toHaveBeenCalledTimes(1);
      expect(updatePaymentLinksMock).toHaveBeenCalledWith(
        new Map([['A', 'url1'], ['B', 'url2']]),
      );
      spy.mockRestore();
    });
  });

  describe('orphan warnings', () => {
    it('warns about orphaned products in non-diff modes', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        orphaned: [{ sku: 'OLD-001', state: { name: 'Gone' } as any }],
      });

      await runCatalogSync('add');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('not in catalog'));
      spy.mockRestore();
    });
  });

  describe('payment link write-back', () => {
    it('logs count of written payment links', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toAdd: [{ sku: 'A', product: makeCatalogProduct() }],
      });
      catalogAddMock.mockResolvedValue(new Map([['A', 'url']]));

      await runCatalogSync('add');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Wrote 1 Payment Link URL'));
      spy.mockRestore();
    });

    it('pluralizes payment link count', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      catalogDiffMock.mockReturnValue({
        ...emptyDiff,
        toAdd: [
          { sku: 'A', product: makeCatalogProduct({ sku: 'A' }) },
          { sku: 'B', product: makeCatalogProduct({ sku: 'B' }) },
        ],
      });
      catalogAddMock.mockResolvedValue(new Map([['A', 'url1'], ['B', 'url2']]));

      await runCatalogSync('add');

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Wrote 2 Payment Link URLs'));
      spy.mockRestore();
    });

    it('skips write when no links were created', async () => {
      await runCatalogSync('add');
      expect(updatePaymentLinksMock).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/stripe/catalog-cli.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite with coverage**

Run: `npx vitest run --coverage`
Expected: 100% coverage across all files including `catalog-cli.ts`.

- [ ] **Step 6: Commit**

```
test: add comprehensive catalog-cli tests, remove coverage exclusion
```
