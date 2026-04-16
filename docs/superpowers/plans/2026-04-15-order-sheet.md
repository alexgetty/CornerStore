# Order Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive order sheet page where wholesale buyers browse products, enter quantities (with per-product MOQ enforcement and minimum cart size validation), then export a branded PDF and email it to the seller via a pre-populated mailto link.

**Architecture:** Data flows from `catalog.csv` (new MOQ column) through `getOrderSheetListings()` into an Astro component that renders an HTML table with product thumbnails, quantity inputs, and live totals. Client-side JS handles MOQ enforcement, validation, and PDF generation via html2pdf.js. A lightbox shows full-size product images. The PDF downloads on valid submit, then a mailto link lets the buyer email it.

**Tech Stack:** Astro components, html2pdf.js (client-side PDF, ~200KB, lazy-loaded), vitest (tests), existing pricing utilities

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/order-sheet/validation.ts` | Pure functions: MOQ check, line totals, subtotal, order validation |
| `src/lib/order-sheet/types.ts` | OrderSheetItem, OrderValidation types |
| `tests/unit/order-sheet/validation.test.ts` | Validation logic tests |
| `src/components/OrderSheet/OrderSheet.astro` | Order sheet table, form fields, print layout, lightbox markup |
| `src/components/OrderSheet/OrderSheet.css` | Screen + print styles, lightbox styles |
| `src/components/OrderSheet/order-sheet.ts` | Client-side: quantities, MOQ, totals, validation, PDF, mailto |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/catalog/types.ts` | Add `moq: number \| null` to CatalogProduct |
| `src/lib/catalog/csv.ts` | Parse MOQ column |
| `src/lib/storefront/types.ts` | Add `moq` to Listing, add `logo`, `orderSheet`, `minCartSize` to StoreConfig |
| `src/lib/storefront/config.ts` | Parse new config properties |
| `src/lib/storefront/get-listings.ts` | Pass through moq, add `getOrderSheetListings()`, extract shared helper |
| `src/lib/storefront/index.ts` | Export `getOrderSheetListings` |
| `src/components/Nav/Nav.astro` | Render logo when configured |
| `src/components/Nav/Nav.css` | Logo styles |
| `src/components/index.ts` | Export OrderSheet |
| `bin/init.mjs` | Order sheet scaffolding prompts and page generation |
| `package.json` | Add html2pdf.js dependency |
| `tests/unit/catalog/csv.test.ts` | MOQ parsing/validation tests |
| `tests/unit/catalog/helpers.ts` | Add `moq` to `makeCatalogProduct` |
| `tests/unit/storefront/config.test.ts` | New config property tests |
| `tests/unit/storefront/get-listings.test.ts` | MOQ pass-through + order sheet listing tests |

---

## Task 1: Add MOQ to catalog schema

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Modify: `src/lib/catalog/csv.ts`
- Modify: `tests/unit/catalog/helpers.ts`
- Test: `tests/unit/catalog/csv.test.ts`

- [ ] **Step 1: Add `moq` to CatalogProduct type**

In `src/lib/catalog/types.ts`, add `moq` to the interface:

```typescript
export interface CatalogProduct {
  sku: string;
  name: string;
  price: number;
  category: string | null;
  status: string | null;
  storefront: boolean;
  orderSheet: boolean;
  description: string | null;
  paymentLink: string | null;
  moq: number | null;
}
```

- [ ] **Step 2: Update test helper**

In `tests/unit/catalog/helpers.ts`, add `moq: null` to `makeCatalogProduct`:

```typescript
export function makeCatalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    price: 19.99,
    category: null,
    status: null,
    storefront: true,
    orderSheet: true,
    description: null,
    paymentLink: null,
    moq: null,
    ...overrides,
  };
}
```

- [ ] **Step 3: Write failing tests for MOQ parsing**

Add these tests to `tests/unit/catalog/csv.test.ts` inside the `validateRows` describe block:

```typescript
  // ── MOQ parsing ───────────────────────────────────────────────────────

  it('parses MOQ as integer when present', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '6' })]);
    expect(products[0]!.moq).toBe(6);
  });

  it('defaults moq to null when MOQ column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.moq).toBeNull();
  });

  it('defaults moq to null when MOQ is empty string', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '' })]);
    expect(products[0]!.moq).toBeNull();
  });

  it('defaults moq to null when MOQ is zero', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '0' })]);
    expect(products[0]!.moq).toBeNull();
  });

  it('returns error for non-integer MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: '2.5' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('returns error for negative MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: '-3' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('returns error for non-numeric MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: 'abc' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('trims whitespace from MOQ', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: ' 12 ' })]);
    expect(products[0]!.moq).toBe(12);
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/unit/catalog/csv.test.ts`
Expected: FAIL (moq property doesn't exist on CatalogProduct yet in csv.ts)

- [ ] **Step 5: Implement MOQ parsing in csv.ts**

In `src/lib/catalog/csv.ts`, add MOQ parsing to the `parseRow` function. After the `orderSheetVal` line (around line 63):

```typescript
  const moqStr = (row['MOQ'] ?? '').trim();
  let moq: number | null = null;
  if (moqStr && moqStr !== '0') {
    const moqNum = Number(moqStr);
    if (!Number.isInteger(moqNum) || moqNum < 1) {
      errors.push({ row: rowNum, field: 'MOQ', message: 'must be a positive whole number' });
    } else {
      moq = moqNum;
    }
  }
```

Add `moq` to the product object in the return:

```typescript
  const product: CatalogProduct = {
    sku,
    name,
    price,
    category: row['Category']?.trim() || null,
    status: row['Status']?.trim() || null,
    storefront: storefrontVal !== 'no',
    orderSheet: orderSheetVal !== 'no',
    description,
    paymentLink: row['Payment Link']?.trim() || null,
    moq,
  };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/catalog/csv.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (existing tests pass since `makeCatalogProduct` defaults moq to null)

- [ ] **Step 8: Commit**

```
feat: add MOQ column to catalog schema

Parses optional MOQ (minimum order quantity) from catalog.csv.
Blank, absent, or zero defaults to null (no minimum). Positive
integer required when present.
```

---

## Task 2: Add config properties (logo, orderSheet, minCartSize)

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Modify: `src/lib/storefront/config.ts`
- Test: `tests/unit/storefront/config.test.ts`

- [ ] **Step 1: Add new properties to StoreConfig type**

In `src/lib/storefront/types.ts`:

```typescript
export interface StoreConfig {
  name: string;
  home: string;
  nav: NavItem[];
  footerNav: NavItem[];
  contact?: string;
  logo?: string;
  orderSheet?: boolean;
  minCartSize?: number;
}
```

- [ ] **Step 2: Write failing tests for new config properties**

Add these tests to `tests/unit/storefront/config.test.ts` inside the `parseConfig` describe block:

```typescript
  // ── logo ──────────────────────────────────────────────────────────────

  it('extracts logo when valid string', () => {
    const config = parseConfig({ logo: '/logo.png' });
    expect(config.logo).toBe('/logo.png');
  });

  it('logo is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.logo).toBeUndefined();
  });

  it('logo is undefined when empty string', () => {
    const config = parseConfig({ logo: '' });
    expect(config.logo).toBeUndefined();
  });

  it('logo is undefined when non-string', () => {
    const config = parseConfig({ logo: 42 });
    expect(config.logo).toBeUndefined();
  });

  // ── orderSheet ────────────────────────────────────────────────────────

  it('extracts orderSheet when true', () => {
    const config = parseConfig({ orderSheet: true });
    expect(config.orderSheet).toBe(true);
  });

  it('extracts orderSheet when false', () => {
    const config = parseConfig({ orderSheet: false });
    expect(config.orderSheet).toBe(false);
  });

  it('orderSheet is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.orderSheet).toBeUndefined();
  });

  it('orderSheet is undefined when non-boolean', () => {
    const config = parseConfig({ orderSheet: 'yes' });
    expect(config.orderSheet).toBeUndefined();
  });

  // ── minCartSize ───────────────────────────────────────────────────────

  it('extracts minCartSize when positive number', () => {
    const config = parseConfig({ minCartSize: 150 });
    expect(config.minCartSize).toBe(150);
  });

  it('extracts minCartSize when decimal', () => {
    const config = parseConfig({ minCartSize: 99.50 });
    expect(config.minCartSize).toBe(99.50);
  });

  it('minCartSize is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when non-number', () => {
    const config = parseConfig({ minCartSize: '150' });
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when zero', () => {
    const config = parseConfig({ minCartSize: 0 });
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when negative', () => {
    const config = parseConfig({ minCartSize: -50 });
    expect(config.minCartSize).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: FAIL (new properties not parsed yet)

- [ ] **Step 4: Implement parsing in config.ts**

In `src/lib/storefront/config.ts`, update `parseConfig` to handle the new fields. After the `contact` parsing block (around line 22):

```typescript
  if (typeof obj.logo === 'string' && obj.logo) {
    config.logo = obj.logo;
  }

  if (typeof obj.orderSheet === 'boolean') {
    config.orderSheet = obj.orderSheet;
  }

  if (typeof obj.minCartSize === 'number' && obj.minCartSize > 0) {
    config.minCartSize = obj.minCartSize;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat: add logo, orderSheet, minCartSize config properties
```

---

## Task 3: Surface MOQ in Listing + getOrderSheetListings

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Modify: `src/lib/storefront/get-listings.ts`
- Modify: `src/lib/storefront/index.ts`
- Test: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Add `moq` to Listing type**

In `src/lib/storefront/types.ts`:

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
  moq: number | null;
}
```

- [ ] **Step 2: Write failing tests**

Add these tests to `tests/unit/storefront/get-listings.test.ts` inside the `getListings` describe block:

```typescript
  it('passes through moq from catalog product', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ moq: 6 })]);
    const listings = await getListings();
    expect(listings[0]!.moq).toBe(6);
  });

  it('passes through null moq when not set', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ moq: null })]);
    const listings = await getListings();
    expect(listings[0]!.moq).toBeNull();
  });
```

Add a new describe block for `getOrderSheetListings`:

```typescript
describe('getOrderSheetListings', () => {
  let getOrderSheetListings: typeof import('../../../src/lib/storefront/get-listings.js').getOrderSheetListings;
  let loadCatalogMock: ReturnType<typeof vi.fn>;
  let loadProductImagesMock: ReturnType<typeof vi.fn>;
  let loadProductOverridesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const csv = await import('../../../src/lib/catalog/csv.js');
    const images = await import('../../../src/lib/catalog/images.js');
    const overrides = await import('../../../src/lib/catalog/overrides.js');
    loadCatalogMock = vi.mocked(csv.loadCatalog);
    loadProductImagesMock = vi.mocked(images.loadProductImages);
    loadProductOverridesMock = vi.mocked(overrides.loadProductOverrides);
    loadProductImagesMock.mockResolvedValue(new Map());
    loadProductOverridesMock.mockResolvedValue(new Map());
    ({ getOrderSheetListings } = await import('../../../src/lib/storefront/get-listings.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('filters to orderSheet products only', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'SHEET', orderSheet: true, storefront: false }),
      makeCatalogProduct({ sku: 'STORE', orderSheet: false, storefront: true }),
    ]);
    const listings = await getOrderSheetListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('SHEET');
  });

  it('includes moq on order sheet listings', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'BULK', orderSheet: true, moq: 12 }),
    ]);
    const listings = await getOrderSheetListings();
    expect(listings[0]!.moq).toBe(12);
  });

  it('includes images on order sheet listings', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ orderSheet: true })]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', [{ url: '/products/images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' }]]])
    );
    const listings = await getOrderSheetListings();
    expect(listings[0]!.images).toHaveLength(1);
  });

  it('returns empty array when no order sheet products', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ orderSheet: false })]);
    const listings = await getOrderSheetListings();
    expect(listings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts`
Expected: FAIL (moq not on Listing, getOrderSheetListings not exported)

- [ ] **Step 4: Refactor get-listings.ts**

Replace the contents of `src/lib/storefront/get-listings.ts`:

```typescript
import type { Listing } from './types.js';
import type { CatalogProduct } from '../catalog/types.js';
import { formatPrice, decimalToRawPrice, DEFAULT_CURRENCY } from './pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import { loadProductImages } from '../catalog/images.js';
import { loadProductOverrides } from '../catalog/overrides.js';

async function buildListings(
  filter: (p: CatalogProduct) => boolean,
  label: string,
): Promise<Listing[]> {
  const catalog = await loadCatalog();
  const catalogSkus = new Set(catalog.map((p) => p.sku));
  const images = await loadProductImages(catalogSkus);
  const overrides = await loadProductOverrides(catalog);

  const filtered = catalog.filter(filter);

  const listings: Listing[] = filtered.map((product) => {
    const productImages = images.get(product.sku) ?? [];
    const override = overrides.get(product.sku);

    const listingImages = productImages.map((img) => ({
      url: img.url,
      alt: override?.imageAlts.get(img.filename) ?? '',
    }));

    const rawPrice = decimalToRawPrice(product.price, DEFAULT_CURRENCY);

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
      moq: product.moq,
    };
  });

  for (const product of filtered) {
    if (!images.has(product.sku)) {
      console.log(`[Catalog] Warning: ${product.sku} has no images in products/images/`);
    }
  }

  if (listings.length > 0) {
    console.log(`[Catalog] Build complete: ${listings.length} ${label} product${listings.length === 1 ? '' : 's'}`);
  }

  return listings;
}

export async function getListings(): Promise<Listing[]> {
  return buildListings((p) => p.storefront, 'storefront');
}

export async function getOrderSheetListings(): Promise<Listing[]> {
  return buildListings((p) => p.orderSheet, 'order sheet');
}
```

- [ ] **Step 5: Export getOrderSheetListings from index.ts**

In `src/lib/storefront/index.ts`, update the get-listings export:

```typescript
export { getListings, getOrderSheetListings } from './get-listings.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```
feat: add moq to Listing, add getOrderSheetListings

Extracts shared buildListings helper. getOrderSheetListings filters
on orderSheet=true, getListings still filters on storefront=true.
```

---

## Task 4: Order sheet validation logic

**Files:**
- Create: `src/lib/order-sheet/types.ts`
- Create: `src/lib/order-sheet/validation.ts`
- Create: `tests/unit/order-sheet/validation.test.ts`

- [ ] **Step 1: Create types**

Create `src/lib/order-sheet/types.ts`:

```typescript
export interface OrderSheetItem {
  sku: string;
  name: string;
  rawPrice: number;
  moq: number | null;
  quantity: number;
}

export interface OrderValidationError {
  type: 'moq' | 'min-cart' | 'empty-cart' | 'missing-name' | 'missing-email';
  message: string;
  sku?: string;
}

export interface OrderValidation {
  valid: boolean;
  errors: OrderValidationError[];
}
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/order-sheet/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateQuantity,
  calculateLineTotal,
  calculateSubtotal,
  validateOrder,
  snapToMoq,
} from '../../../src/lib/order-sheet/validation.js';
import type { OrderSheetItem } from '../../../src/lib/order-sheet/types.js';

function makeItem(overrides: Partial<OrderSheetItem> = {}): OrderSheetItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1999,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('validateQuantity', () => {
  it('returns true for zero quantity regardless of MOQ', () => {
    expect(validateQuantity(0, 6)).toBe(true);
    expect(validateQuantity(0, null)).toBe(true);
  });

  it('returns true when quantity meets MOQ', () => {
    expect(validateQuantity(6, 6)).toBe(true);
    expect(validateQuantity(12, 6)).toBe(true);
  });

  it('returns false when quantity is below MOQ', () => {
    expect(validateQuantity(3, 6)).toBe(false);
    expect(validateQuantity(1, 6)).toBe(false);
  });

  it('returns true for any positive quantity when MOQ is null', () => {
    expect(validateQuantity(1, null)).toBe(true);
    expect(validateQuantity(100, null)).toBe(true);
  });
});

describe('snapToMoq', () => {
  it('returns 0 when current is 0 and direction is down', () => {
    expect(snapToMoq(0, 6, 'down')).toBe(0);
  });

  it('returns MOQ when current is 0 and direction is up', () => {
    expect(snapToMoq(0, 6, 'up')).toBe(6);
  });

  it('increments by MOQ from current value', () => {
    expect(snapToMoq(6, 6, 'up')).toBe(12);
    expect(snapToMoq(12, 6, 'up')).toBe(18);
  });

  it('decrements by MOQ from current value', () => {
    expect(snapToMoq(12, 6, 'down')).toBe(6);
  });

  it('snaps down to zero when decrement would go below MOQ', () => {
    expect(snapToMoq(6, 6, 'down')).toBe(0);
  });

  it('increments by 1 when MOQ is null and direction is up', () => {
    expect(snapToMoq(0, null, 'up')).toBe(1);
    expect(snapToMoq(5, null, 'up')).toBe(6);
  });

  it('decrements by 1 when MOQ is null and direction is down', () => {
    expect(snapToMoq(5, null, 'down')).toBe(4);
  });

  it('does not go below zero', () => {
    expect(snapToMoq(0, null, 'down')).toBe(0);
  });
});

describe('calculateLineTotal', () => {
  it('returns 0 for zero quantity', () => {
    expect(calculateLineTotal(1999, 0)).toBe(0);
  });

  it('multiplies raw price by quantity', () => {
    expect(calculateLineTotal(1999, 3)).toBe(5997);
  });

  it('handles single unit', () => {
    expect(calculateLineTotal(500, 1)).toBe(500);
  });
});

describe('calculateSubtotal', () => {
  it('returns 0 for empty items', () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it('returns 0 when all quantities are zero', () => {
    const items = [makeItem({ quantity: 0 }), makeItem({ quantity: 0 })];
    expect(calculateSubtotal(items)).toBe(0);
  });

  it('sums line totals', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 500, quantity: 3 }),
    ];
    expect(calculateSubtotal(items)).toBe(3500);
  });

  it('ignores zero-quantity items', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 9999, quantity: 0 }),
    ];
    expect(calculateSubtotal(items)).toBe(2000);
  });
});

describe('validateOrder', () => {
  it('returns valid for a complete valid order', () => {
    const items = [makeItem({ quantity: 6, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns moq error when quantity below MOQ', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'moq', sku: 'TEST-001' }),
    );
  });

  it('allows zero quantity even with MOQ', () => {
    const items = [makeItem({ quantity: 0, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'moq')).toBeUndefined();
  });

  it('returns empty-cart error when no items have quantity', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'empty-cart' }),
    );
  });

  it('returns min-cart error when subtotal is below minimum', () => {
    const items = [makeItem({ rawPrice: 1000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'min-cart' }),
    );
  });

  it('passes min-cart check when subtotal meets minimum', () => {
    const items = [makeItem({ rawPrice: 5000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when minCartSizeRaw is null', () => {
    const items = [makeItem({ rawPrice: 100, quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when cart is empty', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('returns missing-name error when name is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-name error when name is whitespace', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '   ', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-email error when email is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', '');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-email' }),
    );
  });

  it('collects multiple errors', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, 99999, '', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/order-sheet/validation.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 4: Implement validation functions**

Create `src/lib/order-sheet/validation.ts`:

```typescript
import type { OrderSheetItem, OrderValidation, OrderValidationError } from './types.js';

export function validateQuantity(quantity: number, moq: number | null): boolean {
  if (quantity === 0) return true;
  if (moq !== null && quantity < moq) return false;
  return true;
}

export function snapToMoq(
  current: number,
  moq: number | null,
  direction: 'up' | 'down',
): number {
  const step = moq ?? 1;
  if (direction === 'up') {
    return current + step;
  }
  const next = current - step;
  if (moq !== null && next > 0 && next < moq) return 0;
  return Math.max(0, next);
}

export function calculateLineTotal(rawPrice: number, quantity: number): number {
  return rawPrice * quantity;
}

export function calculateSubtotal(items: OrderSheetItem[]): number {
  return items.reduce(
    (sum, item) => sum + calculateLineTotal(item.rawPrice, item.quantity),
    0,
  );
}

export function validateOrder(
  items: OrderSheetItem[],
  minCartSizeRaw: number | null,
  buyerName: string,
  buyerEmail: string,
): OrderValidation {
  const errors: OrderValidationError[] = [];

  for (const item of items) {
    if (!validateQuantity(item.quantity, item.moq)) {
      errors.push({
        type: 'moq',
        sku: item.sku,
        message: `Minimum order quantity is ${item.moq}`,
      });
    }
  }

  const hasItems = items.some((i) => i.quantity > 0);
  if (!hasItems) {
    errors.push({ type: 'empty-cart', message: 'Add at least one item' });
  }

  if (hasItems && minCartSizeRaw !== null) {
    const subtotal = calculateSubtotal(items);
    if (subtotal < minCartSizeRaw) {
      errors.push({ type: 'min-cart', message: 'Minimum order total not met' });
    }
  }

  if (!buyerName.trim()) {
    errors.push({ type: 'missing-name', message: 'Name is required' });
  }

  if (!buyerEmail.trim()) {
    errors.push({ type: 'missing-email', message: 'Email is required' });
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/order-sheet/validation.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat: add order sheet validation logic

Pure functions for MOQ enforcement, line/subtotal calculation,
quantity stepping, and full order validation including min cart size.
```

---

## Task 5: Logo in Nav component

**Files:**
- Modify: `src/components/Nav/Nav.astro`
- Modify: `src/components/Nav/Nav.css`
- Modify: `src/layouts/ContentPage.astro`

- [ ] **Step 1: Update Nav.astro to accept and render logo**

Replace the contents of `src/components/Nav/Nav.astro`:

```astro
---
import "./Nav.css";
import type { ResolvedNavItem } from "../../lib/storefront";

interface Props {
  storeName: string;
  logo?: string;
  nav: ResolvedNavItem[];
  currentPath?: string;
}

const { storeName, logo, nav, currentPath } = Astro.props;

function normalizePath(p: string): string {
  return p === '/' ? p : p.replace(/\/$/, '');
}

const normalizedCurrentPath = currentPath ? normalizePath(currentPath) : undefined;
---

<header class="cs-header">
  <a href="/" class="cs-store-name">
    {logo && <img src={logo} alt="" class="cs-logo" />}
    {storeName}
  </a>
  {nav.length > 0 && (
    <nav aria-label="Main">
      <ul class="cs-nav-links">
        {nav.map((item) => (
          <li><a href={item.href} {...(normalizedCurrentPath === normalizePath(item.href) ? { "aria-current": "page" as const } : {})}>{item.label}</a></li>
        ))}
      </ul>
    </nav>
  )}
</header>
```

- [ ] **Step 2: Add logo styles to Nav.css**

Add inside the `@layer package` block in `src/components/Nav/Nav.css`, after `.cs-store-name:hover`:

```css
  .cs-logo {
    height: 2rem;
    width: auto;
    vertical-align: middle;
    margin-right: 0.5rem;
  }
```

- [ ] **Step 3: Pass logo from ContentPage.astro**

In `src/layouts/ContentPage.astro`, update the Nav usage to pass logo:

```astro
  <Nav storeName={config.name} logo={config.logo} nav={nav} currentPath={Astro.url.pathname} />
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat: add optional logo to site header

Renders logo image next to store name when logo path is set in config.
```

---

## Task 6: OrderSheet Astro component + CSS

**Files:**
- Create: `src/components/OrderSheet/OrderSheet.astro`
- Create: `src/components/OrderSheet/OrderSheet.css`
- Create: `src/components/OrderSheet/order-sheet.ts` (placeholder)
- Modify: `src/components/index.ts`

- [ ] **Step 1: Create OrderSheet.astro**

Create `src/components/OrderSheet/OrderSheet.astro`. This is the full component: product table with thumbnails, quantity controls, buyer info fields, submit button, mailto section, and lightbox. Key details:

- Products grouped by category (alphabetically), flat list if no categories
- Each row has: thumbnail button (opens lightbox), product name + description, unit price, MOQ label, quantity control (down/input/up), line total, remove button
- Subtotal in table footer
- Min cart notice if configured
- Validation errors container (hidden by default)
- Buyer info: name (required), email (required), notes
- Submit button (disabled by default)
- Mailto section (hidden until PDF generated)
- Lightbox: backdrop + full-size image, hidden by default

Data passed to client-side JS via `data-` attributes on the root element: `data-currency`, `data-min-cart-size-raw`, `data-contact`, `data-store-name`. Per-row data: `data-sku`, `data-raw-price`, `data-moq`.

Print styles hide: thumbnails, remove buttons, +/- buttons, submit, mailto, lightbox, errors. Inputs render as plain text.

The component imports `./order-sheet.ts` via a `<script>` tag.

See the full component code in the appendix at the end of this plan.

- [ ] **Step 2: Create OrderSheet.css**

Create `src/components/OrderSheet/OrderSheet.css` with styles for all elements. Uses existing CSS custom properties (`--cs-border-color`, `--cs-font-size-small`, etc.). Wrapped in `@layer package` to match existing convention.

See the full stylesheet in the appendix at the end of this plan.

- [ ] **Step 3: Create placeholder order-sheet.ts**

Create `src/components/OrderSheet/order-sheet.ts`:

```typescript
// Client-side order sheet logic. Implemented in Task 7.
```

- [ ] **Step 4: Export OrderSheet from components index**

In `src/components/index.ts`:

```typescript
export { default as Listing } from './Listing/Listing.astro';
export { default as Listings } from './Listings/Listings.astro';
export { default as Nav } from './Nav/Nav.astro';
export { default as OrderSheet } from './OrderSheet/OrderSheet.astro';
export { default as StatusPage } from './StatusPage/StatusPage.astro';
```

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat: add OrderSheet component with table, lightbox, and print styles
```

---

## Task 7: Client-side JS (quantities, MOQ, totals, validation, PDF, mailto)

**Files:**
- Modify: `src/components/OrderSheet/order-sheet.ts`
- Modify: `package.json` (add html2pdf.js dependency)

- [ ] **Step 1: Install html2pdf.js**

Run: `npm install html2pdf.js`

- [ ] **Step 2: Implement order-sheet.ts**

Replace `src/components/OrderSheet/order-sheet.ts` with the full client-side implementation. Key behaviors:

**Quantity controls:**
- Down button: `snapToMoq(current, moq, 'down')`
- Up button: `snapToMoq(current, moq, 'up')`
- Direct input: buyer can type any value, validated on change
- Remove button: sets quantity to 0, hidden when already 0

**Live updates (on every quantity or buyer info change):**
- Recalculate line totals and subtotal using `formatPrice()`
- Run `validateOrder()` with all items, minCartSizeRaw, name, email
- Display validation errors using safe DOM methods (createElement, textContent)
- Enable/disable submit button based on validation result
- Toggle MOQ invalid styling on inputs

**Lightbox:**
- Thumbnail click opens lightbox with full image
- Backdrop click closes
- Escape key closes
- Image click stops propagation (doesn't close)

**Submit (PDF + mailto):**
- Lazy-load html2pdf.js via dynamic import
- Clone the order sheet DOM, strip UI-only elements
- Remove zero-quantity rows from the clone
- Replace inputs with text spans in the clone
- Generate PDF with filename `order-{store-slug}-{date}.pdf`
- After download, show mailto section with pre-populated link:
  - To: seller's contact email
  - Subject: `Order from {buyer name} - {store name}`
  - Body: greeting + buyer name + email

See the full implementation code in the appendix at the end of this plan.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```
feat: add order sheet client-side logic

Quantity controls with MOQ stepping, live totals, full order
validation, PDF generation via html2pdf.js, and mailto link.
```

---

## Task 8: Scaffolding + CLI rebuild

**Files:**
- Modify: `bin/init.mjs`
- Rebuild: `bin/catalog.mjs`

- [ ] **Step 1: Add order sheet prompt to init.mjs**

After the FAQ question (around line 28), add:

```javascript
const wantOrderSheet = (await rl.question('  Order Sheet? (Y/n): ')).trim().toLowerCase() !== 'n';

let minCartSize = null;
if (wantOrderSheet) {
  const minCartStr = (await rl.question('  Minimum order amount in dollars (press Enter to skip): ')).trim();
  if (minCartStr && !isNaN(Number(minCartStr)) && Number(minCartStr) > 0) {
    minCartSize = Number(minCartStr);
  }
}
```

- [ ] **Step 2: Update config generation**

In the `configLines` array (around line 144), before the closing brace:

```javascript
if (wantOrderSheet) {
  configLines.push(`  orderSheet: true,`);
  if (minCartSize !== null) {
    configLines.push(`  minCartSize: ${minCartSize},`);
  }
}
```

- [ ] **Step 3: Add MOQ column to scaffolded catalog.csv**

Update the catalog.csv write to include the MOQ column:

```javascript
await writeFile(join(dir, 'products', 'catalog.csv'), `SKU,Name,Price,Description,Category,Status,Storefront,Order Sheet,MOQ,Payment Link
SAMPLE-001,Sample Product,19.99,A sample product to get you started,,,yes,yes,,
`);
```

- [ ] **Step 4: Add order sheet page scaffolding**

After the Terms of Service page scaffolding, add:

```javascript
if (wantOrderSheet) {
  await writeFile(join(dir, 'src', 'pages', 'order-sheet.astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { OrderSheet } from 'corner-store/components';
import { loadConfig, getOrderSheetListings, decimalToRawPrice, DEFAULT_CURRENCY } from 'corner-store';

const config = await loadConfig();
const listings = await getOrderSheetListings();
const minCartSizeRaw = config.minCartSize != null
  ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
  : null;
---

<ContentPage title="Order Sheet" hasExplicitTitle>
  <OrderSheet
    storeName={config.name}
    contact={config.contact ?? ''}
    logo={config.logo}
    listings={listings}
    minCartSize={config.minCartSize}
    minCartSizeRaw={minCartSizeRaw}
    currency={DEFAULT_CURRENCY}
  />
</ContentPage>
\`);
}
```

- [ ] **Step 5: Add order sheet to nav**

In the nav building section (around line 45), after the about nav push:

```javascript
if (wantOrderSheet) nav.push({ label: 'Order Sheet', page: 'order-sheet', path: '/order-sheet' });
```

The `path` override is needed because the order sheet lives at `src/pages/order-sheet.astro`, not in the `pages/` content directory, so `getNav` would warn about a missing MDX file without it.

- [ ] **Step 6: Rebuild catalog CLI**

Run: `npm run build:cli`

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```
feat: add order sheet scaffolding to init

Adds order sheet prompt, config generation, page scaffolding,
catalog CSV with MOQ column, and nav entry.
```

---

## Appendix: Full Component Code

### OrderSheet.astro

```astro
---
import "./OrderSheet.css";
import type { Listing } from "../../lib/storefront";

interface Props {
  storeName: string;
  contact: string;
  logo?: string;
  listings: Listing[];
  minCartSize?: number;
  minCartSizeRaw: number | null;
  currency: string;
}

const { storeName, contact, logo, listings, minCartSize, minCartSizeRaw, currency } = Astro.props;

type CategoryGroup = { category: string; items: Listing[] };

function groupByCategory(items: Listing[]): CategoryGroup[] {
  const groups = new Map<string, Listing[]>();
  for (const item of items) {
    const cat = item.category ?? '';
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([category, items]) => ({ category, items }));
}

const groups = groupByCategory(listings);
const hasCategories = groups.length > 1 || (groups.length === 1 && groups[0]!.category !== '');
---

<div
  class="cs-order-sheet"
  data-currency={currency}
  data-min-cart-size-raw={minCartSizeRaw ?? ''}
  data-contact={contact}
  data-store-name={storeName}
>
  <div class="cs-order-sheet-header">
    {logo && <img src={logo} alt="" class="cs-order-sheet-logo" />}
    <h1>{storeName} Order Sheet</h1>
  </div>

  <table class="cs-order-sheet-table">
    <thead>
      <tr>
        <th class="cs-col-image">Image</th>
        <th class="cs-col-product">Product</th>
        <th class="cs-col-price">Unit Price</th>
        <th class="cs-col-moq">MOQ</th>
        <th class="cs-col-qty">Qty</th>
        <th class="cs-col-total">Line Total</th>
        <th class="cs-col-remove"></th>
      </tr>
    </thead>
    <tbody>
      {groups.map((group) => (
        <>
          {hasCategories && group.category && (
            <tr class="cs-category-row">
              <td colspan="7">{group.category}</td>
            </tr>
          )}
          {group.items.map((listing) => {
            const thumb = listing.images[0];
            return (
              <tr
                class="cs-order-row"
                data-sku={listing.sku}
                data-raw-price={listing.rawPrice}
                data-moq={listing.moq ?? ''}
              >
                <td class="cs-col-image">
                  {thumb ? (
                    <button type="button" class="cs-thumb-btn" data-full-src={thumb.url} data-alt={thumb.alt || listing.name}>
                      <img src={thumb.url} alt={thumb.alt || listing.name} class="cs-thumb" loading="lazy" />
                    </button>
                  ) : (
                    <span class="cs-no-image"></span>
                  )}
                </td>
                <td class="cs-col-product">
                  <strong>{listing.name}</strong>
                  {listing.description && <span class="cs-order-desc">{listing.description}</span>}
                </td>
                <td class="cs-col-price">{listing.price}</td>
                <td class="cs-col-moq">{listing.moq ? `Min ${listing.moq}` : ''}</td>
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
                <td class="cs-col-total">
                  <span class="cs-line-total">$0.00</span>
                </td>
                <td class="cs-col-remove">
                  <button type="button" class="cs-remove-btn" aria-label={`Remove ${listing.name}`} hidden>&times;</button>
                </td>
              </tr>
            );
          })}
        </>
      ))}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="cs-subtotal-label">Subtotal</td>
        <td class="cs-subtotal-value">$0.00</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  {minCartSize != null && (
    <p class="cs-min-cart-notice">Minimum order: ${minCartSize.toFixed(2)}</p>
  )}

  <div class="cs-order-errors" hidden></div>

  <div class="cs-buyer-info">
    <label class="cs-field">
      <span>Name *</span>
      <input type="text" class="cs-buyer-name" required />
    </label>
    <label class="cs-field">
      <span>Email *</span>
      <input type="email" class="cs-buyer-email" required />
    </label>
    <label class="cs-field">
      <span>Notes</span>
      <textarea class="cs-buyer-notes" rows="3"></textarea>
    </label>
  </div>

  <div class="cs-order-actions">
    <button type="button" class="cs-submit-btn" disabled>Submit Order</button>
  </div>

  <div class="cs-mailto-section" hidden>
    <p>Your order has been downloaded.</p>
    <a class="cs-mailto-link" href="#">Email your order</a>
  </div>

  <div class="cs-lightbox" hidden>
    <div class="cs-lightbox-backdrop"></div>
    <img class="cs-lightbox-img" src="" alt="" />
  </div>
</div>

<script>
  import './order-sheet.ts';
</script>
```

### OrderSheet.css

See Task 6 Step 2 above for the full stylesheet.

### order-sheet.ts

```typescript
import {
  validateQuantity,
  snapToMoq,
  calculateLineTotal,
  calculateSubtotal,
  validateOrder,
} from '../../lib/order-sheet/validation.js';
import type { OrderSheetItem } from '../../lib/order-sheet/types.js';
import { formatPrice } from '../../lib/storefront/pricing.js';

const root = document.querySelector('.cs-order-sheet') as HTMLElement;
if (root) init(root);

function init(root: HTMLElement) {
  const currency = root.dataset.currency ?? 'usd';
  const minCartSizeRaw = root.dataset.minCartSizeRaw ? Number(root.dataset.minCartSizeRaw) : null;
  const contact = root.dataset.contact ?? '';
  const storeName = root.dataset.storeName ?? '';

  const rows = root.querySelectorAll<HTMLElement>('.cs-order-row');
  const subtotalEl = root.querySelector('.cs-subtotal-value') as HTMLElement;
  const submitBtn = root.querySelector('.cs-submit-btn') as HTMLButtonElement;
  const errorsEl = root.querySelector('.cs-order-errors') as HTMLElement;
  const mailtoSection = root.querySelector('.cs-mailto-section') as HTMLElement;
  const mailtoLink = root.querySelector('.cs-mailto-link') as HTMLAnchorElement;
  const nameInput = root.querySelector('.cs-buyer-name') as HTMLInputElement;
  const emailInput = root.querySelector('.cs-buyer-email') as HTMLInputElement;
  const lightbox = root.querySelector('.cs-lightbox') as HTMLElement;
  const lightboxImg = root.querySelector('.cs-lightbox-img') as HTMLImageElement;
  const lightboxBackdrop = root.querySelector('.cs-lightbox-backdrop') as HTMLElement;

  // --- Quantity controls ---
  rows.forEach((row) => {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const downBtn = row.querySelector('.cs-qty-down') as HTMLButtonElement;
    const upBtn = row.querySelector('.cs-qty-up') as HTMLButtonElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;

    downBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      input.value = String(snapToMoq(current, moq, 'down'));
      updateRow(row, currency);
      updateTotals();
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      input.value = String(snapToMoq(current, moq, 'up'));
      updateRow(row, currency);
      updateTotals();
    });

    input.addEventListener('change', () => {
      const val = parseInt(input.value) || 0;
      input.value = String(Math.max(0, val));
      updateRow(row, currency);
      updateTotals();
    });

    removeBtn.addEventListener('click', () => {
      input.value = '0';
      updateRow(row, currency);
      updateTotals();
    });
  });

  // --- Lightbox ---
  root.querySelectorAll<HTMLButtonElement>('.cs-thumb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightboxImg.src = btn.dataset.fullSrc ?? '';
      lightboxImg.alt = btn.dataset.alt ?? '';
      lightbox.hidden = false;
    });
  });

  lightboxBackdrop.addEventListener('click', () => { lightbox.hidden = true; });
  lightboxImg.addEventListener('click', (e) => { e.stopPropagation(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) lightbox.hidden = true;
  });

  // --- Validation on input ---
  nameInput.addEventListener('input', updateTotals);
  emailInput.addEventListener('input', updateTotals);

  function updateRow(row: HTMLElement, currency: string) {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const rawPrice = Number(row.dataset.rawPrice);
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const qty = parseInt(input.value) || 0;

    lineTotalEl.textContent = formatPrice(calculateLineTotal(rawPrice, qty), currency);
    removeBtn.hidden = qty === 0;

    const isValid = validateQuantity(qty, moq);
    input.classList.toggle('cs-invalid', !isValid);
  }

  function getItems(): OrderSheetItem[] {
    return Array.from(rows).map((row) => {
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

  function updateTotals() {
    const items = getItems();
    const subtotal = calculateSubtotal(items);
    subtotalEl.textContent = formatPrice(subtotal, currency);

    const result = validateOrder(items, minCartSizeRaw, nameInput.value, emailInput.value);

    if (result.errors.length > 0) {
      errorsEl.replaceChildren();
      const ul = document.createElement('ul');
      for (const e of result.errors) {
        const li = document.createElement('li');
        li.textContent = e.message;
        ul.appendChild(li);
      }
      errorsEl.appendChild(ul);
      errorsEl.hidden = false;
    } else {
      errorsEl.replaceChildren();
      errorsEl.hidden = true;
    }

    submitBtn.disabled = !result.valid;
  }

  // --- Submit: PDF generation + mailto ---
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating PDF...';

    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const pdfContent = root.cloneNode(true) as HTMLElement;

      // Remove elements not needed in PDF
      pdfContent.querySelectorAll(
        '.cs-order-actions, .cs-mailto-section, .cs-lightbox, .cs-order-errors, .cs-col-image, .cs-col-remove, .cs-qty-btn, .cs-remove-btn, .cs-min-cart-notice'
      ).forEach((el) => el.remove());

      // Remove zero-quantity rows
      pdfContent.querySelectorAll('.cs-order-row').forEach((row) => {
        const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
        if (parseInt(input.value) === 0) row.remove();
      });

      // Replace inputs with plain text spans
      pdfContent.querySelectorAll('.cs-qty-input').forEach((input) => {
        const val = (input as HTMLInputElement).value;
        const span = document.createElement('span');
        span.textContent = val;
        span.style.textAlign = 'right';
        input.replaceWith(span);
      });

      pdfContent.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
        const span = document.createElement('span');
        span.textContent = el.value;
        el.replaceWith(span);
      });

      // Remove empty category rows
      pdfContent.querySelectorAll('.cs-category-row').forEach((catRow) => {
        const next = catRow.nextElementSibling;
        if (!next || next.classList.contains('cs-category-row') || next.tagName === 'TFOOT') {
          catRow.remove();
        }
      });

      const date = new Date().toISOString().slice(0, 10);
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `order-${slug}-${date}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pdfContent)
        .save();

      // Show mailto link
      const buyerName = nameInput.value.trim();
      const buyerEmail = emailInput.value.trim();
      const subject = encodeURIComponent(`Order from ${buyerName} - ${storeName}`);
      const body = encodeURIComponent(
        `Hi,\n\nPlease find my order attached.\n\nName: ${buyerName}\nEmail: ${buyerEmail}\n\nThank you`
      );
      mailtoLink.href = `mailto:${contact}?subject=${subject}&body=${body}`;
      mailtoLink.textContent = `Email your order to ${contact}`;
      mailtoSection.hidden = false;

      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    } catch (err) {
      console.error('[OrderSheet] PDF generation failed:', err);
      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    }
  });
}
```
