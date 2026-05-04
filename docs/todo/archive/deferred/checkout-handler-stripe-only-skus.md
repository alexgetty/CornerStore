# Checkout Handler — Stripe-Only SKUs

## Status

Deferred.

## Note

`src/lib/cart/handler.ts` (the H5 server guard) rejects requests whose SKU is `hidden` or has a `status` set in `catalog.csv`. It does NOT reject SKUs that are present in Stripe state but absent from `catalog.csv` entirely. If a product exists in Stripe state but has been removed from the CSV, the handler still builds a line item by falling through to the existing Stripe-map lookup. The "Unknown SKU" error path only fires when the SKU is absent from BOTH sources.

Low impact today: catalog deletions also archive in Stripe via the sync tool. A Stripe-only SKU is a transient drift window, present only when sync is skipped or fails silently. Decide policy when next touching the handler.

The fix, if catalog becomes the sole source of truth for checkout: tighten `handler.ts` to reject any SKU not present in the catalog (return `Unavailable SKU` with a clear error). Otherwise document the current behavior as intentional.

## Source

Item D4 from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md`.
