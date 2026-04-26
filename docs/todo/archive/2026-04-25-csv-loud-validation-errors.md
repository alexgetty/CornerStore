# Catalog: CSV validation errors are silent

## Source

Red team review, 2026-04-25.

## Problem

`loadCatalog()` returns only valid rows and `console.log`s the rest as warnings. The function does not throw, the process does not exit non-zero, and there is no test that loads a malformed CSV.

**Location:** `src/lib/catalog/csv.ts:112-128`

```ts
const { products, errors } = validateRows(records);

for (const e of errors) {
  console.log(`[Catalog] Warning: Row ${e.row}, ${e.field}: ${e.message} — skipped`);
}

return products;  // returns only valid rows; errors are merely logged
```

Real-world impact for a single-operator wholesale storefront:

- Edit `products/catalog.csv`, accidentally type `"Price: $50"` instead of `50` in 15 rows.
- `loadCatalog()` returns a 35-product catalog instead of the expected 50.
- Storefront silently shows 35 products. Checkout server's cached catalog also has 35.
- No build break, no deploy break. The gap is only noticeable when a buyer asks where a SKU went.
- Worse: `bin/catalog.ts` Stripe sync may interpret missing CSV rows as discontinued and archive them in Stripe.

This compounds with the catalog cache staleness issue (separate problem) — once the truncated catalog is in memory, a restart is required to recover even after the CSV is fixed.

## Fix

Two-mode behaviour:

- **Strict mode (default in production):** if `errors.length > 0`, throw a `CatalogValidationError` with a structured list of failures. Caller (handler, sync CLI, build) decides whether to abort.
- **Lenient mode (opt-in for local dev):** keep current skip-and-log behaviour, gated by `CORNER_STORE_CATALOG_LENIENT=1` or an explicit option arg to `loadCatalog`.

Update call sites:
- `bin/catalog.ts` (sync CLI): strict. Refuse to push a partial catalog to Stripe.
- `createCheckoutHandler`: strict. Refuse to start serving with a broken catalog.
- Astro static build (storefront listings): strict. Better to break the build than to silently ship a truncated storefront.

## Test

Add `tests/unit/catalog/csv-validation.test.ts`:

- Malformed row → strict mode throws with all errors enumerated.
- Malformed row → lenient mode returns valid rows + warnings (current behaviour).
- All-valid CSV → both modes identical.

Add a fixture `tests/fixtures/catalog-malformed.csv` with several distinct error types (bad price, missing sku, invalid moq, wrong column count).

## Severity

High. The CSV is the source of truth for the entire catalog. Silent truncation of the source of truth is a category of bug we do not get to ship.
