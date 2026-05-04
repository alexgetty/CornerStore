# Catalog Diff — `metadata.sku` Mismatch Detection

## Status

Deferred.

## Note

`catalogDiff` in `src/lib/stripe/sync.ts:83-119` does not detect when a Stripe product's `metadata.sku` was manually edited to mismatch its `catalog.csv` SKU. When that happens, the diff treats the Stripe product as orphaned and the catalog row as new, resulting in a double-write (the orphan archives, the catalog row creates a fresh Stripe product).

No evidence this has happened in practice. Out of scope for the visibility refactor that surfaced it. Surface during any future pass on `src/lib/stripe/sync.ts`.

The fix would be: at `readStripeState` time, compare `product.metadata.sku` to the lookup key. Surface mismatches as a warning or a new change code, so the sync tool can prompt before the double-write.

## Source

Item D3 from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md`.
