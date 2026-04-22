# Product Visibility & Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `storefront`/`orderSheet` booleans with a `hidden` flag and make `status` disable the cart button, including cart-page handling for unavailable items.

**Architecture:** Two orthogonal CSV columns: `Hidden` (visibility, gates site build + Stripe sync) and `Status` (availability, disables add-to-cart UI). Hidden products are filtered before they reach any downstream code. Status products render normally but with a disabled button showing the status text. Cart page detects unavailable items on load (banner + greyed rows) and on checkout click (native confirm dialog).

**Tech Stack:** Astro, TypeScript, Vitest, CSS layers (`@layer package`), Stripe API (sync module)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/catalog/types.ts` | Remove `storefront`/`orderSheet`, add `hidden` |
| Modify | `src/lib/catalog/csv.ts` | Parse `Hidden` column, remove `Storefront`/`Order Sheet` |
| Modify | `src/lib/storefront/get-listings.ts` | Filter on `!p.hidden` instead of `p.storefront` |
| Modify | `src/lib/storefront/config.ts` | Remove `orderSheet` fallback |
| Modify | `src/lib/stripe/sync.ts` | Remove `storefront` checks from diff/add/update |
| Modify | `src/lib/stripe/catalog-cli.ts` | Filter hidden before diff, remove type label |
| Modify | `src/components/Listings/ListingCards.astro` | Status disables add-to-cart button |
| Modify | `src/components/Listings/ListingCards.css` | Remove `.cs-listing-status`, add disabled button style |
| Modify | `src/components/Listings/ListingTable.astro` | Status disables qty controls |
| Modify | `src/components/Listings/listings.ts` | Guard against wiring disabled buttons |
| Modify | `src/components/Cart/Cart.astro` | Add `data-status`, `data-name`, unavailable banner |
| Modify | `src/components/Cart/Cart.css` | Add `.cs-cart-unavailable` and banner styles |
| Modify | `src/components/Cart/cart.ts` | Detect unavailable items, banner, confirm on checkout |
| Modify | `bin/init.mjs` | Update scaffolded CSV header |
| Modify | `tests/unit/catalog/helpers.ts` | Update `makeCatalogProduct` |
| Modify | `tests/unit/catalog/csv.test.ts` | Replace storefront/orderSheet tests with hidden tests |
| Modify | `tests/unit/storefront/get-listings.test.ts` | Replace storefront filter tests with hidden filter tests |
| Modify | `tests/unit/stripe/sync.test.ts` | Remove storefront-added/removed tests, add hidden filter tests |
| Modify | `tests/unit/stripe/catalog-cli.test.ts` | Remove type label tests, add hidden filtering test |
| Modify | `tests/unit/cart/checkout.test.ts` | Update helper to remove storefront/orderSheet |

---

### Task 1: Update CatalogProduct Type and Test Helper

**Files:**
- Modify: `src/lib/catalog/types.ts:1-13`
- Modify: `tests/unit/catalog/helpers.ts:1-18`
- Modify: `tests/unit/cart/checkout.test.ts:20-33`

- [ ] **Step 1: Update `CatalogProduct` type**

Replace the type definition in `src/lib/catalog/types.ts`:

```ts
export interface CatalogProduct {
  sku: string;
  name: string;
  price: number;
  category: string | null;
  status: string | null;
  hidden: boolean;
  description: string | null;
  paymentLink: string | null;
  moq: number | null;
  featured: boolean;
}
```

- [ ] **Step 2: Update `makeCatalogProduct` in catalog helpers**

In `tests/unit/catalog/helpers.ts`, replace `storefront: true` and `orderSheet: true` with `hidden: false`:

```ts
export function makeCatalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    price: 19.99,
    category: null,
    status: null,
    hidden: false,
    description: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
}
```

- [ ] **Step 3: Update `makeCatalogProduct` in checkout test helpers**

In `tests/unit/cart/checkout.test.ts`, find the local `makeCatalogProduct` helper (around line 20) and replace `storefront: true` and `orderSheet: true` with `hidden: false`:

```ts
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    price: 25.00,
    category: null,
    status: null,
    hidden: false,
    description: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
```

- [ ] **Step 4: Run typecheck to see what breaks**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Type errors in `csv.ts`, `sync.ts`, `catalog-cli.ts`, and test files that still reference `storefront`/`orderSheet`. This confirms the type change propagated correctly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/types.ts tests/unit/catalog/helpers.ts tests/unit/cart/checkout.test.ts
git commit -m "refactor: replace storefront/orderSheet with hidden on CatalogProduct type"
```

---

### Task 2: Update CSV Parsing

**Files:**
- Modify: `src/lib/catalog/csv.ts:62-85`
- Modify: `tests/unit/catalog/csv.test.ts`

- [ ] **Step 1: Write failing tests for `Hidden` column parsing**

In `tests/unit/catalog/csv.test.ts`, replace the six storefront/orderSheet tests (lines 54-82) with these:

```ts
  it('defaults hidden to false when Hidden column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.hidden).toBe(false);
  });

  it('defaults hidden to false when Hidden is empty string', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: '' })]);
    expect(products[0]!.hidden).toBe(false);
  });

  it('sets hidden to true when Hidden is "true"', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'true' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to true when Hidden is "True" (case-insensitive)', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'True' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to true when Hidden is "yes"', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'yes' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to false for non-truthy Hidden values', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'no' })]);
    expect(products[0]!.hidden).toBe(false);
  });
```

Also update the "parses all optional fields when present" test (line 33) to replace `Storefront`/`Order Sheet` references:

```ts
  it('parses all optional fields when present', () => {
    const rows = [makeCSVRow({
      Category: 'Candles',
      Status: 'active',
      Hidden: 'no',
      Description: 'A lovely candle',
      'Payment Link': 'https://buy.stripe.com/abc',
    })];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject(makeCatalogProduct({
      category: 'Candles',
      status: 'active',
      hidden: false,
      description: 'A lovely candle',
      paymentLink: 'https://buy.stripe.com/abc',
    }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/catalog/csv.test.ts 2>&1 | tail -20`

Expected: FAIL. The CSV parser still references `Storefront`/`Order Sheet` and produces `storefront`/`orderSheet` fields.

- [ ] **Step 3: Update `parseRow` in `csv.ts`**

In `src/lib/catalog/csv.ts`, replace lines 62-63:

```ts
  const storefrontVal = (row['Storefront'] ?? '').trim().toLowerCase();
  const orderSheetVal = (row['Order Sheet'] ?? '').trim().toLowerCase();
```

with:

```ts
  const hiddenVal = (row['Hidden'] ?? '').trim().toLowerCase();
```

And replace lines 84-85 in the product object:

```ts
    storefront: storefrontVal !== 'no',
    orderSheet: orderSheetVal !== 'no',
```

with:

```ts
    hidden: hiddenVal === 'true' || hiddenVal === 'yes',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/catalog/csv.test.ts 2>&1 | tail -20`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/csv.ts tests/unit/catalog/csv.test.ts
git commit -m "refactor: parse Hidden column instead of Storefront/Order Sheet in CSV"
```

---

### Task 3: Update getListings Filter

**Files:**
- Modify: `src/lib/storefront/get-listings.ts:59-61`
- Modify: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Update tests to use `hidden` instead of `storefront`**

In `tests/unit/storefront/get-listings.test.ts`, replace the filter test (line 48):

```ts
  it('excludes hidden products', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'SHOW', hidden: false }),
      makeCatalogProduct({ sku: 'HIDE', hidden: true }),
    ]);
    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('SHOW');
  });
```

Replace the empty array test (line 130):

```ts
  it('returns empty array when all catalog products are hidden', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ hidden: true })]);
    const listings = await getListings();
    expect(listings).toEqual([]);
  });
```

Replace the log message test (line 141):

```ts
  it('logs plural "products" when multiple visible products are found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'ONE' }),
      makeCatalogProduct({ sku: 'TWO' }),
    ]);
    loadProductImagesMock.mockResolvedValue(
      new Map([
        ['ONE', [{ url: '/products/images/ONE-1.jpg', filename: 'ONE-1.jpg' }]],
        ['TWO', [{ url: '/products/images/TWO-1.jpg', filename: 'TWO-1.jpg' }]],
      ])
    );
    await getListings();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Build complete: 2 storefront products$/),
    );
    consoleSpy.mockRestore();
  });
```

Note: the log label stays `'storefront'` because that's the build context label, not the field name. No change needed there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts 2>&1 | tail -20`

Expected: FAIL. `getListings()` still filters on `p.storefront`.

- [ ] **Step 3: Update `getListings` filter**

In `src/lib/storefront/get-listings.ts`, change line 60:

```ts
export async function getListings(): Promise<Listing[]> {
  return buildListings((p) => !p.hidden, 'storefront');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts 2>&1 | tail -20`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/storefront/get-listings.ts tests/unit/storefront/get-listings.test.ts
git commit -m "refactor: filter on hidden instead of storefront in getListings"
```

---

### Task 4: Update Stripe Sync

**Files:**
- Modify: `src/lib/stripe/sync.ts:83-122,124-179,181-242`
- Modify: `src/lib/stripe/catalog-cli.ts:1-84`
- Modify: `tests/unit/stripe/sync.test.ts`
- Modify: `tests/unit/stripe/catalog-cli.test.ts`

- [ ] **Step 1: Update sync.test.ts**

Remove the four `storefront-added`/`storefront-removed` tests (lines 311-383) entirely.

Replace the "includes non-storefront products in diff" test (line 422) with:

```ts
  it('includes all non-hidden products in diff', () => {
    const catalog = [
      makeCatalogProduct({ sku: 'VISIBLE-001' }),
      makeCatalogProduct({ sku: 'VISIBLE-002' }),
    ];
    const stripeState = new Map();
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(2);
    expect(result.toAdd.map((e) => e.sku)).toContain('VISIBLE-001');
    expect(result.toAdd.map((e) => e.sku)).toContain('VISIBLE-002');
  });
```

In `catalogAdd` tests, update "skips Payment Link creation for non-storefront products" (line 502). This test should now verify that Payment Links ARE created for all products (since hidden products never reach this function):

```ts
  it('creates Payment Link for all products', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'NEW-001', product: makeCatalogProduct({ sku: 'NEW-001' }) }];
    const result = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(result.links.get('NEW-001')).toBe('https://buy.stripe.com/test');
  });
```

Also update the "uses partial metadata keys for non-storefront products too" test (line 631) to just test that metadata keys are set:

```ts
  it('sets metadata keys on product update', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'NEW-002', product: makeCatalogProduct({ sku: 'NEW-002' }) }];
    await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({
      'metadata[sku]': 'NEW-002',
    }));
  });
```

For `catalogUpdate` tests, update "skips Payment Link recreation for non-storefront product on price change" (line 784) to verify Payment Link IS recreated:

```ts
  it('recreates Payment Link on price change', async () => {
    productsUpdateMock.mockResolvedValue({});
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    pricesUpdateMock.mockResolvedValue({});
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });
    paymentLinksUpdateMock.mockResolvedValue({});

    const toUpdate = [{
      sku: 'UPD-001',
      product: makeCatalogProduct({ sku: 'UPD-001', price: 29.99 }),
      existing: {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_old',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: 'plink_old',
        paymentLinkUrl: 'https://buy.stripe.com/old',
      },
      changes: ['price'],
    }];
    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(result.links.get('UPD-001')).toBe('https://buy.stripe.com/new');
  });
```

- [ ] **Step 2: Update catalog-cli.test.ts**

Replace "logs new products with storefront type label" (line 75) and "logs new products with order sheet type label" (line 85) with a single test:

```ts
    it('logs new products with price', async () => {
      const product = makeCatalogProduct({ sku: 'NEW-001', name: 'Widget', price: 19.99 });
      mockDiff.toAdd = [{ sku: 'NEW-001', product }];
      await runCatalogSync('diff');
      expect(consoleSpy).toHaveBeenCalledWith(`  + NEW-001: Widget — $19.99`);
    });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stripe/ 2>&1 | tail -30`

Expected: FAIL. Implementation still references `product.storefront`.

- [ ] **Step 4: Update `catalogDiff` in sync.ts**

In `src/lib/stripe/sync.ts`, remove lines 106-107 from `catalogDiff`:

```ts
    if (product.storefront === true && existing.paymentLinkId === null) changes.push('storefront-added');
    if (product.storefront === false && existing.paymentLinkId !== null) changes.push('storefront-removed');
```

- [ ] **Step 5: Update `catalogAdd` in sync.ts**

In `src/lib/stripe/sync.ts`, in the `catalogAdd` function, remove the `if (entry.product.storefront)` guard around Payment Link creation (lines 158-164). Always create Payment Links:

```ts
      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const price = await withRetry(() => stripe.prices.create({
        product: productId,
        unit_amount: rawPrice,
        currency,
      }));

      const link = await withRetry(() => stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
      }));

      const updatePayload: Record<string, unknown> = {
        default_price: price.id,
        'metadata[sku]': entry.sku,
        'metadata[payment_link_id]': link.id,
        'metadata[payment_link_url]': link.url,
      };
      newLinks.set(entry.sku, link.url);

      await withRetry(() => stripe.products.update(productId, updatePayload));
```

- [ ] **Step 6: Update `catalogUpdate` in sync.ts**

In the `catalogUpdate` function, remove the `if (entry.product.storefront)` guards around Payment Link operations (lines 208 and 158 area). Always recreate Payment Links on price change:

In the `priceChanged` block, replace the conditional with unconditional Payment Link handling:

```ts
      if (priceChanged) {
        const rawPrice = decimalToRawPrice(entry.product.price, currency);
        const newPrice = await withRetry(() => stripe.prices.create({
          product: entry.existing.productId,
          unit_amount: rawPrice,
          currency,
        }));
        await withRetry(() => stripe.prices.update(entry.existing.priceId, { active: false }));
        productUpdate.default_price = newPrice.id;

        if (entry.existing.paymentLinkId) {
          await withRetry(() => stripe.paymentLinks.update(entry.existing.paymentLinkId!, { active: false }));
        }

        const newLink = await withRetry(() => stripe.paymentLinks.create({
          line_items: [{ price: newPrice.id, quantity: 1 }],
        }));

        productUpdate['metadata[sku]'] = entry.sku;
        productUpdate['metadata[payment_link_id]'] = newLink.id;
        productUpdate['metadata[payment_link_url]'] = newLink.url;

        updatedLinks.set(entry.sku, newLink.url);
        console.log(`[Sync] Updated: ${entry.sku} — price changed, new Payment Link created`);
      } else {
        console.log(`[Sync] Updated: ${entry.sku} — ${entry.changes.join(', ')}`);
      }
```

- [ ] **Step 7: Update `catalog-cli.ts` to filter hidden and remove type label**

In `src/lib/stripe/catalog-cli.ts`, filter hidden products at the top and remove the type label:

At line 8, after `const catalog = await loadCatalog();`, add:

```ts
  const visible = catalog.filter((p) => !p.hidden);
```

Then use `visible` instead of `catalog` in the `catalogDiff` call (line 13):

```ts
  const diff = catalogDiff(visible, state, currency);
```

Replace the diff log line (line 19-20) to remove the type label:

```ts
        console.log(`  + ${entry.sku}: ${entry.product.name} — ${formatPrice(decimalToRawPrice(entry.product.price, currency), currency)}`);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stripe/ 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/stripe/sync.ts src/lib/stripe/catalog-cli.ts tests/unit/stripe/sync.test.ts tests/unit/stripe/catalog-cli.test.ts
git commit -m "refactor: remove storefront gating from Stripe sync, filter hidden at pipeline top"
```

---

### Task 5: Remove orderSheet Config Fallback

**Files:**
- Modify: `src/lib/storefront/config.ts:50-52`

- [ ] **Step 1: Remove the orderSheet fallback**

In `src/lib/storefront/config.ts`, delete lines 50-52:

```ts
  } else if (typeof obj.orderSheet === 'boolean' && obj.orderSheet && obj.listings === undefined) {
    config.listings = { views: ['card', 'table'] };
  }
```

Replace with just the closing brace of the `if` block above it. The block starting at line 35 (`if (obj.listings !== null && ...)`) should end with `}` and flow directly to the `minCartSize` check.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`

Expected: PASS. No tests depended on the `orderSheet` config fallback.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storefront/config.ts
git commit -m "refactor: remove orderSheet config fallback"
```

---

### Task 6: Status Disables Add-to-Cart in ListingCards

**Files:**
- Modify: `src/components/Listings/ListingCards.astro:63,66-68`
- Modify: `src/components/Listings/ListingCards.css:121-127,131-146`

- [ ] **Step 1: Update ListingCards.astro**

Remove the status span (line 63):

```astro
              {listing.status && <span class="cs-listing-status">{listing.status}</span>}
```

Replace the add-to-cart button (line 67):

```astro
<button type="button" class="cs-listing-add" aria-label={`Add ${listing.name} to cart`}>Add to Cart</button>
```

with:

```astro
{listing.status ? (
  <button type="button" class="cs-listing-add" disabled aria-label={`${listing.name}: ${listing.status}`}>{listing.status}</button>
) : (
  <button type="button" class="cs-listing-add" aria-label={`Add ${listing.name} to cart`}>Add to Cart</button>
)}
```

- [ ] **Step 2: Update ListingCards.css**

Remove the `.cs-listing-status` rule (lines 121-127):

```css
  .cs-listing-status {
    display: inline-block;
    font-size: var(--cs-font-size-small, 0.875rem);
    font-weight: 500;
    color: var(--cs-body-text-color);
    opacity: 0.6;
  }
```

Add a disabled button style after the `.cs-listing-add:hover` rule (after line 149):

```css
  .cs-listing-add:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: var(--cs-border-color, #ccc);
    color: var(--cs-body-text-color, #333);
  }
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Check a listing with a status value in the CSV. The button should show the status text, be disabled, and appear muted. A listing without status should have a normal "Add to Cart" button.

- [ ] **Step 4: Commit**

```bash
git add src/components/Listings/ListingCards.astro src/components/Listings/ListingCards.css
git commit -m "feat: status disables add-to-cart button in card view"
```

---

### Task 7: Status Disables Qty Controls in ListingTable

**Files:**
- Modify: `src/components/Listings/ListingTable.astro:90-104`

- [ ] **Step 1: Update ListingTable.astro**

Replace the qty control cell (lines 91-104):

```astro
                <td class="cs-col-qty">
                  <div class="cs-qty-control">
                    <button type="button" class="cs-qty-btn cs-qty-down" aria-label="Decrease quantity">-</button>
                    <input
                      type="number"
                      class="cs-qty-input"
                      min="0"
                      step={listing.moq ?? 1}
                      value="0"
                      aria-label={`Quantity for ${listing.name}`}
                    />
                    <button type="button" class="cs-qty-btn cs-qty-up" aria-label="Increase quantity">+</button>
                  </div>
                </td>
```

with:

```astro
                <td class="cs-col-qty">
                  {listing.status ? (
                    <span class="cs-order-status">{listing.status}</span>
                  ) : (
                    <div class="cs-qty-control">
                      <button type="button" class="cs-qty-btn cs-qty-down" aria-label="Decrease quantity">-</button>
                      <input
                        type="number"
                        class="cs-qty-input"
                        min="0"
                        step={listing.moq ?? 1}
                        value="0"
                        aria-label={`Quantity for ${listing.name}`}
                      />
                      <button type="button" class="cs-qty-btn cs-qty-up" aria-label="Increase quantity">+</button>
                    </div>
                  )}
                </td>
```

- [ ] **Step 2: Add CSS for table status**

In `src/components/Listings/ListingTable.css`, add after the existing rules:

```css
  .cs-order-status {
    font-size: var(--cs-font-size-small, 0.875rem);
    color: var(--cs-muted-text-color);
    font-style: italic;
  }
```

- [ ] **Step 3: Verify visually**

With dev server running, check the table view. Products with status should show the status text instead of qty controls.

- [ ] **Step 4: Commit**

```bash
git add src/components/Listings/ListingTable.astro src/components/Listings/ListingTable.css
git commit -m "feat: status replaces qty controls in table view"
```

---

### Task 8: Guard Listings JS Against Disabled Buttons

**Files:**
- Modify: `src/components/Listings/listings.ts:175-206`

- [ ] **Step 1: Add guard in `wireQuantityControls` for card view**

In `src/components/Listings/listings.ts`, in the card view wiring loop (line 175), add a guard after the `dataset.wired` check:

```ts
  root.querySelectorAll<HTMLElement>('.cs-listing').forEach((card) => {
    if (card.dataset.wired) return; // prevent double-binding
    card.dataset.wired = 'true';

    const sku = card.dataset.sku ?? '';
    const moq = card.dataset.moq ? Number(card.dataset.moq) : null;
    const addBtn = card.querySelector('.cs-listing-add') as HTMLButtonElement;
    const qtyInput = card.querySelector('.cs-listing-qty-input') as HTMLInputElement;
    const downBtn = card.querySelector('.cs-listing-qty-down') as HTMLButtonElement;
    const upBtn = card.querySelector('.cs-listing-qty-up') as HTMLButtonElement;

    if (!addBtn || !qtyInput || !downBtn || !upBtn) return;
    if (addBtn.disabled) return;
```

The `if (addBtn.disabled) return;` line skips wiring for cards whose button is disabled (status products).

- [ ] **Step 2: Verify no change needed for table view**

In the table view wiring (line 209), rows with status have no `.cs-qty-input` element (replaced with a `<span>`), so the existing `if (!input || !downBtn || !upBtn || !removeBtn) return;` guard (line 220) already prevents wiring. No change needed.

- [ ] **Step 3: Verify in card view hydration**

In `hydrateFromCart` (line 32), the card view hydration queries for `.cs-listing-add` and checks `if (!badge || !addBtn || !qtyControl || !qtyInput) return;`. For status products, the button exists but is disabled. The hydration would try to show qty controls for items in cart. Add a guard:

```ts
    if (!badge || !addBtn || !qtyControl || !qtyInput) return;
    if (addBtn.disabled) return;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Listings/listings.ts
git commit -m "fix: skip cart wiring for status-disabled listing buttons"
```

---

### Task 9: Cart Page Unavailable Item Detection

**Files:**
- Modify: `src/components/Cart/Cart.astro:75-81`
- Modify: `src/components/Cart/Cart.css`
- Modify: `src/components/Cart/cart.ts`

- [ ] **Step 1: Add `data-status` and `data-name` to cart rows**

In `src/components/Cart/Cart.astro`, update the `<tr>` element (around line 75):

```astro
            <tr
              class="cs-cart-row"
              data-sku={listing.sku}
              data-raw-price={effectiveRaw}
              data-moq={listing.moq ?? ''}
              data-status={listing.status ?? ''}
              data-name={listing.name}
              hidden
            >
```

- [ ] **Step 2: Add banner element to Cart.astro**

In `src/components/Cart/Cart.astro`, add a banner element right after the `<div class="cs-cart-content" hidden>` opening tag (line 50), before the table:

```astro
    <div class="cs-cart-unavailable-banner" hidden></div>
```

- [ ] **Step 3: Add CSS for unavailable banner and rows**

In `src/components/Cart/Cart.css`, add before the `@media print` block:

```css
  .cs-cart-unavailable-banner {
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    background-color: var(--cs-warning-bg, #fff8e1);
    border: 1px solid var(--cs-warning-border, #ffe082);
    border-radius: 4px;
    font-size: var(--cs-font-size-small);
    color: var(--cs-body-text-color);
  }

  .cs-cart-unavailable-banner p {
    margin: 0 0 0.5rem;
    font-weight: 600;
  }

  .cs-cart-unavailable-banner ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .cs-cart-row.cs-cart-unavailable {
    opacity: 0.4;
    pointer-events: none;
  }
```

Also add to the `@media print` selector list:

```css
    .cs-cart-unavailable-banner,
```

- [ ] **Step 4: Update `hydrateFromCart` in cart.ts**

In `src/components/Cart/cart.ts`, add a `banner` element query after the existing element queries (around line 26):

```ts
  const banner = root.querySelector('.cs-cart-unavailable-banner') as HTMLElement;
```

Then update `hydrateFromCart` to detect and display unavailable items:

```ts
  function hydrateFromCart() {
    const cart = getCart('wholesale');
    let hasItems = false;
    const unavailableItems: string[] = [];

    rows.forEach((row) => {
      row.hidden = true;
      row.classList.remove('cs-cart-unavailable');
    });

    for (const item of cart.items) {
      const row = rowMap.get(item.sku);
      if (!row) {
        // Hidden product: no row exists, track by SKU
        unavailableItems.push(item.sku);
        continue;
      }

      const status = row.dataset.status;
      if (status) {
        // Status product: row exists but product is unavailable
        row.hidden = false;
        row.classList.add('cs-cart-unavailable');
        hasItems = true;
        unavailableItems.push(row.dataset.name || item.sku);
        continue;
      }

      row.hidden = false;
      hasItems = true;

      const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
      input.value = String(item.quantity);
      updateRow(row);
    }

    // Show/hide unavailable banner
    if (unavailableItems.length > 0 && banner) {
      const p = document.createElement('p');
      p.textContent = 'Some items in your cart are no longer available:';
      const ul = document.createElement('ul');
      for (const name of unavailableItems) {
        const li = document.createElement('li');
        li.textContent = name;
        ul.appendChild(li);
      }
      banner.replaceChildren(p, ul);
      banner.hidden = false;
      hasItems = true;
    } else if (banner) {
      banner.replaceChildren();
      banner.hidden = true;
    }

    emptyEl.hidden = hasItems;
    contentEl.hidden = !hasItems;

    if (hasItems) updateTotals();
  }
```

- [ ] **Step 5: Update `getVisibleItems` to exclude unavailable rows**

In `src/components/Cart/cart.ts`, update `getVisibleItems` to skip unavailable rows:

```ts
  function getVisibleItems(): ValidationItem[] {
    return Array.from(rows)
      .filter((row) => !row.hidden && !row.classList.contains('cs-cart-unavailable'))
      .map((row) => {
        const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
        return {
          sku: row.dataset.sku ?? '',
          name: row.querySelector('strong')?.textContent ?? '',
          rawPrice: Number(row.dataset.rawPrice),
          moq: row.dataset.moq ? Number(row.dataset.moq) : null,
          quantity: parseInt(input.value) || 0,
        };
      });
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Cart/Cart.astro src/components/Cart/Cart.css src/components/Cart/cart.ts
git commit -m "feat: detect and display unavailable items in cart"
```

---

### Task 10: Checkout Confirmation for Unavailable Items

**Files:**
- Modify: `src/components/Cart/cart.ts`

- [ ] **Step 1: Add unavailable item detection helper**

In `src/components/Cart/cart.ts`, add a helper function after `getVisibleItems`:

```ts
  function getUnavailableNames(): string[] {
    const cart = getCart('wholesale');
    const names: string[] = [];
    for (const item of cart.items) {
      const row = rowMap.get(item.sku);
      if (!row) {
        names.push(item.sku);
      } else if (row.dataset.status) {
        names.push(row.dataset.name || item.sku);
      }
    }
    return names;
  }
```

- [ ] **Step 2: Add confirmation gate to submit handler**

In `src/components/Cart/cart.ts`, update the submit button click handler (line 224):

```ts
  submitBtn.addEventListener('click', async () => {
    const unavailable = getUnavailableNames();
    if (unavailable.length > 0) {
      const list = unavailable.join(', ');
      const ok = confirm(
        `These items are no longer available and will be removed from your order:\n\n${list}\n\nContinue with remaining items?`
      );
      if (!ok) return;
    }

    if (checkoutEnabled) {
      await attemptCheckout();
    } else {
      await generatePdf();
    }
  });
```

- [ ] **Step 3: Verify end-to-end**

With dev server running:
1. Add a product to cart
2. Edit catalog.csv to give that product a status (e.g. "Sold Out")
3. Rebuild and visit the cart page
4. Confirm the banner appears and the row is greyed out
5. Click Checkout/Submit, confirm the dialog appears

- [ ] **Step 4: Commit**

```bash
git add src/components/Cart/cart.ts
git commit -m "feat: confirm checkout when cart contains unavailable items"
```

---

### Task 11: Update Init Script

**Files:**
- Modify: `bin/init.mjs:114-116`

- [ ] **Step 1: Update scaffolded CSV header**

In `bin/init.mjs`, replace line 114-115:

```js
await safeWrite(join(dir, 'products', 'catalog.csv'), `SKU,Name,Price,Description,Category,Status,Featured,Storefront,Order Sheet,MOQ,Payment Link
SAMPLE-001,Sample Product,19.99,A sample product to get you started,,,,yes,no,,
```

with:

```js
await safeWrite(join(dir, 'products', 'catalog.csv'), `SKU,Name,Price,Description,Category,Status,Featured,Hidden,MOQ,Payment Link
SAMPLE-001,Sample Product,19.99,A sample product to get you started,,,,,
```

- [ ] **Step 2: Commit**

```bash
git add bin/init.mjs
git commit -m "chore: update init script CSV header for hidden column"
```

---

### Task 12: Update Local Catalog CSV

**Files:**
- Modify: `products/catalog.csv`

- [ ] **Step 1: Update CSV header**

Replace the `Storefront` and `Order Sheet` columns with `Hidden` in the CSV header. For all existing rows, remove the old column values and leave `Hidden` empty (visible by default).

Check current header:
```
SKU,Name,Price,Description,Category,Status,Featured,Storefront,Order Sheet,MOQ,Payment Link
```

Replace with:
```
SKU,Name,Price,Description,Category,Status,Featured,Hidden,MOQ,Payment Link
```

Update each data row to remove the two old column values and add an empty `Hidden` column value.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add products/catalog.csv
git commit -m "chore: replace Storefront/Order Sheet columns with Hidden in catalog.csv"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite with coverage**

Run: `npm run test:coverage 2>&1 | tail -30`

Expected: All tests pass. No regressions.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: No type errors. Zero references to `storefront` or `orderSheet` on `CatalogProduct`.

- [ ] **Step 3: Grep for leftover references**

Run: `grep -rn "orderSheet\|\.storefront" src/ tests/ bin/ --include="*.ts" --include="*.mjs" --include="*.astro"`

Expected: No matches referencing the old boolean fields on `CatalogProduct`. Import paths containing `storefront` (the directory name) are fine.

- [ ] **Step 4: Dev server smoke test**

Run: `npm run dev`

Verify:
- Products without `Hidden` or `Status` render normally with working cart
- A product with `Hidden: yes` does not appear on the site
- A product with `Status: Sold Out` shows disabled button with "Sold Out" text
- Cart page shows banner for unavailable items
- Checkout click shows confirmation when unavailable items exist

- [ ] **Step 5: Build**

Run: `npm run build`

Expected: Clean build, no warnings about missing types or references.
