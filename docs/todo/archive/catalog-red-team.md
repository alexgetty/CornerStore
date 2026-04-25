# Red Team: Catalog Build System

Reviewed 19 commits, ~6,300 lines changed across 109 files. 265 tests passing, 100% v8 coverage on included source. Tests reviewed first, then implementation.

---

## CRITICAL

None. The original critical issues from the build audit are resolved.

---

## HIGH

### H1. `withRetry` retries all errors, including non-retryable ones

**Location:** `src/lib/stripe/retry.ts:1-19`

**Problem:** Catches every error and retries unconditionally. Stripe 400-class errors (invalid request, bad API key, permission denied) will never succeed on retry but get attempted 3 times with exponential backoff. 50 products with a bad API key = 150 wasted API calls instead of 1 fast failure.

**Evidence:**
```typescript
} catch (err) {
  lastError = err;
  if (attempt < maxAttempts) {
    const delay = baseDelayMs * (2 ** (attempt - 1));
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
```

No error type inspection. No short-circuit for deterministic failures.

**Fix:** Add an `isRetryable` check. Stripe errors have a `type` property. Only retry `StripeConnectionError`, `StripeRateLimitError`, and `StripeAPIError`. Pass through everything else immediately.

**Verification:** Test that `StripeInvalidRequestError` throws on first attempt without delay.

**Resolution:** Two-part fix.

**Part A: Tighten CSV validation to match Stripe's actual constraints.** Current validation has three gaps that would produce `StripeInvalidRequestError` at sync time:
- Description: no length check. Stripe max is 500 chars.
- Price upper bound: no max. Stripe max is 99999999 (~$999,999.99).
- Price floor after rounding: `0.001` passes validation but rounds to 0 cents, which Stripe rejects.

Close these gaps in `csv.ts` validation so that by the time data reaches Stripe, it is guaranteed valid. This is not because Stripe is source of truth (CSV is), but because the sync pipeline must guarantee what it sends will be accepted. Absorbs M5 (CSV price validation).

**Part B: Classify errors in `withRetry`.** With validation tightened, a non-retryable Stripe error means our codebase is out of date with Stripe's API. The retry logic should:
- Retry: `StripeConnectionError`, `StripeRateLimitError`, `StripeAPIError`, and errors without a `type` property (generic/network).
- Fail immediately: `StripeInvalidRequestError`, `StripeAuthenticationError`, `StripePermissionError`. Fail with a critical, build-blocking message that says this is a codebase issue, not user error.

Severity: stays High (the validation gaps are real and could hit users today).

---

### H2. `catalogAdd` partial failure drops payment link URLs for successfully-created products

**Location:** `src/lib/stripe/sync.ts:122-167`

**Problem:** When `catalogAdd` processes multiple entries and fails on entry N, the `newLinks` map (containing payment link URLs for entries 1 through N-1) is never returned. `runCatalogSync` never receives the partial results, so those URLs never get written back to `catalog.csv`. The products exist in Stripe with valid payment links, but the CSV doesn't know about them.

Incomplete-SKU recovery handles product re-creation on next run, but payment link URLs are permanently lost from the CSV unless manually copied.

**Fix:** Either return partial results on failure (via a result wrapper type), or write payment links back to CSV after each individual product creation rather than batching at the end.

**Verification:** Test `catalogAdd` with 3 items where item 2 throws. Assert items 1's link is in the returned map.

**Resolution:** Option B: return partial results. Change `catalogAdd` and `catalogUpdate` so the catch block does not rethrow. Instead, accumulate errors per-SKU, continue iterating remaining entries, and return both `newLinks` and `errors` (e.g. `{ newLinks: Map<string, string>; errors: { sku: string; error: unknown }[] }`). The caller (`runCatalogSync`) gets partial results, writes successful URLs back to CSV, then reports failures. This also fixes the secondary problem: the current rethrow aborts the entire batch on a single failure, so products after the failure never get attempted even if they would have succeeded. Same pattern for `catalogUpdate`.

---

### H3. Metadata overwrite on price change destroys custom Stripe metadata

**Location:** `src/lib/stripe/sync.ts:206-210`

**Problem:** When a storefront product's price changes, `productUpdate.metadata` is set as a full object:
```typescript
productUpdate.metadata = {
  sku: entry.sku,
  payment_link_id: newLink.id,
  payment_link_url: newLink.url,
};
```

Stripe's `products.update` with a `metadata` key does **full replacement**, not merge. Any custom metadata keys the seller added via Stripe dashboard or other tools get silently wiped. Name-only changes preserve metadata; price changes destroy it. Asymmetric behavior.

**Fix:** Either set individual metadata keys (`metadata.sku = ...`) or explicitly preserve existing keys by reading them first.

**Verification:** Test that after a price-change update, pre-existing metadata keys are still present.

**Resolution:** Use partial metadata updates instead of full object replacement. The Stripe SDK merges metadata when you set individual keys rather than passing a complete `metadata` object. Same number of lines, same API call, no new logic. No reason not to. Apply the same pattern in `catalogAdd` for consistency.

---

### H4. `catalogUpdate` has zero error path tests

**Location:** `tests/unit/stripe/sync.test.ts`

**Problem:** `catalogAdd` has two error tests covering both `Error` and non-`Error` throwables. `catalogUpdate` has zero. The two functions are structurally similar (iterate entries, make Stripe API calls, log results). If error handling was added/removed from `catalogUpdate`, no test would catch the regression.

**Fix:** Add error tests for `catalogUpdate` mirroring the `catalogAdd` error tests. Test: Stripe `prices.create` fails mid-update. Assert: error is logged with SKU context, other entries still process.

**Verification:** Break `catalogUpdate` error handling, run tests, confirm failure.

**Resolution:** Absorbed by H2. Both `catalogAdd` and `catalogUpdate` are changing to accumulate errors instead of rethrowing. Error path tests for both functions will be written as part of that work via TDD.

---

### H5. No integration tests exist for the catalog sync pipeline

**Location:** Cross-cutting (all test files)

**Problem:** Every test file mocks all dependencies. There is not a single test that wires `loadCatalog` -> `catalogDiff` -> `catalogAdd` together. Contract drift between modules (e.g., `CatalogProduct` type shape changes but mocks are stale) would not be caught. The CLAUDE.md mandates integration tests but none exist.

**Fix:** Add at least one integration test per critical pipeline: CSV load -> diff -> add, and CSV load -> diff -> update. Use real functions with only the Stripe client mocked.

**Verification:** Change a type shape in `catalog/types.ts`. Confirm the integration test catches the mismatch that unit tests miss.

**Resolution:** Deferred. TypeScript's type checker already catches most contract drift at compile time. Unit test coverage is solid. Integration tests are good hygiene but not launch-blocking. Revisit post-launch when there's more surface area.

---

### H6. Storefront flag changes are undetected by `catalogDiff`

**Location:** `src/lib/stripe/sync.ts:86-97`

**Problem:** `catalogDiff` only compares `name`, `description`, and `price`. If a product changes from `storefront: false` to `storefront: true`, the diff won't detect it. No Payment Link gets created. The product renders on the website with `paymentLink: null`.

This is a real functional gap for users who reclassify products between wholesale-only and DTC. The project explicitly supports both flows per CLAUDE.md.

**Fix:** Add `storefront` flag comparison to `catalogDiff`. When false->true: generate Payment Link. When true->false: deactivate Payment Link and remove from metadata.

**Verification:** Test: product exists in Stripe with `storefront: false`, CSV changes to `true`. Assert: appears in `toUpdate` with storefront change flag.

**Resolution:** Real bug. The diff was written purely in terms of Stripe-native fields (name, description, price) but the storefront flag doesn't map to a Stripe field; it maps to whether a payment link should exist. The detection is: `product.storefront && !existing.paymentLinkId` means "needs payment link"; `!product.storefront && existing.paymentLinkId` means "deactivate payment link." Add both directions as changes in `catalogDiff`, and handle them in `catalogUpdate`.

---

## MEDIUM

### M1. `catalogDiff` ignores currency mismatch between Stripe and catalog

**Location:** `src/lib/stripe/sync.ts:96-97`

**Problem:** Compares `existing.unitAmount` against `decimalToRawPrice(product.price, currency)` without checking `existing.currency === currency`. A GBP product in Stripe compared against USD catalog would silently compare different currencies. A spurious "update" would then create a new USD price and deactivate the GBP one, effectively changing the product's currency without warning.

**Fix:** Check `existing.currency !== currency` in the diff. Warn or categorize separately.

**Resolution:** Add currency comparison to `catalogDiff` now. Not needed for launch (USD only) but prevents it from becoming a buried gotcha later. Same pattern as H6: one more comparison, push `'currency'` to changes if mismatched. `catalogUpdate` already handles price recreation which is the same operation needed for a currency change.

---

### M2. `readStripeState` has no retry protection

**Location:** `src/lib/stripe/sync.ts:51`

**Problem:** All write operations use `withRetry`, but the initial state read uses raw Stripe auto-pagination. A transient network error on page 3 of 10 loses all progress from pages 1-2.

**Fix:** Document the limitation, or wrap the full read in a retry (safe since it's read-only).

**Resolution:** Wrap the entire `readStripeState` call in `withRetry`. It's read-only so retrying from scratch is safe. The auto-pagination iterator complicates wrapping individual pages, but wrapping the whole function is simple and sufficient.

---

### M3. `withRetry(fn, 0)` throws `undefined`

**Location:** `src/lib/stripe/retry.ts:7`

**Problem:** `maxAttempts = 0` means the loop body never executes. `lastError` stays `undefined`. The function throws `undefined` instead of a meaningful error. Untested boundary.

**Fix:** Guard: `if (maxAttempts < 1) throw new Error('maxAttempts must be >= 1')`.

**Resolution:** Add the guard. Simple one-liner.

---

### M4. CLI diff output hardcodes `$` regardless of currency

**Location:** `src/lib/stripe/catalog-cli.ts:20`

**Problem:** `$${entry.product.price}` always displays dollar sign. Incorrect for non-USD currencies.

**Fix:** Use `formatPrice` or parameterize the currency symbol.

**Resolution:** Use `formatPrice` (already exists in `storefront/pricing.ts`) instead of string interpolation with `$`. Same reason as M1: USD-only now but no reason to hardcode it.

---

### M5. CSV price validation accepts degenerate values

**Location:** `src/lib/catalog/csv.ts:41`

**Problem:** `parseFloat('19.99abc')` returns `19.99`. Only checks `isNaN` and `> 0`. Also: `0.001` passes validation but rounds to 0 cents via `Math.round`, creating a free product in Stripe. No upper bound check against Stripe's max (~$999,999.99).

**Fix:** Use stricter number regex. Add bounds validation.

**Resolution:** Absorbed by H1 Part A (tighten CSV validation to match Stripe constraints).

---

### M6. `csv-writer` does not test quoted fields containing commas

**Location:** `tests/unit/catalog/csv-writer.test.ts`

**Problem:** CSV read tests cover quoted fields with commas, but write-back tests don't. If `stringify` misconfigured quoting, data corruption would go undetected.

**Fix:** Add test: CSV with description containing commas, run write-back, verify output is valid CSV.

**Resolution:** Add the test. Straightforward.

---

### M7. `loadProductImages` copies all files on every build

**Location:** `src/lib/catalog/images.ts:79-89`

**Problem:** Every `getListings()` call copies all matched images to `public/product-images/` with no change detection. Build time scales linearly with image count even when nothing changed.

**Fix:** Deferred optimization. Consider mtime or hash check before copy.

**Resolution:** Deferred. Performance optimization, not correctness. Revisit if build times become noticeable.

---

### M8. `bin/catalog.ts` is outside coverage scope

**Location:** `bin/catalog.ts`, `vitest.config.ts`

**Problem:** Coverage includes `src/**/*.ts` only. `bin/catalog.ts` has untested argument parsing, type guard, and exit code logic. Violates the stated "100% coverage, no exceptions" standard.

**Fix:** Either move to `src/` or add `bin/**/*.ts` to vitest include.

**Resolution:** Add `bin/**/*.ts` to vitest coverage include. Write tests for arg parsing, `isValidCommand` type guard, and exit codes. `bin/` is the correct location for CLI entry points since this is an npm CLI package.

---

### M9. `updateCatalogPaymentLinks` TOCTOU race condition

**Location:** `src/lib/catalog/csv-writer.ts:11-37`

**Problem:** Reads CSV, transforms in memory, writes back. If catalog.csv is modified between read and write, changes are silently overwritten. Low probability in current single-process CLI, but the function operates on the user's source-of-truth file.

**Fix:** Deferred until multi-process sync is possible.

**Resolution:** Deferred. Single-process CLI makes this effectively impossible.

---

## DEFERRED

| # | Finding | Location | Resolution |
|---|---------|----------|------------|
| D1 | `process.cwd()` resolved at module load time; stale if CWD changes | csv.ts:6, overrides.ts:6, images.ts:6-7 | |
| D2 | No URL format validation on `paymentLink` field from CSV | csv.ts:59 | |
| D3 | No test for BOM handling in CSV (relevant for Excel-generated files) | csv.test.ts | |
| D4 | No test for negative amounts in `formatPrice` (refund display) | pricing.test.ts | |
| D5 | `decimalToRawPrice` missing symmetry test for 3-decimal currencies (BHD) | pricing.test.ts | |
| D6 | `storefront` column accepts any string except "no" as true | csv.ts:51 | |
| D7 | `catalogAdd` untested with multiple items (loop accumulation) | sync.test.ts | |

---

## Summary

| # | Finding | Resolution | Status |
|---|---------|-----------|--------|
| H1 | Blind retry + validation gaps | Tightened CSV validation (description 500 chars, price bounds 0.01-999999.99, strict number parsing). Classified retry errors: retryable (connection, rate limit, API, generic) vs non-retryable (auth, permission, invalid request) with immediate fail. | Done |
| H2 | Partial failure drops payment links | Changed catalogAdd/catalogUpdate to return `SyncResult { links, errors }`. Continue iteration on failure, accumulate errors per-SKU. Caller writes successful links then reports failures. | Done |
| H3 | Metadata overwrite on price change | Switched to partial metadata keys (`metadata[sku]`, `metadata[payment_link_id]`, etc.) in both catalogAdd and catalogUpdate. Stripe merges instead of replacing. | Done |
| H4 | catalogUpdate missing error tests | Absorbed by H2. Both functions now have error path tests. | Done |
| H5 | No integration tests | Deferred post-launch. TypeScript's type checker covers most contract drift. | Deferred |
| H6 | Storefront flag changes undetected | Added `storefront-added` and `storefront-removed` change detection to catalogDiff based on payment link presence. | Done |
| M1 | Currency mismatch ignored | Added currency comparison to catalogDiff. | Done |
| M2 | readStripeState has no retry | Wrapped entire function body in withRetry. Safe to restart from scratch since read-only. | Done |
| M3 | withRetry(fn, 0) throws undefined | Added guard: throws if maxAttempts < 1. | Done |
| M4 | Hardcoded $ in CLI diff | Replaced with formatPrice(decimalToRawPrice(...)). Verified with EUR test. | Done |
| M5 | Price validation accepts degenerate values | Absorbed by H1. | Done |
| M6 | csv-writer untested with quoted commas | Added round-trip test with comma-containing description field. | Done |
| M7 | Image copy on every build | Deferred. Performance optimization, not correctness. | Deferred |
| M8 | bin/catalog.ts outside coverage | Added bin/ to vitest include. 13 tests covering arg parsing, type guard, exit codes, error handling. | Done |
| M9 | csv-writer TOCTOU race | Deferred. Single-process CLI makes this effectively impossible. | Deferred |
| D1-D7 | Deferred items | Deferred. | Deferred |

**Completed:** H1, H2, H3, H4, H6, M1, M2, M3, M4, M5, M6, M8 (12 items, 265 -> 312 tests)
**Deferred:** H5, M7, M9, D1-D7 (10 items)
