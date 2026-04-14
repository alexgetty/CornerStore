# Product Catalog Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Stripe-as-source-of-truth with a CSV-based product catalog. The site build reads only local files. Stripe sync is a separate CLI tool.

**Architecture:** `catalog.csv` is the single source of truth. Two independent consumers: (1) the Astro site build reads CSV + images + MD overrides to generate the static storefront, zero Stripe API calls; (2) a standalone sync CLI reads CSV, reconciles Stripe, and writes Payment Link URLs back to the CSV. The CSV is the shared interface between build and sync.

**Tech Stack:** Astro 5, csv-parse, csv-stringify, Stripe SDK, gray-matter, Vitest

**Spec:** `docs/todo/product-catalog-sync.md`

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/lib/catalog/types.ts` | CatalogProduct, CatalogValidationError, ProductOverride |
| `src/lib/catalog/csv.ts` | Parse + validate `catalog.csv` |
| `src/lib/catalog/images.ts` | Resolve product images from `product-images/` |
| `src/lib/catalog/overrides.ts` | Load MD overrides from `products/` |
| `src/lib/catalog/csv-writer.ts` | Write Payment Link URLs back to CSV |
| `src/lib/catalog/index.ts` | Barrel exports |
| `src/lib/stripe/sync.ts` | readStripeState, catalogDiff, catalogAdd, catalogUpdate, catalogSync |
| `bin/catalog.mjs` | CLI entry point for sync commands |
| `tests/unit/catalog/csv.test.ts` | CSV parsing + validation tests |
| `tests/unit/catalog/images.test.ts` | Image resolution tests |
| `tests/unit/catalog/overrides.test.ts` | MD override tests |
| `tests/unit/catalog/csv-writer.test.ts` | CSV write-back tests |
| `tests/unit/catalog/helpers.ts` | Factory functions for catalog tests |
| `tests/unit/stripe/sync.test.ts` | Stripe sync tests |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/storefront/types.ts` | Replace SingleListing/BundleListing with flat Listing |
| `src/lib/storefront/pricing.ts` | Add `decimalToRawPrice()` |
| `src/lib/storefront/get-listings.ts` | Complete rewrite: catalog-based, zero Stripe calls |
| `src/lib/storefront/index.ts` | Update exports |
| `src/components/Listing/Listing.astro` | Handle status, nullable paymentLink, SKU lookup |
| `src/components/Listing/Listing.css` | Add `.cs-listing-status` |
| `package.json` | Add csv-parse, csv-stringify, catalog scripts |
| `vitest.config.ts` | Exclude new type/index files from coverage |
| `tests/unit/storefront/pricing.test.ts` | Add decimalToRawPrice tests |
| `docs/principles.md` | Remove Stripe-as-source-of-truth language |

### Removed Files
| File | Reason |
|------|--------|
| `src/lib/storefront/listing-configs.ts` | Replaced by catalog/csv.ts + catalog/overrides.ts |
| `src/lib/storefront/listing-builders.ts` | Replaced by inline builder in get-listings.ts |
| `src/lib/storefront/name-collisions.ts` | SKU-based system has no name collisions |
| `src/lib/storefront/stripe-adapter.ts` | Build no longer reads from Stripe |
| `tests/unit/storefront/listing-configs.test.ts` | Module removed |
| `tests/unit/storefront/listing-builders.test.ts` | Module removed |
| `tests/unit/storefront/name-collisions.test.ts` | Module removed |
| `tests/unit/storefront/stripe-adapter.test.ts` | Module removed |

---

## Part 1: Catalog Module

### Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install csv-parse and csv-stringify**

```bash
npm install csv-parse csv-stringify
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('csv-parse/sync'); require('csv-stringify/sync'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add csv-parse and csv-stringify dependencies"
```

---

### Task 2: Catalog Types + CSV Parsing with Validation

**Files:**
- Create: `src/lib/catalog/types.ts`
- Create: `src/lib/catalog/csv.ts`
- Create: `src/lib/catalog/index.ts`
- Create: `tests/unit/catalog/helpers.ts`
- Create: `tests/unit/catalog/csv.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create catalog types**

```typescript
// src/lib/catalog/types.ts

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
}

export interface CatalogValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ProductOverride {
  sku: string;
  description: string | null;
  imageAlt: string | null;
}
```

- [ ] **Step 2: Create test helpers**

```typescript
// tests/unit/catalog/helpers.ts

import type { CatalogProduct } from '../../../src/lib/catalog/types.js';

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
    ...overrides,
  };
}

export function makeCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const val = row[h] ?? '';
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')),
  ];
  return lines.join('\n');
}

export function makeCSVRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SKU: 'TEST-001',
    Name: 'Test Product',
    Price: '19.99',
    ...overrides,
  };
}
```

- [ ] **Step 3: Write failing tests for validateRows**

```typescript
// tests/unit/catalog/csv.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCSV, makeCSVRow } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('validateRows', () => {
  let validateRows: typeof import('../../../src/lib/catalog/csv.js').validateRows;

  beforeEach(async () => {
    vi.resetModules();
    ({ validateRows } = await import('../../../src/lib/catalog/csv.js'));
  });

  it('accepts a valid row with required fields only', () => {
    const records = [{ SKU: 'ABC-001', Name: 'Widget', Price: '9.99' }];
    const { products, errors } = validateRows(records);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).toEqual({
      sku: 'ABC-001',
      name: 'Widget',
      price: 9.99,
      category: null,
      status: null,
      storefront: true,
      orderSheet: true,
      description: null,
      paymentLink: null,
    });
  });

  it('accepts a valid row with all fields', () => {
    const records = [{
      SKU: 'ABC-001',
      Name: 'Widget',
      Price: '19.99',
      Category: 'Tools',
      Status: 'Coming Soon',
      Storefront: 'yes',
      'Order Sheet': 'no',
      Description: 'A fine widget',
      'Payment Link': 'https://buy.stripe.com/test_abc',
    }];
    const { products, errors } = validateRows(records);
    expect(errors).toEqual([]);
    expect(products[0]).toEqual({
      sku: 'ABC-001',
      name: 'Widget',
      price: 19.99,
      category: 'Tools',
      status: 'Coming Soon',
      storefront: true,
      orderSheet: false,
      description: 'A fine widget',
      paymentLink: 'https://buy.stripe.com/test_abc',
    });
  });

  it('defaults Storefront to true when blank', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '1', Storefront: '' }];
    const { products } = validateRows(records);
    expect(products[0]!.storefront).toBe(true);
  });

  it('sets Storefront to false when "no"', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '1', Storefront: 'no' }];
    const { products } = validateRows(records);
    expect(products[0]!.storefront).toBe(false);
  });

  it('defaults Order Sheet to true when blank', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '1', 'Order Sheet': '' }];
    const { products } = validateRows(records);
    expect(products[0]!.orderSheet).toBe(true);
  });

  it('ignores extra columns', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '1', CustomField: 'whatever' }];
    const { products, errors } = validateRows(records);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).not.toHaveProperty('CustomField');
  });

  it('errors when SKU is missing', () => {
    const records = [{ SKU: '', Name: 'B', Price: '1' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'SKU', message: 'required' });
  });

  it('errors when SKU has invalid characters', () => {
    const records = [{ SKU: 'bad sku!', Name: 'B', Price: '1' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({
      row: 2,
      field: 'SKU',
      message: 'must contain only alphanumeric characters, hyphens, and underscores',
    });
  });

  it('errors on duplicate SKUs', () => {
    const records = [
      { SKU: 'DUP', Name: 'First', Price: '1' },
      { SKU: 'DUP', Name: 'Second', Price: '2' },
    ];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 3, field: 'SKU', message: 'duplicate SKU "DUP"' });
  });

  it('errors when Name is missing', () => {
    const records = [{ SKU: 'A', Name: '', Price: '1' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Name', message: 'required' });
  });

  it('errors when Name exceeds 250 characters', () => {
    const records = [{ SKU: 'A', Name: 'x'.repeat(251), Price: '1' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Name', message: 'exceeds 250 characters' });
  });

  it('errors when Price is missing', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Price', message: 'required' });
  });

  it('errors when Price is not a number', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: 'free' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Price', message: 'must be a positive number' });
  });

  it('errors when Price is zero', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '0' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Price', message: 'must be a positive number' });
  });

  it('errors when Price is negative', () => {
    const records = [{ SKU: 'A', Name: 'B', Price: '-5' }];
    const { errors } = validateRows(records);
    expect(errors).toContainEqual({ row: 2, field: 'Price', message: 'must be a positive number' });
  });

  it('returns no products when there are errors', () => {
    const records = [{ SKU: '', Name: '', Price: '' }];
    const { products, errors } = validateRows(records);
    expect(errors.length).toBeGreaterThan(0);
    expect(products).toEqual([]);
  });

  it('collects errors from multiple rows', () => {
    const records = [
      { SKU: '', Name: 'A', Price: '1' },
      { SKU: 'B', Name: '', Price: '2' },
    ];
    const { errors } = validateRows(records);
    expect(errors).toHaveLength(2);
    expect(errors[0]!.row).toBe(2);
    expect(errors[1]!.row).toBe(3);
  });
});

describe('loadCatalog', () => {
  let loadCatalog: typeof import('../../../src/lib/catalog/csv.js').loadCatalog;
  let readFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs/promises');
    readFileMock = vi.mocked(fs.readFile);
    ({ loadCatalog } = await import('../../../src/lib/catalog/csv.js'));
  });

  it('parses a valid CSV file and returns products', async () => {
    const csv = makeCSV([makeCSVRow()]);
    readFileMock.mockResolvedValue(csv);

    const products = await loadCatalog('/test/catalog.csv');
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('TEST-001');
  });

  it('throws on validation errors with row details', async () => {
    const csv = makeCSV([makeCSVRow({ SKU: '' })]);
    readFileMock.mockResolvedValue(csv);

    await expect(loadCatalog('/test/catalog.csv')).rejects.toThrow('[Catalog] Validation failed');
  });

  it('throws when file does not exist', async () => {
    readFileMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    await expect(loadCatalog('/test/catalog.csv')).rejects.toThrow();
  });

  it('handles CSV with quoted fields containing commas', async () => {
    const csv = 'SKU,Name,Price,Description\nA,Widget,1,"Has a comma, here"';
    readFileMock.mockResolvedValue(csv);

    const products = await loadCatalog('/test/catalog.csv');
    expect(products[0]!.description).toBe('Has a comma, here');
  });

  it('returns empty array for CSV with header only', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\n');

    const products = await loadCatalog('/test/catalog.csv');
    expect(products).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/unit/catalog/csv.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 5: Implement csv.ts**

```typescript
// src/lib/catalog/csv.ts

import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogProduct, CatalogValidationError } from './types.js';

export const CATALOG_PATH = join(process.cwd(), 'catalog.csv');

const SKU_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_NAME_LENGTH = 250;

export function validateRows(
  records: Record<string, string>[],
): { products: CatalogProduct[]; errors: CatalogValidationError[] } {
  const errors: CatalogValidationError[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2; // 1-indexed + header row

    const sku = (row['SKU'] ?? '').trim();
    const name = (row['Name'] ?? '').trim();
    const priceStr = (row['Price'] ?? '').trim();

    if (!sku) {
      errors.push({ row: rowNum, field: 'SKU', message: 'required' });
    } else if (!SKU_PATTERN.test(sku)) {
      errors.push({ row: rowNum, field: 'SKU', message: 'must contain only alphanumeric characters, hyphens, and underscores' });
    } else if (seenSkus.has(sku)) {
      errors.push({ row: rowNum, field: 'SKU', message: `duplicate SKU "${sku}"` });
    }
    if (sku) seenSkus.add(sku);

    if (!name) {
      errors.push({ row: rowNum, field: 'Name', message: 'required' });
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.push({ row: rowNum, field: 'Name', message: `exceeds ${MAX_NAME_LENGTH} characters` });
    }

    if (!priceStr) {
      errors.push({ row: rowNum, field: 'Price', message: 'required' });
    } else {
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) {
        errors.push({ row: rowNum, field: 'Price', message: 'must be a positive number' });
      }
    }
  }

  if (errors.length > 0) return { products: [], errors };

  const products: CatalogProduct[] = records.map((row) => {
    const storefrontVal = (row['Storefront'] ?? '').trim().toLowerCase();
    const orderSheetVal = (row['Order Sheet'] ?? '').trim().toLowerCase();
    return {
      sku: row['SKU']!.trim(),
      name: row['Name']!.trim(),
      price: parseFloat(row['Price']!.trim()),
      category: row['Category']?.trim() || null,
      status: row['Status']?.trim() || null,
      storefront: storefrontVal !== 'no',
      orderSheet: orderSheetVal !== 'no',
      description: row['Description']?.trim() || null,
      paymentLink: row['Payment Link']?.trim() || null,
    };
  });

  return { products, errors };
}

export async function loadCatalog(path?: string): Promise<CatalogProduct[]> {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  const { products, errors } = validateRows(records);

  if (errors.length > 0) {
    const lines = errors.map(
      (e) => `  Row ${e.row}, ${e.field}: ${e.message}`
    ).join('\n');
    throw new Error(`[Catalog] Validation failed:\n${lines}`);
  }

  return products;
}
```

- [ ] **Step 6: Create barrel export**

```typescript
// src/lib/catalog/index.ts

export type { CatalogProduct, CatalogValidationError, ProductOverride } from './types.js';
export { loadCatalog, validateRows } from './csv.js';
```

- [ ] **Step 7: Update vitest.config.ts**

Add `src/lib/catalog/types.ts` and `src/lib/catalog/index.ts` to the coverage exclusion list:

```typescript
exclude: [
  'src/env.d.ts',
  'src/lib/storefront/types.ts',
  'src/components/index.ts',
  'src/lib/catalog/types.ts',
  'src/lib/catalog/index.ts',
],
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/unit/catalog/csv.test.ts
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/catalog/ tests/unit/catalog/ vitest.config.ts
git commit -m "Add catalog CSV parsing with validation"
```

---

### Task 3: Product Image Resolution

**Files:**
- Create: `src/lib/catalog/images.ts`
- Create: `tests/unit/catalog/images.test.ts`
- Modify: `src/lib/catalog/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/catalog/images.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe('parseImageFilename', () => {
  let parseImageFilename: typeof import('../../../src/lib/catalog/images.js').parseImageFilename;

  beforeEach(async () => {
    vi.resetModules();
    ({ parseImageFilename } = await import('../../../src/lib/catalog/images.js'));
  });

  it('parses a simple filename', () => {
    expect(parseImageFilename('WIDGET-1.jpg')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('parses a SKU with hyphens', () => {
    expect(parseImageFilename('cool-thing-2.png')).toEqual({ sku: 'cool-thing', order: 2 });
  });

  it('parses a SKU with underscores and hyphens', () => {
    expect(parseImageFilename('my_sku-name-3.webp')).toEqual({ sku: 'my_sku-name', order: 3 });
  });

  it('parses multi-digit order numbers', () => {
    expect(parseImageFilename('ABC-10.jpg')).toEqual({ sku: 'ABC', order: 10 });
  });

  it('returns null for non-image extensions', () => {
    expect(parseImageFilename('README.md')).toBeNull();
  });

  it('returns null for files with no hyphen', () => {
    expect(parseImageFilename('product.jpg')).toBeNull();
  });

  it('returns null when order segment is not numeric', () => {
    expect(parseImageFilename('product-abc.jpg')).toBeNull();
  });

  it('returns null when order is zero', () => {
    expect(parseImageFilename('product-0.jpg')).toBeNull();
  });

  it('returns null when order has leading zeros', () => {
    expect(parseImageFilename('product-01.jpg')).toBeNull();
  });

  it('returns null for empty SKU portion', () => {
    expect(parseImageFilename('-1.jpg')).toBeNull();
  });

  it('handles all supported image extensions', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']) {
      expect(parseImageFilename(`SKU-1.${ext}`)).toEqual({ sku: 'SKU', order: 1 });
    }
  });
});

describe('loadProductImages', () => {
  let loadProductImages: typeof import('../../../src/lib/catalog/images.js').loadProductImages;
  let readdirMock: ReturnType<typeof vi.fn>;
  let copyFileMock: ReturnType<typeof vi.fn>;
  let mkdirMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs/promises');
    readdirMock = vi.mocked(fs.readdir);
    copyFileMock = vi.mocked(fs.copyFile);
    mkdirMock = vi.mocked(fs.mkdir);
    mkdirMock.mockResolvedValue(undefined);
    copyFileMock.mockResolvedValue(undefined);
    ({ loadProductImages } = await import('../../../src/lib/catalog/images.js'));
  });

  it('returns empty map when directory does not exist', async () => {
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const result = await loadProductImages('/test/product-images');
    expect(result.size).toBe(0);
  });

  it('groups images by SKU sorted by order', async () => {
    readdirMock.mockResolvedValue(['WIDGET-2.jpg', 'WIDGET-1.jpg', 'OTHER-1.png']);

    const result = await loadProductImages('/test/product-images');
    expect(result.get('WIDGET')).toEqual([
      '/product-images/WIDGET-1.jpg',
      '/product-images/WIDGET-2.jpg',
    ]);
    expect(result.get('OTHER')).toEqual(['/product-images/OTHER-1.png']);
  });

  it('ignores non-image files', async () => {
    readdirMock.mockResolvedValue(['WIDGET-1.jpg', 'README.md', '.DS_Store']);
    const result = await loadProductImages('/test/product-images');
    expect(result.size).toBe(1);
  });

  it('ignores files that do not match naming convention', async () => {
    readdirMock.mockResolvedValue(['random-photo.jpg', 'WIDGET-1.jpg']);
    const result = await loadProductImages('/test/product-images');
    expect(result.size).toBe(1);
    expect(result.has('WIDGET')).toBe(true);
  });

  it('copies images to public directory', async () => {
    readdirMock.mockResolvedValue(['WIDGET-1.jpg']);
    await loadProductImages('/test/product-images');
    expect(mkdirMock).toHaveBeenCalled();
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('WIDGET-1.jpg'),
      expect.stringContaining('public'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/catalog/images.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement images.ts**

```typescript
// src/lib/catalog/images.ts

import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const PUBLIC_IMAGES_DIR = join(process.cwd(), 'public', 'product-images');

export function parseImageFilename(filename: string): { sku: string; order: number } | null {
  const ext = extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const name = filename.slice(0, -ext.length);
  const lastHyphen = name.lastIndexOf('-');
  if (lastHyphen <= 0) return null;

  const sku = name.slice(0, lastHyphen);
  const orderStr = name.slice(lastHyphen + 1);
  const order = parseInt(orderStr, 10);

  if (isNaN(order) || order < 1 || String(order) !== orderStr) return null;

  return { sku, order };
}

export async function loadProductImages(
  dir?: string,
): Promise<Map<string, string[]>> {
  const imagesDir = dir ?? join(process.cwd(), 'product-images');
  const imageMap = new Map<string, { order: number; webPath: string; filename: string }[]>();

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
    const parsed = parseImageFilename(filename);
    if (!parsed) continue;

    const entries = imageMap.get(parsed.sku) ?? [];
    entries.push({
      order: parsed.order,
      webPath: `/product-images/${filename}`,
      filename,
    });
    imageMap.set(parsed.sku, entries);
  }

  // Copy images to public directory
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

  // Build result: sorted web paths, first = primary/cover
  const result = new Map<string, string[]>();
  for (const [sku, entries] of imageMap) {
    entries.sort((a, b) => a.order - b.order);
    result.set(sku, entries.map((e) => e.webPath));
  }

  return result;
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/lib/catalog/index.ts`:

```typescript
export { loadProductImages, parseImageFilename } from './images.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/catalog/images.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/images.ts src/lib/catalog/index.ts tests/unit/catalog/images.test.ts
git commit -m "Add product image resolution from product-images/ directory"
```

---

### Task 4: MD Overrides

**Files:**
- Create: `src/lib/catalog/overrides.ts`
- Create: `tests/unit/catalog/overrides.test.ts`
- Modify: `src/lib/catalog/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/catalog/overrides.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCatalogProduct } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});

describe('loadProductOverrides', () => {
  let loadProductOverrides: typeof import('../../../src/lib/catalog/overrides.js').loadProductOverrides;
  let readdirMock: ReturnType<typeof vi.fn>;
  let readFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs/promises');
    readdirMock = vi.mocked(fs.readdir);
    readFileMock = vi.mocked(fs.readFile);
    ({ loadProductOverrides } = await import('../../../src/lib/catalog/overrides.js'));
  });

  it('returns empty map when directory does not exist', async () => {
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.size).toBe(0);
  });

  it('loads override with description from frontmatter', async () => {
    readdirMock.mockResolvedValue(['widget.md']);
    readFileMock.mockResolvedValue('---\nsku: TEST-001\ndescription: Rich description\n---\nBody content');

    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.get('TEST-001')).toEqual({
      sku: 'TEST-001',
      description: 'Rich description',
      imageAlt: null,
    });
  });

  it('loads override with image_alt from frontmatter', async () => {
    readdirMock.mockResolvedValue(['widget.md']);
    readFileMock.mockResolvedValue('---\nsku: TEST-001\nimage_alt: A fine widget on display\n---\n');

    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.get('TEST-001')!.imageAlt).toBe('A fine widget on display');
  });

  it('warns and skips override with no sku in frontmatter', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['no-sku.md']);
    readFileMock.mockResolvedValue('---\ntitle: No SKU\n---\n');

    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing required "sku"'),
    );
    consoleSpy.mockRestore();
  });

  it('warns when override references a SKU not in catalog', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['ghost.md']);
    readFileMock.mockResolvedValue('---\nsku: GHOST\n---\n');

    const result = await loadProductOverrides([makeCatalogProduct({ sku: 'OTHER' })]);
    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('no matching product in catalog'),
    );
    consoleSpy.mockRestore();
  });

  it('ignores non-markdown files', async () => {
    readdirMock.mockResolvedValue(['notes.txt', 'widget.md']);
    readFileMock.mockResolvedValue('---\nsku: TEST-001\n---\n');

    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.size).toBe(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it('handles override with no optional fields', async () => {
    readdirMock.mockResolvedValue(['widget.md']);
    readFileMock.mockResolvedValue('---\nsku: TEST-001\n---\n');

    const result = await loadProductOverrides([makeCatalogProduct()]);
    expect(result.get('TEST-001')).toEqual({
      sku: 'TEST-001',
      description: null,
      imageAlt: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/catalog/overrides.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement overrides.ts**

```typescript
// src/lib/catalog/overrides.ts

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { CatalogProduct, ProductOverride } from './types.js';

const PRODUCTS_DIR = join(process.cwd(), 'products');

export async function loadProductOverrides(
  catalog: CatalogProduct[],
  dir?: string,
): Promise<Map<string, ProductOverride>> {
  const overridesDir = dir ?? PRODUCTS_DIR;
  const overrides = new Map<string, ProductOverride>();
  const catalogSkus = new Set(catalog.map((p) => p.sku));

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
    let content: string;
    try {
      content = await readFile(join(overridesDir, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Catalog] Warning: products/${file}: failed to read — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = matter(content));
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

    overrides.set(sku, {
      sku,
      description: typeof data.description === 'string' && data.description ? data.description : null,
      imageAlt: typeof data.image_alt === 'string' && data.image_alt ? data.image_alt : null,
    });
  }

  return overrides;
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/lib/catalog/index.ts`:

```typescript
export { loadProductOverrides } from './overrides.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/catalog/overrides.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/overrides.ts src/lib/catalog/index.ts tests/unit/catalog/overrides.test.ts
git commit -m "Add MD override loading from products/ directory"
```

---

## Part 2: Storefront Integration

### Task 5: Updated Listing Type + Price Utilities

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Modify: `src/lib/storefront/pricing.ts`
- Modify: `tests/unit/storefront/pricing.test.ts`

- [ ] **Step 1: Replace Listing types in types.ts**

Replace the entire contents of `src/lib/storefront/types.ts` with:

```typescript
// src/lib/storefront/types.ts

export interface Listing {
  sku: string;
  name: string;
  description: string | null;
  image: string | null;
  imageAlt: string;
  price: string;
  rawPrice: number;
  currency: string;
  category: string | null;
  status: string | null;
  paymentLink: string | null;
}

export interface NavItem {
  label: string;
  page: string;
  path?: string;
}

export interface ResolvedNavItem {
  label: string;
  href: string;
}

export interface StoreConfig {
  name: string;
  home: string;
  nav: NavItem[];
  footerNav: NavItem[];
  contact?: string;
}

export interface PageData {
  slug: string;
  title: string;
  hasExplicitTitle: boolean;
  description: string | undefined;
}
```

Removed: `SingleListing`, `BundleListing`, `StripeProductData`, `ListingConfig`, `LinkWarning`, `PaymentLink`, `PendingBundle`.

- [ ] **Step 2: Write failing test for decimalToRawPrice**

Add to `tests/unit/storefront/pricing.test.ts`:

```typescript
describe('decimalToRawPrice', () => {
  it('converts dollars to cents for USD', () => {
    expect(decimalToRawPrice(19.99, 'usd')).toBe(1999);
  });

  it('converts whole dollar amount', () => {
    expect(decimalToRawPrice(5, 'usd')).toBe(500);
  });

  it('handles zero-decimal currencies like JPY', () => {
    expect(decimalToRawPrice(1000, 'jpy')).toBe(1000);
  });

  it('rounds to avoid floating point issues', () => {
    expect(decimalToRawPrice(19.999, 'usd')).toBe(2000);
  });
});
```

Update the imports at the top of the test file to include `decimalToRawPrice`:

```typescript
import { formatPrice, rawPriceToDecimal, listingHasPrice, decimalToRawPrice } from '../../../src/lib/storefront/pricing.js';
```

- [ ] **Step 3: Run tests to verify the new test fails**

```bash
npx vitest run tests/unit/storefront/pricing.test.ts
```

Expected: `decimalToRawPrice` tests FAIL (function not found)

- [ ] **Step 4: Implement decimalToRawPrice**

Add to `src/lib/storefront/pricing.ts`:

```typescript
export function decimalToRawPrice(decimalPrice: number, currency: string): number {
  const decimals = getCurrencyDecimalPlaces(currency);
  return Math.round(decimalPrice * (10 ** decimals));
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/storefront/pricing.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/storefront/types.ts src/lib/storefront/pricing.ts tests/unit/storefront/pricing.test.ts
git commit -m "Update Listing type to flat SKU-based model, add decimalToRawPrice"
```

---

### Task 6: Rewrite getListings()

**Files:**
- Rewrite: `src/lib/storefront/get-listings.ts`
- Rewrite: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the contents of `tests/unit/storefront/get-listings.test.ts`:

```typescript
// tests/unit/storefront/get-listings.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from '../catalog/helpers.js';

vi.mock('../../../src/lib/catalog/csv.js', () => ({
  loadCatalog: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/images.js', () => ({
  loadProductImages: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/overrides.js', () => ({
  loadProductOverrides: vi.fn(),
}));

describe('getListings', () => {
  let getListings: typeof import('../../../src/lib/storefront/get-listings.js').getListings;
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
    ({ getListings } = await import('../../../src/lib/storefront/get-listings.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('builds listings from catalog products', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);

    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('TEST-001');
    expect(listings[0]!.name).toBe('Test Product');
    expect(listings[0]!.rawPrice).toBe(1999);
    expect(listings[0]!.currency).toBe('usd');
  });

  it('filters to storefront products only', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'SHOW', storefront: true }),
      makeCatalogProduct({ sku: 'HIDE', storefront: false }),
    ]);

    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('SHOW');
  });

  it('applies primary image from image map', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', ['/product-images/TEST-001-1.jpg', '/product-images/TEST-001-2.jpg']]])
    );

    const listings = await getListings();
    expect(listings[0]!.image).toBe('/product-images/TEST-001-1.jpg');
  });

  it('uses null image when no images exist for SKU', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(new Map());

    const listings = await getListings();
    expect(listings[0]!.image).toBeNull();
  });

  it('applies override description when present', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ description: 'CSV desc' }),
    ]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: 'Rich desc', imageAlt: null }]])
    );

    const listings = await getListings();
    expect(listings[0]!.description).toBe('Rich desc');
  });

  it('falls back to CSV description when no override', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ description: 'CSV desc' }),
    ]);

    const listings = await getListings();
    expect(listings[0]!.description).toBe('CSV desc');
  });

  it('applies override imageAlt when present', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: null, imageAlt: 'Custom alt' }]])
    );

    const listings = await getListings();
    expect(listings[0]!.imageAlt).toBe('Custom alt');
  });

  it('defaults imageAlt to product name when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ name: 'Widget' })]);

    const listings = await getListings();
    expect(listings[0]!.imageAlt).toBe('Widget');
  });

  it('passes through status from CSV', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ status: 'Coming Soon' }),
    ]);

    const listings = await getListings();
    expect(listings[0]!.status).toBe('Coming Soon');
  });

  it('passes through paymentLink from CSV', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ paymentLink: 'https://buy.stripe.com/test' }),
    ]);

    const listings = await getListings();
    expect(listings[0]!.paymentLink).toBe('https://buy.stripe.com/test');
  });

  it('warns about products with no images', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ sku: 'NO-IMG' })]);

    await getListings();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NO-IMG has no images'),
    );
    consoleSpy.mockRestore();
  });

  it('returns empty array when catalog has no storefront products', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ storefront: false }),
    ]);

    const listings = await getListings();
    expect(listings).toEqual([]);
  });

  it('propagates catalog validation errors', async () => {
    loadCatalogMock.mockRejectedValue(new Error('[Catalog] Validation failed'));

    await expect(getListings()).rejects.toThrow('[Catalog] Validation failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/storefront/get-listings.test.ts
```

Expected: FAIL

- [ ] **Step 3: Rewrite get-listings.ts**

Replace the contents of `src/lib/storefront/get-listings.ts`:

```typescript
// src/lib/storefront/get-listings.ts

import type { Listing } from './types.js';
import { formatPrice, decimalToRawPrice } from './pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import { loadProductImages } from '../catalog/images.js';
import { loadProductOverrides } from '../catalog/overrides.js';

const CURRENCY = 'usd';

export async function getListings(): Promise<Listing[]> {
  const catalog = await loadCatalog();
  const images = await loadProductImages();
  const overrides = await loadProductOverrides(catalog);

  const storefrontProducts = catalog.filter((p) => p.storefront);

  const listings: Listing[] = storefrontProducts.map((product) => {
    const productImages = images.get(product.sku);
    const primaryImage = productImages?.[0] ?? null;
    const override = overrides.get(product.sku);

    const rawPrice = decimalToRawPrice(product.price, CURRENCY);

    return {
      sku: product.sku,
      name: product.name,
      description: override?.description ?? product.description,
      image: primaryImage,
      imageAlt: override?.imageAlt ?? product.name,
      price: formatPrice(rawPrice, CURRENCY),
      rawPrice,
      currency: CURRENCY,
      category: product.category,
      status: product.status,
      paymentLink: product.paymentLink,
    };
  });

  // Warnings
  for (const product of storefrontProducts) {
    if (!images.has(product.sku)) {
      console.log(`[Catalog] Warning: ${product.sku} has no images in product-images/`);
    }
  }

  if (listings.length > 0) {
    console.log(`[Catalog] Build complete: ${listings.length} storefront product${listings.length === 1 ? '' : 's'}`);
  }

  return listings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/storefront/get-listings.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/storefront/get-listings.ts tests/unit/storefront/get-listings.test.ts
git commit -m "Rewrite getListings to build from CSV catalog, zero Stripe calls"
```

---

### Task 7: Update Listing Component

**Files:**
- Modify: `src/components/Listing/Listing.astro`
- Modify: `src/components/Listing/Listing.css`

This is an Astro component (not unit-testable in the current test setup). Changes are verified by visual inspection during `npm run dev` and by the build succeeding.

- [ ] **Step 1: Update Listing.astro**

Replace the contents of `src/components/Listing/Listing.astro`:

```astro
---
import "./Listing.css";
import type { Listing } from "../../lib/storefront";
import { rawPriceToDecimal, getListings } from "../../lib/storefront";

interface Props {
  listing?: Listing;
  product?: string;
}

const { listing: listingProp, product } = Astro.props;

let listing: Listing | undefined = listingProp;

if (!listing && product) {
  const allListings = await getListings();
  const needle = product.toLowerCase();
  listing = allListings.find((l) => {
    const slugified = l.name.toLowerCase().replace(/\s+/g, '-');
    return l.sku.toLowerCase() === needle
      || slugified === needle
      || l.name.toLowerCase() === needle;
  });
}

let currencySymbol = '';
let decimalValue = '';
let currencyCode = '';
let formattedPrice = '';

if (listing) {
  currencyCode = listing.currency.toUpperCase();
  const decimal = rawPriceToDecimal(listing.rawPrice, listing.currency);
  decimalValue = decimal.toFixed(2);
  formattedPrice = listing.price;
  currencySymbol = formattedPrice.replace(/[\d.,\s]/g, '');
}
---

{listing ? (
  <article class="cs-listing" itemscope itemtype="https://schema.org/Product">
    <h2 class="cs-listing-name" itemprop="name">{listing.name}</h2>
    {listing.image ? (
      <div class="cs-image-frame">
        <img src={listing.image} alt={listing.imageAlt} itemprop="image" />
      </div>
    ) : (
      <div class="cs-image-placeholder" aria-hidden="true"></div>
    )}
    {listing.description && <p class="cs-listing-description" itemprop="description">{listing.description}</p>}
    <div class="cs-listing-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <span itemprop="priceCurrency" {...{ content: currencyCode }}>{currencySymbol}</span><data value={decimalValue} itemprop="price">{decimalValue}</data>
    </div>
    {listing.status ? (
      <span class="cs-listing-status">{listing.status}</span>
    ) : listing.paymentLink ? (
      <a href={listing.paymentLink} class="cs-listing-buy" aria-label={`Buy ${listing.name} — ${formattedPrice}`} itemprop="url">Buy</a>
    ) : null}
  </article>
) : null}
```

Key changes:
- SKU lookup added (alongside name matching)
- Price always rendered (no `listingHasPrice` check)
- Three-way buy/status/nothing rendering
- `listingHasPrice` import removed

- [ ] **Step 2: Add status styling to Listing.css**

Add before the closing `}` of the `@layer package` block in `src/components/Listing/Listing.css`:

```css
  .cs-listing-status {
    display: inline-block;
    margin-top: 0.75rem;
    margin-left: var(--cs-listing-padding);
    margin-right: var(--cs-listing-padding);
    padding-top: var(--cs-button-padding-vertical);
    padding-bottom: var(--cs-button-padding-vertical);
    padding-left: var(--cs-button-padding-horizontal);
    padding-right: var(--cs-button-padding-horizontal);
    border-width: 1px;
    border-style: solid;
    border-color: var(--cs-border-color);
    border-radius: var(--cs-button-border-radius);
    font-size: var(--cs-font-size-small);
    font-weight: 500;
    text-align: center;
    color: var(--cs-body-text-color);
  }
```

- [ ] **Step 3: Verify build succeeds**

```bash
npm run typecheck
```

Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Listing/Listing.astro src/components/Listing/Listing.css
git commit -m "Update Listing component for status display and SKU lookup"
```

---

## Part 3: Stripe Sync

### Task 8: Stripe State Reader

**Files:**
- Create: `src/lib/stripe/sync.ts`
- Create: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/stripe/sync.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAsyncIterable } from '../storefront/helpers.js';

vi.mock('stripe', () => {
  const MockStripe = vi.fn();
  return { default: MockStripe };
});

describe('readStripeState', () => {
  let readStripeState: typeof import('../../../src/lib/stripe/sync.js').readStripeState;
  let productsListMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsListMock = vi.fn();
    Stripe.mockImplementation(() => ({
      products: { list: productsListMock },
    }) as unknown as InstanceType<typeof Stripe>);
    ({ readStripeState } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('returns empty map when no products have sku metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{ id: 'prod_1', name: 'No SKU', metadata: {}, default_price: null }])
    );

    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('maps products by SKU from metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: 'A widget',
        metadata: { sku: 'WIDGET-001', payment_link_id: 'plink_1', payment_link_url: 'https://buy.stripe.com/test' },
        default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
      }])
    );

    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(1);
    expect(state.get('WIDGET-001')).toEqual({
      productId: 'prod_1',
      name: 'Widget',
      description: 'A widget',
      priceId: 'price_1',
      unitAmount: 1999,
      currency: 'usd',
      paymentLinkId: 'plink_1',
      paymentLinkUrl: 'https://buy.stripe.com/test',
    });
  });

  it('skips products without a default price', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: null,
        metadata: { sku: 'W' },
        default_price: null,
      }])
    );

    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('handles missing payment link metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: null,
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: 500, currency: 'usd' },
      }])
    );

    const state = await readStripeState(stripe as any);
    const entry = state.get('W')!;
    expect(entry.paymentLinkId).toBeNull();
    expect(entry.paymentLinkUrl).toBeNull();
  });

  it('returns empty map when Stripe has no active products', async () => {
    productsListMock.mockReturnValue(makeAsyncIterable([]));

    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement readStripeState**

```typescript
// src/lib/stripe/sync.ts

import type Stripe from 'stripe';

export interface StripeProductState {
  productId: string;
  name: string;
  description: string | null;
  priceId: string;
  unitAmount: number;
  currency: string;
  paymentLinkId: string | null;
  paymentLinkUrl: string | null;
}

export type StripeState = Map<string, StripeProductState>;

export async function readStripeState(stripe: Stripe): Promise<StripeState> {
  const state: StripeState = new Map();

  for await (const product of stripe.products.list({ active: true, expand: ['data.default_price'] })) {
    const sku = product.metadata?.sku;
    if (!sku) continue;

    const defaultPrice = product.default_price as Stripe.Price | null;
    if (!defaultPrice || typeof defaultPrice === 'string') continue;

    state.set(sku, {
      productId: product.id,
      name: product.name,
      description: product.description ?? null,
      priceId: defaultPrice.id,
      unitAmount: defaultPrice.unit_amount ?? 0,
      currency: defaultPrice.currency,
      paymentLinkId: product.metadata?.payment_link_id ?? null,
      paymentLinkUrl: product.metadata?.payment_link_url ?? null,
    });
  }

  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe/sync.ts tests/unit/stripe/sync.test.ts
git commit -m "Add Stripe state reader for catalog sync"
```

---

### Task 9: CSV Write-back Utility

**Files:**
- Create: `src/lib/catalog/csv-writer.ts`
- Create: `tests/unit/catalog/csv-writer.test.ts`
- Modify: `src/lib/catalog/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/catalog/csv-writer.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('updateCatalogPaymentLinks', () => {
  let updateCatalogPaymentLinks: typeof import('../../../src/lib/catalog/csv-writer.js').updateCatalogPaymentLinks;
  let readFileMock: ReturnType<typeof vi.fn>;
  let writeFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs/promises');
    readFileMock = vi.mocked(fs.readFile);
    writeFileMock = vi.mocked(fs.writeFile);
    writeFileMock.mockResolvedValue(undefined);
    ({ updateCatalogPaymentLinks } = await import('../../../src/lib/catalog/csv-writer.js'));
  });

  it('updates Payment Link column for matching SKUs', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Payment Link\nA,Widget,1,\n');

    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );

    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('https://buy.stripe.com/new');
  });

  it('adds Payment Link column if it does not exist', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\nA,Widget,1\n');

    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );

    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('Payment Link');
    expect(written).toContain('https://buy.stripe.com/new');
  });

  it('preserves custom columns', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Custom Col,Payment Link\nA,Widget,1,my-data,\n');

    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );

    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('Custom Col');
    expect(written).toContain('my-data');
  });

  it('does not modify rows without matching SKU', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Payment Link\nA,Widget,1,https://old\nB,Other,2,https://keep\n');

    await updateCatalogPaymentLinks(
      new Map([['A', 'https://new']]),
      '/test/catalog.csv',
    );

    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('https://new');
    expect(written).toContain('https://keep');
  });

  it('writes to the provided path', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\nA,W,1\n');

    await updateCatalogPaymentLinks(new Map(), '/custom/path.csv');

    expect(writeFileMock).toHaveBeenCalledWith('/custom/path.csv', expect.any(String));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/catalog/csv-writer.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement csv-writer.ts**

```typescript
// src/lib/catalog/csv-writer.ts

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFile, writeFile } from 'node:fs/promises';
import { CATALOG_PATH } from './csv.js';

export async function updateCatalogPaymentLinks(
  updates: Map<string, string>,
  path?: string,
): Promise<void> {
  const csvPath = path ?? CATALOG_PATH;
  const content = await readFile(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  if (records.length === 0) return;

  const columns = Object.keys(records[0]!);

  if (!columns.includes('Payment Link')) {
    columns.push('Payment Link');
    for (const record of records) {
      record['Payment Link'] = '';
    }
  }

  for (const record of records) {
    const sku = (record['SKU'] ?? '').trim();
    if (sku && updates.has(sku)) {
      record['Payment Link'] = updates.get(sku)!;
    }
  }

  const output = stringify(records, { header: true, columns });
  await writeFile(csvPath, output);
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/lib/catalog/index.ts`:

```typescript
export { updateCatalogPaymentLinks } from './csv-writer.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/catalog/csv-writer.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/csv-writer.ts src/lib/catalog/index.ts tests/unit/catalog/csv-writer.test.ts
git commit -m "Add CSV write-back utility for Payment Link URLs"
```

---

### Task 10: Sync Commands (diff, add, update, sync)

**Files:**
- Modify: `src/lib/stripe/sync.ts`
- Modify: `tests/unit/stripe/sync.test.ts`

- [ ] **Step 1: Write failing tests for catalogDiff**

Add to `tests/unit/stripe/sync.test.ts`:

```typescript
import { makeCatalogProduct } from '../catalog/helpers.js';

// ... existing readStripeState tests above ...

describe('catalogDiff', () => {
  let catalogDiff: typeof import('../../../src/lib/stripe/sync.js').catalogDiff;

  beforeEach(async () => {
    vi.resetModules();
    ({ catalogDiff } = await import('../../../src/lib/stripe/sync.js'));
  });

  it('identifies new products not in Stripe', () => {
    const catalog = [makeCatalogProduct({ sku: 'NEW', storefront: true })];
    const stripeState: Map<string, any> = new Map();

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]!.sku).toBe('NEW');
  });

  it('identifies products needing name update', () => {
    const catalog = [makeCatalogProduct({ sku: 'W', name: 'New Name', storefront: true })];
    const stripeState = new Map([['W', {
      productId: 'prod_1', name: 'Old Name', description: null,
      priceId: 'price_1', unitAmount: 1999, currency: 'usd',
      paymentLinkId: null, paymentLinkUrl: null,
    }]]);

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]!.changes).toContain('name');
  });

  it('identifies products needing price update', () => {
    const catalog = [makeCatalogProduct({ sku: 'W', price: 29.99, storefront: true })];
    const stripeState = new Map([['W', {
      productId: 'prod_1', name: 'Test Product', description: null,
      priceId: 'price_1', unitAmount: 1999, currency: 'usd',
      paymentLinkId: null, paymentLinkUrl: null,
    }]]);

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]!.changes).toContain('price');
  });

  it('identifies orphaned Stripe products', () => {
    const catalog = [makeCatalogProduct({ sku: 'KEEP', storefront: true })];
    const stripeState = new Map([
      ['KEEP', { productId: 'prod_1', name: 'Keep', description: null, priceId: 'p1', unitAmount: 1999, currency: 'usd', paymentLinkId: null, paymentLinkUrl: null }],
      ['GONE', { productId: 'prod_2', name: 'Gone', description: null, priceId: 'p2', unitAmount: 999, currency: 'usd', paymentLinkId: null, paymentLinkUrl: null }],
    ]);

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.orphaned).toHaveLength(1);
    expect(diff.orphaned[0]!.sku).toBe('GONE');
  });

  it('reports no changes when in sync', () => {
    const catalog = [makeCatalogProduct({ sku: 'W', name: 'Widget', price: 19.99, storefront: true })];
    const stripeState = new Map([['W', {
      productId: 'prod_1', name: 'Widget', description: null,
      priceId: 'price_1', unitAmount: 1999, currency: 'usd',
      paymentLinkId: 'plink_1', paymentLinkUrl: 'https://buy.stripe.com/test',
    }]]);

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.orphaned).toHaveLength(0);
  });

  it('only diffs storefront products', () => {
    const catalog = [
      makeCatalogProduct({ sku: 'SHOW', storefront: true }),
      makeCatalogProduct({ sku: 'HIDE', storefront: false }),
    ];
    const stripeState: Map<string, any> = new Map();

    const diff = catalogDiff(catalog, stripeState, 'usd');
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]!.sku).toBe('SHOW');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: catalogDiff tests FAIL

- [ ] **Step 3: Implement catalogDiff**

Add to `src/lib/stripe/sync.ts`:

```typescript
import type { CatalogProduct } from '../catalog/types.js';
import { decimalToRawPrice } from '../storefront/pricing.js';

export interface DiffEntry {
  sku: string;
  product: CatalogProduct;
}

export interface UpdateEntry {
  sku: string;
  product: CatalogProduct;
  existing: StripeProductState;
  changes: string[];
}

export interface OrphanEntry {
  sku: string;
  state: StripeProductState;
}

export interface CatalogDiffResult {
  toAdd: DiffEntry[];
  toUpdate: UpdateEntry[];
  orphaned: OrphanEntry[];
}

export function catalogDiff(
  catalog: CatalogProduct[],
  stripeState: StripeState,
  currency: string,
): CatalogDiffResult {
  const toAdd: DiffEntry[] = [];
  const toUpdate: UpdateEntry[] = [];

  const storefrontProducts = catalog.filter((p) => p.storefront);
  const catalogSkus = new Set(storefrontProducts.map((p) => p.sku));

  for (const product of storefrontProducts) {
    const existing = stripeState.get(product.sku);
    if (!existing) {
      toAdd.push({ sku: product.sku, product });
      continue;
    }

    const changes: string[] = [];
    if (existing.name !== product.name) changes.push('name');
    if (existing.description !== (product.description ?? null)) changes.push('description');
    const expectedAmount = decimalToRawPrice(product.price, currency);
    if (existing.unitAmount !== expectedAmount) changes.push('price');

    if (changes.length > 0) {
      toUpdate.push({ sku: product.sku, product, existing, changes });
    }
  }

  const orphaned: OrphanEntry[] = [];
  for (const [sku, state] of stripeState) {
    if (!catalogSkus.has(sku)) {
      orphaned.push({ sku, state });
    }
  }

  return { toAdd, toUpdate, orphaned };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Write failing tests for catalogAdd**

Add to `tests/unit/stripe/sync.test.ts`:

```typescript
describe('catalogAdd', () => {
  let catalogAdd: typeof import('../../../src/lib/stripe/sync.js').catalogAdd;
  let productsCreateMock: ReturnType<typeof vi.fn>;
  let pricesCreateMock: ReturnType<typeof vi.fn>;
  let paymentLinksCreateMock: ReturnType<typeof vi.fn>;
  let productsUpdateMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsCreateMock = vi.fn();
    productsUpdateMock = vi.fn();
    pricesCreateMock = vi.fn();
    paymentLinksCreateMock = vi.fn();

    productsCreateMock.mockResolvedValue({ id: 'prod_new' });
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });
    productsUpdateMock.mockResolvedValue({});

    Stripe.mockImplementation(() => ({
      products: { create: productsCreateMock, update: productsUpdateMock },
      prices: { create: pricesCreateMock },
      paymentLinks: { create: paymentLinksCreateMock },
    }) as unknown as InstanceType<typeof Stripe>);

    ({ catalogAdd } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('creates Product, Price, and Payment Link for new products', async () => {
    const toAdd = [{ sku: 'NEW', product: makeCatalogProduct({ sku: 'NEW', name: 'New Widget', price: 9.99 }) }];

    const result = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsCreateMock).toHaveBeenCalledWith({
      name: 'New Widget',
      description: undefined,
      metadata: { sku: 'NEW' },
    });
    expect(pricesCreateMock).toHaveBeenCalledWith({
      product: 'prod_new',
      unit_amount: 999,
      currency: 'usd',
    });
    expect(paymentLinksCreateMock).toHaveBeenCalledWith({
      line_items: [{ price: 'price_new', quantity: 1 }],
    });
    expect(result.size).toBe(1);
    expect(result.get('NEW')).toBe('https://buy.stripe.com/new');
  });

  it('stores payment link ID and URL in product metadata', async () => {
    const toAdd = [{ sku: 'NEW', product: makeCatalogProduct({ sku: 'NEW' }) }];

    await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_new', {
      metadata: { sku: 'NEW', payment_link_id: 'plink_new', payment_link_url: 'https://buy.stripe.com/new' },
      default_price: 'price_new',
    });
  });

  it('returns empty map when nothing to add', async () => {
    const result = await catalogAdd(stripe as any, [], 'usd');
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: catalogAdd tests FAIL

- [ ] **Step 7: Implement catalogAdd**

Add to `src/lib/stripe/sync.ts`:

```typescript
export async function catalogAdd(
  stripe: Stripe,
  toAdd: DiffEntry[],
  currency: string,
): Promise<Map<string, string>> {
  const newLinks = new Map<string, string>();

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

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });

    await stripe.products.update(product.id, {
      metadata: { sku: entry.sku, payment_link_id: link.id, payment_link_url: link.url },
      default_price: price.id,
    });

    newLinks.set(entry.sku, link.url);
    console.log(`[Sync] Created: ${entry.sku} — ${entry.product.name}`);
  }

  return newLinks;
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: all tests PASS

- [ ] **Step 9: Write failing tests for catalogUpdate**

Add to `tests/unit/stripe/sync.test.ts`:

```typescript
describe('catalogUpdate', () => {
  let catalogUpdate: typeof import('../../../src/lib/stripe/sync.js').catalogUpdate;
  let productsUpdateMock: ReturnType<typeof vi.fn>;
  let pricesCreateMock: ReturnType<typeof vi.fn>;
  let paymentLinksCreateMock: ReturnType<typeof vi.fn>;
  let paymentLinksUpdateMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsUpdateMock = vi.fn().mockResolvedValue({});
    pricesCreateMock = vi.fn().mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock = vi.fn().mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/updated' });
    paymentLinksUpdateMock = vi.fn().mockResolvedValue({});

    Stripe.mockImplementation(() => ({
      products: { update: productsUpdateMock },
      prices: { create: pricesCreateMock },
      paymentLinks: { create: paymentLinksCreateMock, update: paymentLinksUpdateMock },
    }) as unknown as InstanceType<typeof Stripe>);

    ({ catalogUpdate } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('updates product name without touching Payment Link', async () => {
    const toUpdate = [{
      sku: 'W',
      product: makeCatalogProduct({ sku: 'W', name: 'New Name', price: 19.99 }),
      existing: {
        productId: 'prod_1', name: 'Old Name', description: null,
        priceId: 'price_1', unitAmount: 1999, currency: 'usd',
        paymentLinkId: 'plink_1', paymentLinkUrl: 'https://buy.stripe.com/old',
      },
      changes: ['name'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');
    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({ name: 'New Name' }));
    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it('recreates Price and Payment Link on price change', async () => {
    const toUpdate = [{
      sku: 'W',
      product: makeCatalogProduct({ sku: 'W', price: 29.99 }),
      existing: {
        productId: 'prod_1', name: 'Test Product', description: null,
        priceId: 'price_old', unitAmount: 1999, currency: 'usd',
        paymentLinkId: 'plink_old', paymentLinkUrl: 'https://buy.stripe.com/old',
      },
      changes: ['price'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesCreateMock).toHaveBeenCalledWith({
      product: 'prod_1',
      unit_amount: 2999,
      currency: 'usd',
    });
    expect(paymentLinksUpdateMock).toHaveBeenCalledWith('plink_old', { active: false });
    expect(paymentLinksCreateMock).toHaveBeenCalledWith({
      line_items: [{ price: 'price_new', quantity: 1 }],
    });
    expect(result.size).toBe(1);
    expect(result.get('W')).toBe('https://buy.stripe.com/updated');
  });

  it('handles price change when no existing Payment Link', async () => {
    const toUpdate = [{
      sku: 'W',
      product: makeCatalogProduct({ sku: 'W', price: 29.99 }),
      existing: {
        productId: 'prod_1', name: 'Test Product', description: null,
        priceId: 'price_old', unitAmount: 1999, currency: 'usd',
        paymentLinkId: null, paymentLinkUrl: null,
      },
      changes: ['price'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(paymentLinksCreateMock).toHaveBeenCalled();
    expect(result.size).toBe(1);
  });

  it('returns empty map when nothing to update', async () => {
    const result = await catalogUpdate(stripe as any, [], 'usd');
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: catalogUpdate tests FAIL

- [ ] **Step 11: Implement catalogUpdate**

Add to `src/lib/stripe/sync.ts`:

```typescript
export async function catalogUpdate(
  stripe: Stripe,
  toUpdate: UpdateEntry[],
  currency: string,
): Promise<Map<string, string>> {
  const updatedLinks = new Map<string, string>();

  for (const entry of toUpdate) {
    const productUpdate: Record<string, unknown> = {};

    if (entry.changes.includes('name')) productUpdate.name = entry.product.name;
    if (entry.changes.includes('description')) productUpdate.description = entry.product.description ?? '';

    const priceChanged = entry.changes.includes('price');

    if (priceChanged) {
      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const newPrice = await stripe.prices.create({
        product: entry.existing.productId,
        unit_amount: rawPrice,
        currency,
      });
      productUpdate.default_price = newPrice.id;

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
      console.log(`[Sync] Updated: ${entry.sku} — ${entry.changes.join(', ')}`);
    }

    if (Object.keys(productUpdate).length > 0) {
      await stripe.products.update(entry.existing.productId, productUpdate);
    }
  }

  return updatedLinks;
}
```

- [ ] **Step 12: Run tests to verify they pass**

```bash
npx vitest run tests/unit/stripe/sync.test.ts
```

Expected: all tests PASS

- [ ] **Step 13: Commit**

```bash
git add src/lib/stripe/sync.ts tests/unit/stripe/sync.test.ts
git commit -m "Add catalog diff, add, and update sync commands"
```

---

### Task 11: CLI Entry Point

**Files:**
- Create: `bin/catalog.mjs`
- Modify: `package.json`
- Modify: `src/lib/stripe/sync.ts` (add `catalogSync` convenience function)
- Modify: `src/lib/stripe/index.ts`

- [ ] **Step 1: Add catalogSync to sync.ts**

Add to `src/lib/stripe/sync.ts`:

```typescript
import { loadCatalog } from '../catalog/csv.js';
import { updateCatalogPaymentLinks } from '../catalog/csv-writer.js';
import { getStripeClient } from './client.js';

export async function catalogSync(mode: 'diff' | 'add' | 'update' | 'sync'): Promise<void> {
  const catalog = await loadCatalog();
  const stripe = getStripeClient();
  const currency = 'usd';

  const state = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);

  if (mode === 'diff') {
    if (diff.toAdd.length > 0) {
      console.log(`\nNew products (${diff.toAdd.length}):`);
      for (const entry of diff.toAdd) {
        console.log(`  + ${entry.sku}: ${entry.product.name} — $${entry.product.price}`);
      }
    }
    if (diff.toUpdate.length > 0) {
      console.log(`\nProducts to update (${diff.toUpdate.length}):`);
      for (const entry of diff.toUpdate) {
        console.log(`  ~ ${entry.sku}: ${entry.changes.join(', ')}`);
      }
    }
    if (diff.orphaned.length > 0) {
      console.log(`\nOrphaned in Stripe (${diff.orphaned.length}):`);
      for (const entry of diff.orphaned) {
        console.log(`  ? ${entry.sku}: ${entry.state.name}`);
      }
    }
    if (diff.toAdd.length === 0 && diff.toUpdate.length === 0 && diff.orphaned.length === 0) {
      console.log('\nEverything is in sync.');
    }
    return;
  }

  const allUpdatedLinks = new Map<string, string>();

  if (mode === 'add' || mode === 'sync') {
    if (diff.toAdd.length > 0) {
      const newLinks = await catalogAdd(stripe, diff.toAdd, currency);
      for (const [sku, url] of newLinks) allUpdatedLinks.set(sku, url);
    } else {
      console.log('[Sync] No new products to add.');
    }
  }

  if (mode === 'update' || mode === 'sync') {
    if (diff.toUpdate.length > 0) {
      const updatedLinks = await catalogUpdate(stripe, diff.toUpdate, currency);
      for (const [sku, url] of updatedLinks) allUpdatedLinks.set(sku, url);
    } else {
      console.log('[Sync] No products to update.');
    }
  }

  if (allUpdatedLinks.size > 0) {
    await updateCatalogPaymentLinks(allUpdatedLinks);
    console.log(`[Sync] Wrote ${allUpdatedLinks.size} Payment Link URL${allUpdatedLinks.size === 1 ? '' : 's'} back to catalog.csv`);
  }

  if (diff.orphaned.length > 0) {
    console.log(`[Sync] Warning: ${diff.orphaned.length} Stripe product${diff.orphaned.length === 1 ? '' : 's'} not in catalog:`);
    for (const entry of diff.orphaned) {
      console.log(`  ? ${entry.sku}: ${entry.state.name}`);
    }
  }
}
```

- [ ] **Step 2: Create bin/catalog.mjs**

```javascript
#!/usr/bin/env node

// bin/catalog.mjs

const command = process.argv[2];
const validCommands = ['diff', 'add', 'update', 'sync'];

if (!command || !validCommands.includes(command)) {
  console.log('Usage: catalog <command>\n');
  console.log('Commands:');
  console.log('  diff    Show what would change (read-only)');
  console.log('  add     Create new Stripe products from catalog');
  console.log('  update  Update existing Stripe products from catalog');
  console.log('  sync    Run add + update');
  process.exit(command ? 1 : 0);
}

try {
  const { catalogSync } = await import('../src/lib/stripe/sync.js');
  await catalogSync(command);
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
```

- [ ] **Step 3: Add npm scripts to package.json**

Add to `scripts` in `package.json`:

```json
"catalog": "node bin/catalog.mjs",
"catalog:diff": "node bin/catalog.mjs diff",
"catalog:add": "node bin/catalog.mjs add",
"catalog:update": "node bin/catalog.mjs update",
"catalog:sync": "node bin/catalog.mjs sync"
```

- [ ] **Step 4: Update stripe barrel export**

Add to `src/lib/stripe/index.ts`:

```typescript
export { readStripeState, catalogDiff, catalogAdd, catalogUpdate, catalogSync } from './sync.js';
export type { StripeProductState, StripeState, CatalogDiffResult } from './sync.js';
```

- [ ] **Step 5: Verify CLI runs**

```bash
node bin/catalog.mjs
```

Expected: prints usage help

- [ ] **Step 6: Commit**

```bash
git add bin/catalog.mjs src/lib/stripe/sync.ts src/lib/stripe/index.ts package.json
git commit -m "Add catalog CLI with diff, add, update, sync commands"
```

---

## Part 4: Cleanup

### Task 12: Remove Deprecated Code + Update Exports

**Files:**
- Remove: `src/lib/storefront/listing-configs.ts`
- Remove: `src/lib/storefront/listing-builders.ts`
- Remove: `src/lib/storefront/name-collisions.ts`
- Remove: `src/lib/storefront/stripe-adapter.ts`
- Remove: `tests/unit/storefront/listing-configs.test.ts`
- Remove: `tests/unit/storefront/listing-builders.test.ts`
- Remove: `tests/unit/storefront/name-collisions.test.ts`
- Remove: `tests/unit/storefront/stripe-adapter.test.ts`
- Modify: `src/lib/storefront/index.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json` (exports)

- [ ] **Step 1: Delete deprecated source files**

```bash
rm src/lib/storefront/listing-configs.ts
rm src/lib/storefront/listing-builders.ts
rm src/lib/storefront/name-collisions.ts
rm src/lib/storefront/stripe-adapter.ts
```

- [ ] **Step 2: Delete deprecated test files**

```bash
rm tests/unit/storefront/listing-configs.test.ts
rm tests/unit/storefront/listing-builders.test.ts
rm tests/unit/storefront/name-collisions.test.ts
rm tests/unit/storefront/stripe-adapter.test.ts
```

- [ ] **Step 3: Update storefront barrel export**

Replace `src/lib/storefront/index.ts`:

```typescript
export type { Listing } from './types.js';
export type { NavItem, ResolvedNavItem, StoreConfig, PageData } from './types.js';
export { formatPrice, rawPriceToDecimal, decimalToRawPrice } from './pricing.js';
export { getListings } from './get-listings.js';
export { getErrorMessage } from './utils.js';
export { loadConfig, getNav, resolveNavItem, parseConfig } from './config.js';
export { loadPages, resolvePageTitle, frontmatterSchema } from './pages.js';
```

Removed: `loadListingConfigs`, `listingHasPrice`, `SingleListing`, `BundleListing`, `ListingConfig`, `StripeProductData`, `LinkWarning`.

- [ ] **Step 4: Add catalog export path to package.json**

Add to `exports` in `package.json`:

```json
"./catalog": "./src/lib/catalog/index.ts"
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test:coverage
```

Expected: all tests PASS, 100% coverage

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove deprecated listing system, update exports for catalog model"
```

---

### Task 13: Update Documentation

**Files:**
- Modify: `docs/principles.md`

- [ ] **Step 1: Update Stripe-as-source-of-truth language in principles.md**

Replace lines referencing Stripe as the core product data model. Change:

> Stripe is the core product data model — shared across all sales channels.

to:

> The product catalog (catalog.csv) is the single source of truth. Stripe is a downstream consumer for checkout.

Replace:

> The storefront is one channel. Local configuration is channel-specific presentation that layers on top of Stripe data.

to:

> The storefront is one channel. The CSV drives the storefront directly. Stripe sync is a separate operation for enabling checkout.

Replace:

> Zero config works. Stripe data alone produces a functional storefront. Local config is optional enrichment or override.

to:

> Zero config works. A CSV with SKU, Name, and Price produces a functional storefront. Images, overrides, and Stripe sync are optional enrichment.

- [ ] **Step 2: Verify build still works**

```bash
npm run ci
```

Expected: typecheck, test, and build all pass

- [ ] **Step 3: Commit**

```bash
git add docs/principles.md
git commit -m "Update principles to reflect CSV-as-source-of-truth model"
```
