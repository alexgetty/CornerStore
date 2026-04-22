# Product Visibility & Status Cleanup

## Problem

The current codebase has overlapping, partially-implemented concepts for product visibility and availability:

- `storefront: boolean` on `CatalogProduct`: vestigial from the old storefront-vs-order-sheet split. Used by `getListings()` to filter products. Should have been removed when storefront and catalog were merged.
- `orderSheet: boolean` on `CatalogProduct`: dead code. Order sheet feature was removed.
- `status: string | null` on `CatalogProduct`/`Listing`: exists in the type and is parsed from CSV, but nothing in the code acts on it.

## Intended Behavior

Two separate concerns need clean solutions:

1. **Visibility**: a way to hide a product from the storefront entirely (not rendered, not in listings).
2. **Availability (status)**: a way to display a product but disable add-to-cart. Any non-null status makes the product unavailable for purchase. The status value is displayed in the disabled add-to-cart button (e.g., "Sold Out", "Coming Soon", "Seasonal").

## Work Required

- Remove `storefront` and `orderSheet` booleans from `CatalogProduct` type and CSV parsing
- Define the visibility mechanism (new column? status-based? TBD)
- Implement status-based cart disabling in the UI
- Update tests, types, and any filtering logic
