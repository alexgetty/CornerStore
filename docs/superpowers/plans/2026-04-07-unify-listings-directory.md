# Unify Listings Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `bundles/` to `listings/`, rename `BundleConfig` to `ListingConfig`, rename `buildSingleListing` to `buildListing`, and extend local `.md` file support so single-product listings can also have local overrides.

**Architecture:** The `bundles.ts` loader becomes `listing-configs.ts` and returns `ListingConfig` maps. The `get-listings.ts` orchestrator applies configs to both singles and bundles (not just bundles). `buildSingleListing` becomes `buildListing` and accepts an optional `ListingConfig`. Domain types that describe multi-product links (`BundleListing`, `PendingBundle`, `buildBundleListing`) keep their names because they describe Stripe's actual data model.

**Tech Stack:** TypeScript, Vitest, gray-matter, Node.js fs

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Rename | `src/lib/storefront/bundles.ts` -> `src/lib/storefront/listing-configs.ts` | Load local `.md` config files from `listings/` directory |
| Modify | `src/lib/storefront/types.ts` | Rename `BundleConfig` -> `ListingConfig` |
| Modify | `src/lib/storefront/listing-builders.ts` | Rename `buildSingleListing` -> `buildListing`, accept optional `ListingConfig` |
| Modify | `src/lib/storefront/name-collisions.ts` | Update `BundleConfig` type references -> `ListingConfig` |
| Modify | `src/lib/storefront/get-listings.ts` | Apply configs to singles too, update imports |
| Modify | `src/lib/storefront/index.ts` | Update barrel exports |
| Rename | `tests/unit/storefront/bundles.test.ts` -> `tests/unit/storefront/listing-configs.test.ts` | Update all references |
| Modify | `tests/unit/storefront/listing-builders.test.ts` | Update function name and add config tests for singles |
| Modify | `tests/unit/storefront/name-collisions.test.ts` | Update type import |
| Modify | `tests/unit/storefront/get-listings.test.ts` | Update all bundle-related references and add single+config tests |
| Modify | `tests/unit/storefront/helpers.ts` | Update comments |
| Modify | `docs/SETUP.md` | Rename all `bundles/` references to `listings/` |

---

### Task 1: Rename `BundleConfig` -> `ListingConfig` in types

**Files:**
- Modify: `src/lib/storefront/types.ts:36-42`
- Modify: `src/lib/storefront/types.ts:54-58`

- [ ] **Step 1: Update the type name in types.ts**

Change `BundleConfig` to `ListingConfig` and update `PendingBundle` to reference it:

```typescript
// types.ts line 36-42
export interface ListingConfig {
  link: string;
  title?: string;
  description?: string;
  image?: string;
  image_alt?: string;
}
```

```typescript
// types.ts line 54-58
export type PendingBundle = Omit<BundleListing, 'name'> & {
  suffix: string;
  config: ListingConfig | undefined;
  linkId: string;
};
```

- [ ] **Step 2: Run type check to see what breaks**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Type errors in every file that imports `BundleConfig`. This confirms all consumers.

- [ ] **Step 3: Update all imports of `BundleConfig` -> `ListingConfig`**

Files to update (change the import name only, no logic changes yet):

`src/lib/storefront/listing-builders.ts:1`:
```typescript
import type { StripeProductData, PaymentLink, SingleListing, ListingConfig, LinkWarning, PendingBundle } from './types.js';
```

`src/lib/storefront/listing-builders.ts:18-21` (parameter type):
```typescript
export function buildBundleListing(
  productDataItems: StripeProductData[],
  link: PaymentLink,
  config: ListingConfig | undefined,
): { bundle: PendingBundle; warnings: LinkWarning[] } {
```

`src/lib/storefront/get-listings.ts:1`:
```typescript
import type { Listing, SingleListing, LinkWarning, PendingBundle, ListingConfig } from './types.js';
```

`src/lib/storefront/get-listings.ts:12-13`:
```typescript
  let listingConfigs: Map<string, ListingConfig>;
  try {
    listingConfigs = await loadBundleConfigs();
```

`src/lib/storefront/name-collisions.ts:1`:
```typescript
import type { BundleListing, PendingBundle, LinkWarning } from './types.js';
```
(This file doesn't directly import `BundleConfig`, so no change needed here.)

`src/lib/storefront/index.ts:1`:
```typescript
export type { Listing, SingleListing, BundleListing, ListingConfig, StripeProductData, LinkWarning } from './types.js';
```

`tests/unit/storefront/listing-builders.test.ts:3` - no change needed (doesn't import `BundleConfig` directly, uses inline object literals).

`tests/unit/storefront/name-collisions.test.ts:3`:
```typescript
import type { PendingBundle, ListingConfig } from '../../../src/lib/storefront/types.js';
```

And update the usage at line 49, 118-119, 133, 173-175:
```typescript
    const config: ListingConfig = { link: 'https://buy.stripe.com/test', title: 'Holiday Set' };
```
(Apply to all `BundleConfig` type annotations in the file.)

- [ ] **Step 4: Run type check to confirm clean**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run all tests to confirm nothing broke**

Run: `npx vitest run`
Expected: All tests pass. This was a pure type rename, no runtime behavior changed.

---

### Task 2: Rename `bundles.ts` -> `listing-configs.ts` and update directory constants

**Files:**
- Rename: `src/lib/storefront/bundles.ts` -> `src/lib/storefront/listing-configs.ts`
- Modify: `src/lib/storefront/listing-configs.ts:7-8` (constants)
- Modify: `src/lib/storefront/listing-configs.ts:11` (function name)
- Modify: `src/lib/storefront/get-listings.ts:3` (import path)
- Modify: `src/lib/storefront/index.ts:4` (re-export)
- Rename: `tests/unit/storefront/bundles.test.ts` -> `tests/unit/storefront/listing-configs.test.ts`

- [ ] **Step 1: Rename the source file**

```bash
cd "/Users/alex/Repos/Corner Store/Storefront"
git mv src/lib/storefront/bundles.ts src/lib/storefront/listing-configs.ts
```

- [ ] **Step 2: Update constants and function name in listing-configs.ts**

Change lines 4, 7-8, 11:

```typescript
import type { ListingConfig } from './types.js';
```

```typescript
export const LISTINGS_DIR = join(process.cwd(), 'listings');
export const LISTINGS_PUBLIC_DIR = join(process.cwd(), 'public', 'listings');
```

```typescript
export async function loadListingConfigs(): Promise<Map<string, ListingConfig>> {
```

- [ ] **Step 3: Update all console messages in listing-configs.ts from "bundles/" to "listings/"**

Replace every `bundles/` path reference in console.log strings. There are 7 occurrences:

Line 32: `listings/${dir.name}: failed to read`
Line 41: `listings/${dir.name}: multiple .md files`
Line 48: `listings/${dir.name}/${mdFile}: failed to read`
Line 56: `listings/${dir.name}/${mdFile}: failed to parse frontmatter`
Line 61: `listings/${dir.name}/${mdFile}: missing required "link" field`
Line 74: `listings/${dir.name}: cover "${data.cover}" not found`
Line 90: `listings/${dir.name}: failed to copy images`

Also update the image path on line 94:
```typescript
    const resolvedImage = coverFile ? `/listings/${dir.name}/${coverFile}` : undefined;
```

And the duplicate link warning on line 105:
```typescript
      console.log(`[Storefront] Warning: listings/${dir.name}/${mdFile}: duplicate link — already configured, skipping`);
```

- [ ] **Step 4: Update import in get-listings.ts**

Line 3:
```typescript
import { loadListingConfigs } from './listing-configs.js';
```

Also update the variable name and catch message on lines 12-18:
```typescript
  let listingConfigs: Map<string, ListingConfig>;
  try {
    listingConfigs = await loadListingConfigs();
  } catch (err: unknown) {
    console.log(`[Storefront] Warning: failed to load listing configs — ${getErrorMessage(err)}`);
    listingConfigs = new Map();
  }
```

And update line 74 where it accesses configs:
```typescript
      const config = listingConfigs.get(link.url);
```

- [ ] **Step 5: Update barrel export in index.ts**

Line 4:
```typescript
export { loadListingConfigs } from './listing-configs.js';
```

- [ ] **Step 6: Rename the test file**

```bash
git mv tests/unit/storefront/bundles.test.ts tests/unit/storefront/listing-configs.test.ts
```

- [ ] **Step 7: Update all references inside listing-configs.test.ts**

Update describe block name (line 18):
```typescript
describe('loadListingConfigs', () => {
```

Update every dynamic import (there are 20+ occurrences). Change:
```typescript
    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
```
To:
```typescript
    const { loadListingConfigs } = await import(
      '../../../src/lib/storefront/listing-configs.js'
    );
```

Update every call from `loadBundleConfigs()` to `loadListingConfigs()`.

Update every string assertion that checks for `bundles/` in console warnings to `listings/`. For example:

Line 74: `'/bundles/holiday-set/photo.jpg'` -> `'/listings/holiday-set/photo.jpg'`
Line 167: `'/bundles/my-bundle/alpha.png'` -> `'/listings/my-bundle/alpha.png'`
Line 190: `'/bundles/my-bundle/hero.png'` -> `'/listings/my-bundle/hero.png'`
Line 214: `'/bundles/my-bundle/actual.jpg'` -> `'/listings/my-bundle/actual.jpg'`
Line 261: `'public/bundles/holiday-set'` -> `'public/listings/holiday-set'`
Line 266-272: All `bundles/holiday-set/` paths -> `listings/holiday-set/`
Line 397: `'[Storefront] Warning: bundles/broken/bundle.md:'` -> `'[Storefront] Warning: listings/broken/bundle.md:'`
Line 430-431: `bundles/weird/` -> `listings/weird/`
Line 464: `bundles/malformed/` -> `listings/malformed/`
Line 502: `bundles/cursed/` -> `listings/cursed/`
Line 558: `bundles/bad-dir` -> `listings/bad-dir`

- [ ] **Step 8: Run tests to confirm**

Run: `npx vitest run`
Expected: All tests pass.

---

### Task 3: Rename `buildSingleListing` -> `buildListing` and add `ListingConfig` support

**Files:**
- Modify: `src/lib/storefront/listing-builders.ts:4-16`
- Modify: `tests/unit/storefront/listing-builders.test.ts`

- [ ] **Step 1: Write failing tests for `buildListing` with config overrides**

Add these tests to `tests/unit/storefront/listing-builders.test.ts`. First, update the import on line 2:

```typescript
import { buildListing, buildBundleListing } from '../../../src/lib/storefront/listing-builders.js';
```

Update the describe block name (line 25):
```typescript
describe('buildListing', () => {
```

Update all existing `buildSingleListing` calls inside this describe to `buildListing`. There are 6 calls (lines 30, 47, 55, 63, 73, 81). Each changes from `buildSingleListing(product, link)` to `buildListing(product, link)`.

Then add new tests after the existing ones (before the closing `});` of the `buildListing` describe):

```typescript
  it('applies config title override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', title: 'Custom Name' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Custom Name');
  });

  it('applies config description override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', description: 'Custom description' };

    const result = buildListing(product, link, config);

    expect(result.description).toBe('Custom description');
  });

  it('applies config image override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image: '/listings/my-product/hero.jpg' };

    const result = buildListing(product, link, config);

    expect(result.image).toBe('/listings/my-product/hero.jpg');
  });

  it('applies config image_alt override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image_alt: 'A beautiful product' };

    const result = buildListing(product, link, config);

    expect(result.imageAlt).toBe('A beautiful product');
  });

  it('uses Stripe data when config has no overrides', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Test Product');
    expect(result.description).toBe('A test product');
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.imageAlt).toBe('');
  });

  it('uses Stripe data when no config provided', () => {
    const product = makeProduct();
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.name).toBe('Test Product');
    expect(result.description).toBe('A test product');
  });

  it('partial config only overrides specified fields', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', title: 'Custom Name' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Custom Name');
    expect(result.description).toBe('A test product');
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.imageAlt).toBe('');
  });
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run tests/unit/storefront/listing-builders.test.ts`
Expected: Failures for `buildListing` not found (import error) and new config tests failing.

- [ ] **Step 3: Implement `buildListing` with config support**

Update `src/lib/storefront/listing-builders.ts` lines 4-16:

```typescript
export function buildListing(
  product: StripeProductData,
  link: PaymentLink,
  config?: ListingConfig,
): SingleListing {
  return {
    kind: 'single',
    name: config?.title ?? product.name,
    description: config?.description ?? product.description,
    image: config?.image ?? product.image,
    imageAlt: config?.image_alt ?? product.imageAlt,
    price: formatPrice(product.rawPrice, product.currency),
    rawPrice: product.rawPrice,
    currency: product.currency,
    paymentLink: link.url,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/listing-builders.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Update `get-listings.ts` to use `buildListing`**

Line 8:
```typescript
import { buildListing, buildBundleListing } from './listing-builders.js';
```

Line 71:
```typescript
      singleListings.push(buildListing(productDataItems[0]!, link));
```

(Config application for singles comes in Task 4.)

- [ ] **Step 6: Update `get-listings.test.ts` - no assertion changes needed yet**

The existing tests call `buildSingleListing` indirectly through `getListings()`. Since the function was renamed but the output shape hasn't changed, existing tests should pass without changes.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All pass.

---

### Task 4: Apply listing configs to singles in `get-listings.ts`

**Files:**
- Modify: `src/lib/storefront/get-listings.ts:70-71`
- Modify: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Write failing tests for single-product config application**

Add these tests to `tests/unit/storefront/get-listings.test.ts` in a new section after the existing bundle config integration tests:

```typescript
  // --- Single listing config integration ---

  it('applies listing config overrides to single-product listing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-candle', true)]);
      }
      return Promise.resolve(['listing.md', 'hero.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test_abc\ntitle: Artisan Soy Candle\ndescription: Hand-poured with love\nimage_alt: A beautiful soy candle\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.kind).toBe('single');
    expect(listings[0]!.name).toBe('Artisan Soy Candle');
    expect(listings[0]!.description).toBe('Hand-poured with love');
    expect(listings[0]!.image).toBe('/listings/my-candle/hero.jpg');
    expect(listings[0]!.imageAlt).toBe('A beautiful soy candle');
  });

  it('single listing uses Stripe data when no matching config', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.kind).toBe('single');
    expect(listings[0]!.name).toBe('Test Product');
    expect(listings[0]!.description).toBe('A test product');
  });

  it('single listing partial config only overrides specified fields', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-product', true)]);
      }
      return Promise.resolve(['listing.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test_abc\ntitle: Better Name\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.name).toBe('Better Name');
    expect(listings[0]!.description).toBe('A test product');
    expect(listings[0]!.image).toBe('https://example.com/img.jpg');
  });
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts`
Expected: New config tests fail because `get-listings.ts` doesn't pass configs to `buildListing` yet.

- [ ] **Step 3: Wire up config lookup for singles in get-listings.ts**

Update the single-product branch (around line 70-71) to look up and pass config:

```typescript
    if (productDataItems.length === 1) {
      const config = listingConfigs.get(link.url);
      singleListings.push(buildListing(productDataItems[0]!, link, config));
    } else {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts`
Expected: All tests pass including new ones.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All pass.

---

### Task 5: Update warning messages and build summary in `get-listings.ts`

**Files:**
- Modify: `src/lib/storefront/get-listings.ts:88-98,136`
- Modify: `tests/unit/storefront/get-listings.test.ts`

- [ ] **Step 1: Update warning messages**

The "no bundle config" warning (line 91) should now say "no listing config" and reference `listings/` instead of `bundles/`:

```typescript
      warnings.push({
        linkUrl: pending.paymentLink,
        reason: `no listing config — customers will see "${resolved.name}". Create a listings/ directory with a markdown file to configure this listing`,
      });
```

The "bundle config has no title" warning (line 96) should say "listing config has no title":

```typescript
      warnings.push({
        linkUrl: pending.paymentLink,
        reason: `listing config has no title — customers will see "${resolved.name}". Add a title field to your frontmatter`,
      });
```

Also update the catch message for loadListingConfigs (already done in Task 2, but verify):
```typescript
    console.log(`[Storefront] Warning: failed to load listing configs — ${getErrorMessage(err)}`);
```

- [ ] **Step 2: Update test assertions for warning messages**

In `get-listings.test.ts`:

The test at line 1521 checks for `'no bundle config'` -> change to `'no listing config'`
The test at line 1523 checks for `'bundles/'` -> change to `'listings/'`
The test at line 1589 checks for `'bundle config has no title'` -> change to `'listing config has no title'`
The test at line 1688 checks for `'bundle config'` -> change to `'listing config'`

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All pass.

---

### Task 6: Update `get-listings.test.ts` remaining bundle path references

**Files:**
- Modify: `tests/unit/storefront/get-listings.test.ts`

This task updates the integration test that checks config image paths and any remaining `bundles/` string references in test assertions.

- [ ] **Step 1: Update the config integration test image assertion**

The test "applies bundle config overrides to auto-generated fields" (around line 1755) asserts:
```typescript
    expect(listings[0]!.image).toBe('/bundles/holiday-set/holiday.jpg');
```
Change to:
```typescript
    expect(listings[0]!.image).toBe('/listings/holiday-set/holiday.jpg');
```

- [ ] **Step 2: Update comment in helpers.ts**

In `tests/unit/storefront/helpers.ts`, line 107:
```typescript
  // Default: no listing config directory
```

Also update the beforeEach comment in `get-listings.test.ts` line 38:
```typescript
    // Default: no listing config directory
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All pass.

---

### Task 7: Update orphaned config detection for singles

**Files:**
- Modify: `src/lib/storefront/get-listings.ts:102-109`
- Modify: `tests/unit/storefront/get-listings.test.ts`

Currently, orphaned config detection only checks bundle configs against active links. Since configs now apply to all listings (singles and bundles), the orphaned detection already works correctly because it checks `activeLinkUrls` against all configs. No logic change needed. But we should verify with a test.

- [ ] **Step 1: Write a test for orphaned config with a single-product link**

Add to `get-listings.test.ts`:

```typescript
  it('warns about orphaned configs even when only single-product links exist', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('orphan', true)]);
      }
      return Promise.resolve(['listing.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/nonexistent\ntitle: Ghost Listing\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/nonexistent');
    expect(allLogCalls).toContain('no matching');
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/storefront/get-listings.test.ts`
Expected: Passes (the orphaned detection logic already handles this).

---

### Task 8: Update documentation

**Files:**
- Modify: `docs/SETUP.md`
- Modify: `docs/todo/unify-listings-directory.md`

- [ ] **Step 1: Update SETUP.md**

Section heading (line 52): `## Bundle Configuration` -> `## Listing Configuration`

Line 54: Update intro paragraph:
```
Multi-product payment links automatically get a card with generated metadata:
```
(Keep as-is, this describes bundles specifically.)

Line 61: Update the directory instruction:
```
To customize any listing's appearance, create a subdirectory in `/listings/` with a markdown config file and any images:
```

Lines 63-72: Update directory structure example:
```
listings/
  holiday-set/
    listing.md
    photo1.jpg
    photo2.jpg
  starter-kit/
    my-notes.md
    hero.png
```

Line 91: Update path reference:
```
Each subdirectory in `/listings/` is a listing config. The `.md` filename is arbitrary — the `link` URL is the identifier. If a directory contains multiple `.md` files, the first alphabetically is used and the build warns about the rest. If multiple configs reference the same link, the first directory alphabetically wins and the build warns about duplicates.
```

Line 127: Update build summary example:
```
  Bundle cards: 2 (1 configured, 1 default)
```
(Keep as-is. The build summary still reports bundle counts separately.)

Line 135: Update warning example:
```
  - https://buy.stripe.com/abc: 3 products, no listing config — using defaults
```

Line 142: Update text:
```
Warnings about unconfigured bundles are informational — the bundle still gets a card with auto-generated metadata. Links that are skipped (e.g., failed to fetch) don't get cards but the build still succeeds if at least one card was built.
```
(Keep as-is except change "unconfigured bundles" -> "unconfigured listings".)

Line 284: Update How It Works step 4:
```
4. Multi-product links become bundle cards (auto-generated or configured via `/listings/<name>/`)
```

Add a new note after line 30 (after "Multi-product links (bundles) auto-generate..."):
```
**Any listing** (single or bundle) can be customized with a local config directory — see [Listing Configuration](#listing-configuration) below.
```

- [ ] **Step 2: Mark the todo as done**

Delete `docs/todo/unify-listings-directory.md` or move it to `docs/archive/done/`.

- [ ] **Step 3: Verify docs are consistent**

Read through the SETUP.md changes. Confirm there are no remaining `bundles/` references that should be `listings/` (the word "bundle" is fine when it refers to the multi-product concept, not the directory).

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite with coverage**

Run: `npx vitest run --coverage`
Expected: All tests pass, coverage meets thresholds.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build completes (may show Stripe-related warnings if no env key, that's fine).

- [ ] **Step 4: Grep for stale references**

```bash
grep -r "bundles/" src/ tests/ --include="*.ts" | grep -v node_modules | grep -v "dist/"
grep -r "loadBundleConfigs\|BUNDLES_DIR\|BUNDLES_PUBLIC_DIR\|buildSingleListing\|BundleConfig" src/ tests/ --include="*.ts"
```

Expected: No results. All old names should be gone from source and test files.
