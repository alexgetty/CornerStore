# Red Team Audit: Catalog Build Process

**Date:** 2026-04-10
**Scope:** 14 commits on `worktree-product-catalog-sync` (main..HEAD), 103 files changed. Full CSV-based catalog system replacing old Stripe-fetched listing model.
**Baseline:** 215 tests passing, 100% coverage on included files.

---

## CRITICAL

### 1. CLI Cannot Execute

**Location:** `bin/catalog.mjs:18-19`, `src/lib/stripe/catalog-cli.ts`, `src/lib/stripe/client.ts:5`

**Problem:** Two compounding issues make the entire catalog sync CLI non-functional:
1. `bin/catalog.mjs` runs via `node` but imports TypeScript source through a `.js` extension. Node.js cannot resolve `.js` to `.ts` without a loader like `tsx` (not installed).
2. `getStripeClient()` uses `import.meta.env.STRIPE_SECRET_KEY`, a Vite-only API unavailable in plain Node.js.

**Evidence:** `$ node bin/catalog.mjs diff` -> `Cannot find module '.../catalog-cli.js'`

**Solution (two parts):**

**Part 1: TypeScript loader.**
- Install `tsx` as a devDependency (`npm install -D tsx`).
- Rename `bin/catalog.mjs` to `bin/catalog.ts`. The file imports TypeScript modules, so calling it `.mjs` is inaccurate.
- Update all catalog npm scripts in `package.json` from `node bin/catalog.mjs` to `tsx bin/catalog.ts`. There are five scripts: `catalog`, `catalog:diff`, `catalog:add`, `catalog:update`, `catalog:sync`.
- `bin/init.mjs` is unaffected (it only uses Node builtins, no TS imports). Leave it as-is.

**Part 2: Environment variable access.**
- Change `src/lib/stripe/client.ts` to use `process.env.STRIPE_SECRET_KEY` instead of `import.meta.env.STRIPE_SECRET_KEY`.
- Rationale: `process.env` works in both Vite/Astro (Astro loads `.env` into `process.env` for server-side code) and plain Node.js. `import.meta.env` is Vite-only. Since this is a server-side secret key, the Astro convention of `import.meta.env` adds no value here (no tree-shaking benefit, no client-side relevance).
- Update `tests/unit/stripe/client.test.ts` to mock `process.env.STRIPE_SECRET_KEY` instead of `import.meta.env.STRIPE_SECRET_KEY`. The existing tests mock `import.meta.env`, so they need to switch to `process.env` mocking (e.g., `vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_xxx')` or direct `process.env` assignment in beforeEach/afterEach).

**Verification:** `npm run catalog:diff` should either print sync status or fail with a meaningful Stripe auth error ("STRIPE_SECRET_KEY is not set"), NOT a module resolution crash.

---

### 2. Description Sync Creates Infinite Update Loop

**Location:** `src/lib/stripe/sync.ts:101`, `src/lib/stripe/sync.ts:135`

**Problem:** When catalog has `description: null` and Stripe previously had a description, `catalogUpdate` sets Stripe description to `''` (via `product.description ?? ''`). On the next sync, `readStripeState` reads `''` from Stripe, and `catalogDiff` compares `'' !== null`, flagging another update. This repeats every sync run indefinitely.

**Evidence:** `'' !== (null ?? null)` -> `true` every time.

**Solution:** Normalize empty string to null in `readStripeState`:
```typescript
description: product.description || null,
```
This treats Stripe's `''` and `null` as semantically equivalent ("no description"), which is correct for this system. The diff then compares `null !== null` and sees no change.

**Verification:** Add test to `sync.test.ts`: Stripe product with `description: ''` and catalog product with `description: null` should produce zero diff entries.

---

## HIGH

### 3. No Error Recovery in Stripe Write Operations

**Location:** `src/lib/stripe/sync.ts:109-132` (catalogAdd), `src/lib/stripe/sync.ts:140-178` (catalogUpdate)

**Problem:** If a Stripe API call fails mid-sequence (e.g., product created but `prices.create` fails), orphaned objects are left in Stripe with no cleanup. These orphaned products lack `default_price`, so `readStripeState` skips them. They become invisible to subsequent syncs, and the SKU would be treated as "new" again, creating duplicates.

**Solution (three parts):**

**Part 1: Global retry wrapper.**
Add a retry utility for all Stripe API calls. 3 attempts, exponential backoff. Lives near `src/lib/stripe/client.ts`. This handles transient network failures and rate limits globally, preventing most orphan scenarios before they start.

**Part 2: Self-healing for incomplete products.**
Expand `readStripeState` to track products that have SKU metadata but no `default_price`. Return an additional field:
```typescript
{
  state: Map<string, StripeProductState>,     // complete products (has price)
  incompleteSkus: Map<string, string>,        // sku -> productId (no price)
}
```
In `catalogAdd`, before calling `stripe.products.create`, check `incompleteSkus`. If the SKU exists, reuse the existing Stripe product ID and skip product creation. Continue with price, payment link, and metadata update as normal. This means re-running sync after a failure automatically finishes the job instead of creating duplicates. The `products.update` call at the end of the flow already overwrites all metadata, so even stale orphans get corrected.
```typescript
let productId: string;
if (incompleteSkus.has(entry.sku)) {
  productId = incompleteSkus.get(entry.sku)!;
  console.log(`[Sync] Resuming incomplete product: ${entry.sku}`);
} else {
  const product = await stripe.products.create({...});
  productId = product.id;
}
// rest of flow unchanged: create price, create payment link, update product
```

**Part 3: Error logging with context.**
Wrap each product's creation sequence in `catalogAdd` in a try/catch. On exhausted retries, log what succeeded and what failed, including the Stripe product ID. Then abort. The next sync run will pick up the incomplete product via Part 2 and finish it.

Note: `catalogUpdate` needs the same retry coverage (Part 1) but doesn't have the orphan problem since it operates on existing products.

**Verification:**
- Test retry wrapper: mock a Stripe call that fails twice then succeeds, verify 3 attempts made.
- Test self-healing: `readStripeState` with a product that has SKU metadata but no `default_price` populates `incompleteSkus`. `catalogAdd` reuses the product ID and skips `products.create`.
- Test error context: when `prices.create` throws after retries exhausted, error message includes the Stripe product ID.

---

### 4. Image Filename Silently Misattributed for Hyphenated SKUs

**Location:** `src/lib/catalog/images.ts:14-22` (parseImageFilename)

**Problem:** Parser uses `lastIndexOf('-')` to split SKU from order number. For SKU `ABC-123`, the file `ABC-123.jpg` (without explicit order suffix) parses as SKU `ABC`, order `123`. The image is silently copied to public/ but attributed to the wrong product.

**Evidence:** `parseImageFilename('ABC-123.jpg')` -> `{ sku: 'ABC', order: 123 }`

**Solution: Redesign image filename parsing to support both ordered and unordered images.**

Currently `parseImageFilename` is a pure function that splits on the last hyphen and requires a numeric order suffix. This rejects valid use cases (`SKU.jpg`, `SKU-front.jpg`) and silently misattributes others (`ABC-123.jpg` parsed as SKU `ABC` order 123).

The new model introduces two categories of image files per SKU:

- **Ordered:** filename ends in a number after the last hyphen (`SKU-1.jpg`, `SKU-2.jpg`). Sorted by that number.
- **Unordered:** filename matches a catalog SKU but doesn't end in a valid order number (`SKU.jpg`, `SKU-front.jpg`, `SKU-mockup.jpg`). Sorted alphabetically. Appended after all ordered images.

Final image list per SKU: ordered images first (by number), then unordered images (alphabetically by filename).

Examples:
```
WIDGET-1.jpg          -> ordered (1)
WIDGET-2.jpg          -> ordered (2)
WIDGET-lifestyle.jpg  -> unordered
WIDGET-mockup.jpg     -> unordered
Final: [WIDGET-1, WIDGET-2, WIDGET-lifestyle, WIDGET-mockup]

WIDGET.jpg            -> unordered (single image, no special case needed)
Final: [WIDGET]

WIDGET.jpg            -> unordered
WIDGET-1.jpg          -> ordered (1)
Final: [WIDGET-1, WIDGET]
```

**Implementation changes:**

1. Change `parseImageFilename` to accept `catalogSkus: Set<string>` and return a new shape:
   ```typescript
   { sku: string; order: number | null }
   // order is null for unordered images
   ```

2. Resolution order for each image file (most specific match wins):
   - Full filename (minus extension) exactly matches a catalog SKU? **Unordered image.** (Catches hyphenated SKUs like `ABC-123` before the split can misattribute them.)
   - Last-hyphen split: prefix is a catalog SKU and suffix is a valid order number? **Ordered image.**
   - Last-hyphen split: prefix is a catalog SKU and suffix is NOT a number? **Unordered image.**
   - No match: skip with warning.

3. Change `loadProductImages` to accept the catalog SKU set and pass it to `parseImageFilename`.

4. `getListings` passes `new Set(catalog.map(p => p.sku))` to `loadProductImages`.

5. Sorting within `loadProductImages`: group by SKU, then ordered entries first (sorted by order number), then unordered entries (sorted alphabetically by filename).

**Verification:**
- Test: `SKU-1.jpg` + `SKU-mockup.jpg` -> ordered first, then unordered.
- Test: `SKU.jpg` alone -> single unordered image, no warning.
- Test: `ABC-123.jpg` with SKU `ABC-123` in catalog -> unordered image for `ABC-123`, NOT order 123 for `ABC`.
- Test: `ABC-123.jpg` with neither `ABC` nor `ABC-123` in catalog -> skipped with warning.
- Test: `SKU-front.jpg` + `SKU-detail.jpg` -> alphabetical order (detail before front).

---

### 5. Sync Only Handles Storefront Products; Order Sheet Products Ignored

**Location:** `src/lib/stripe/sync.ts:96-108` (catalogDiff), `src/lib/stripe/sync.ts:109-132` (catalogAdd)

**Problem:** `catalogDiff` filters to `storefront: true` products only. Products marked `storefront: false` (order sheet products) are never synced to Stripe. But order sheet products still need to exist in Stripe as Products with Prices so sellers can build manual invoices/checkout sessions for wholesale buyers. The CSV is the source of truth for the entire catalog, not just the storefront.

A secondary symptom: any order sheet product that already exists in Stripe is reported as "orphaned," which is misleading since it's a known product the user deliberately marked as non-storefront.

**Solution: Sync ALL catalog products to Stripe. Conditionally skip Payment Link creation for non-storefront products.**

1. Remove the `storefront` filter from `catalogDiff`. Diff all catalog products against Stripe state, not just storefront ones. The `storefront` flag is a presentation concern (what goes on the website), not a Stripe concern (what exists as a product).

2. In `catalogAdd`, check `product.storefront`:
   - `storefront: true`: create Product, Price, Payment Link. Write Payment Link URL back to CSV. (Current behavior.)
   - `storefront: false`: create Product, Price. Skip Payment Link creation. No write-back needed.

3. In `catalogUpdate`, same logic: if a price change triggers Payment Link recreation, only do it for storefront products.

4. `orphaned` now means what it says: a SKU exists in Stripe but not in the CSV at all. No ambiguity, no new diff categories needed.

5. Update `catalog-cli.ts` diff output to indicate product type:
   ```
   New products (2):
     + CANDLE-01: Soy Candle — $19.99 (storefront)
     + BULK-50: Bulk Candles — $150.00 (order sheet)
   ```

**Verification:**
- Test: `catalogDiff` with `storefront: false` product not in Stripe -> appears in `toAdd`.
- Test: `catalogAdd` with `storefront: false` product -> creates Product and Price, does NOT create Payment Link.
- Test: `catalogUpdate` with `storefront: false` product price change -> creates new Price, does NOT create Payment Link.
- Test: order sheet product exists in Stripe and CSV -> not orphaned.

---

### 6. catalog-cli.ts Has Zero Tests and Is Excluded from Coverage

**Location:** `vitest.config.ts:8`, `src/lib/stripe/catalog-cli.ts`

**Problem:** The CLI orchestrator is the composition layer that ties everything together. It's excluded from coverage enforcement and has no tests. The Critical CLI execution bug (#1) proves this gap: any smoke test would have caught it.

**Solution:** Remove `src/lib/stripe/catalog-cli.ts` from the coverage exclude list in `vitest.config.ts`. Write tests for `runCatalogSync` in a new `tests/unit/stripe/catalog-cli.test.ts` covering:
- `diff` mode: logs new/update/orphan counts, does not call Stripe write APIs
- `add` mode: calls `catalogAdd`, writes payment links back to CSV
- `update` mode: calls `catalogUpdate`, writes payment links back to CSV
- `sync` mode: calls both `catalogAdd` and `catalogUpdate`
- Orphan warnings are logged in all modes except `diff` (which handles its own output)
- "Everything is in sync" message when no changes

All Stripe calls and catalog I/O should be mocked at the module level (same pattern as existing tests).

**Verification:** `catalog-cli.ts` appears in coverage report at 100%.

---

## MEDIUM

### 7 & 10. Redesign Product Override Model (consolidates original #7 and #10)

**Location:** `src/lib/catalog/overrides.ts`, `src/lib/catalog/types.ts`, `src/lib/storefront/get-listings.ts`, `src/lib/storefront/types.ts`

**Problem (original #7):** Two `.md` files referencing the same SKU: last one alphabetically wins, no warning.

**Problem (original #10):** Only frontmatter fields (`description`, `image_alt`) are extracted. Markdown body content is silently dropped.

**Root cause:** The override model conflates metadata (belongs in CSV) with rich content (belongs in markdown). `description` exists as both a CSV column and a frontmatter field, creating ambiguity about which wins. `image_alt` is a single string for the product, but products have multiple images that each need their own alt text.

**Solution: Redesign the override model with clear separation of concerns.**

The markdown file has three things:
1. `sku` in frontmatter (required, identifies the product)
2. `image_alts` in frontmatter (optional, maps image filenames to alt text)
3. Markdown body is the rich description (optional, website only)

Example override file:
```markdown
---
sku: CANDLE-01
image_alts:
  CANDLE-01-1.jpg: A lit soy candle on a wooden table
  CANDLE-01-detail.jpg: Close-up of the wick and wax texture
---

Hand-poured in small batches using 100% natural soy wax.
Each candle burns for approximately 40 hours.
```

**Description separation:**
- CSV `Description` column: plain text. Used for Stripe product description, order forms, meta tags. This is what `catalog:sync` sends to Stripe.
- Markdown body: rich content. Used on the storefront website only. Overrides the CSV description for website display. Does NOT go to Stripe.

**Image alt text:**
- `image_alts` is a map of image filename to alt text string.
- Images with an entry get that alt text.
- Images without an entry get empty alt (blank, not product name).
- If no markdown file exists for a SKU, all image alts are blank.

**Build logging:**
When a product's description is overridden by a markdown file, log during build:
```
[Catalog] CANDLE-01: using rich description from products/soy-candle.md (CSV description still used for Stripe)
```

**Duplicate SKU warning:**
If two `.md` files reference the same SKU, warn and use the last one alphabetically:
```
[Catalog] Warning: products/candle-v2.md: duplicate override for SKU "CANDLE-01" (already defined in products/soy-candle.md) — using this one
```

**Type changes:**

```typescript
// ProductOverride (updated)
interface ProductOverride {
  sku: string;
  description: string | null;          // from markdown body, not frontmatter
  imageAlts: Map<string, string>;      // filename -> alt text
}
```

The `Listing` type needs to carry per-image alt text. Images change from `string` (URL) to structured objects, or the listing carries the image alt map alongside the image URLs. Exact shape TBD during implementation, but the data flow is: `loadProductOverrides` returns the map, `getListings` pairs each image URL with its alt text from the map.

**Implementation changes to `loadProductOverrides`:**
1. Remove `description` and `image_alt` from frontmatter parsing.
2. Add `image_alts` frontmatter parsing (validate it's an object with string values).
3. Parse `content` from `gray-matter` as the rich description (trim whitespace, null if empty).
4. Track source filenames to enable duplicate SKU warnings.

**Verification:**
- Test: markdown body becomes `description` in override.
- Test: `image_alts` map parsed from frontmatter correctly.
- Test: missing `image_alts` defaults to empty map.
- Test: image with no alt entry gets empty string.
- Test: duplicate SKU in two files logs warning, last file wins.
- Test: build log shows which products have overridden descriptions.
- Test: CSV description is still used for Stripe sync (unchanged by override).

---

### 8. Old Stripe Prices Left Active After Update

**Location:** `src/lib/stripe/sync.ts:149-158`

**Problem:** Price change creates a new Price and deactivates the old Payment Link, but leaves the old Price active. Over time this accumulates orphaned active Prices in the Stripe dashboard.

**Solution:** After creating the new price and before updating the product, deactivate the old price:
```typescript
await stripe.prices.update(entry.existing.priceId, { active: false });
```

**Verification:** Test that `prices.update` is called with the old price ID and `{ active: false }` when a price change occurs.

---

### 9. Hardcoded Currency ('usd') in Entry Points

**Location:** `src/lib/stripe/catalog-cli.ts:7`, `src/lib/storefront/get-listings.ts:5`

**Problem:** Underlying functions accept `currency` as a parameter, but both entry points hardcode `'usd'`. Compounding decision: each new integration point that hardcodes currency increases the blast radius of making it configurable later.

**Solution:** Define a single `DEFAULT_CURRENCY` constant in one place (e.g., `src/lib/storefront/pricing.ts` since that's where all currency logic lives). Both `catalog-cli.ts` and `get-listings.ts` import and use this constant instead of their own hardcoded `'usd'` strings. No config field yet. When multi-currency support is added later, this constant becomes the fallback default and the config field provides the override. One change, one place.

**Verification:** Grep the codebase for hardcoded `'usd'` strings. Only `pricing.ts` should define it. All other files import it.
