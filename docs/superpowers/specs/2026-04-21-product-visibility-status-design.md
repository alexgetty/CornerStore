# Product Visibility & Status Design

## Problem

Three overlapping fields control product visibility and availability: `storefront: boolean`, `orderSheet: boolean`, and `status: string | null`. `orderSheet` is dead code. `storefront` gates both site rendering and Stripe sync. `status` is displayed but has no behavioral effect on the cart.

## Design

Two orthogonal concerns, two columns.

### Hidden (Visibility)

- **CSV column:** `Hidden`
- **Type:** `boolean` on `CatalogProduct`
- **Parsing:** `true`/`yes` = hidden, everything else (including empty) = visible. Matches `featured` parsing pattern.
- **Effect:** Hidden products are excluded from `getListings()` and from Stripe sync entirely. They exist only as rows in the CSV.
- **Does not appear on `Listing` type.** Hidden products never become Listings.

### Status (Availability)

- **CSV column:** `Status` (unchanged)
- **Type:** `string | null` on `CatalogProduct` and `Listing` (unchanged)
- **Parsing:** Unchanged. Empty = `null`, any string value preserved as-is.
- **Effect:** Non-null status replaces the "Add to Cart" button with a disabled button displaying the status text (e.g. "Sold Out", "Coming Soon", "Seasonal"). Product still renders on the site and still syncs to Stripe.

### Removed Fields

- `storefront: boolean` removed from `CatalogProduct` type, CSV parsing, and all references.
- `orderSheet: boolean` removed from `CatalogProduct` type, CSV parsing, and all references.
- `Storefront` and `Order Sheet` CSV columns no longer parsed.
- `orderSheet` legacy fallback in `config.ts` removed.

## Changes by Layer

### Data Layer

- `CatalogProduct`: remove `storefront`, `orderSheet`. Add `hidden: boolean`.
- `Listing`: no changes.
- `csv.ts` (`parseRow`): remove `Storefront`/`Order Sheet` parsing. Add `Hidden` column parsed as `hidden: hiddenVal === 'true' || hiddenVal === 'yes'`.

### Filtering

- `getListings()`: filter changes from `p.storefront` to `!p.hidden`.

### Stripe Sync

- Filter hidden products out at the top of the sync pipeline, before `catalogDiff()`. Downstream functions never see hidden products.
- Remove all `product.storefront` checks from `catalogDiff()`, `catalogAdd()`, `catalogUpdate()`.
- Remove `storefront` display label in `catalog-cli.ts`.

### Config

- Remove `orderSheet` fallback in `config.ts` (line 50).

### UI: ListingCards

- Remove the `.cs-listing-status` span from the details section.
- When `listing.status` is non-null, render a disabled button with the status text instead of "Add to Cart":
  ```astro
  {listing.status ? (
    <button type="button" class="cs-listing-add" disabled aria-label={`${listing.name}: ${listing.status}`}>{listing.status}</button>
  ) : (
    <button type="button" class="cs-listing-add" aria-label={`Add ${listing.name} to cart`}>Add to Cart</button>
  )}
  ```
- Remove `.cs-listing-status` CSS rule.
- Add `.cs-listing-add:disabled` style: muted appearance, `cursor: not-allowed`.

### UI: ListingTable

- When `listing.status` is non-null, disable/hide the quantity controls and show status text instead.

### Client-side JS: Listings

- `listings.ts`: no changes needed for disabled buttons (disabled buttons don't fire click events). Add guard check to skip quantity input wiring for rows with disabled buttons.

### Cart: Unavailable Item Handling

Two categories of unavailable items in the cart:

1. **Hidden products:** SKU exists in localStorage cart but has no matching `<tr>` in the cart table (hidden products are excluded from `getListings()` at build time, so no row is rendered).
2. **Status products:** SKU has a matching row, but the product has a non-null status (e.g. "Sold Out"). Row exists and carries a `data-status` attribute.

#### Cart.astro Changes

- Add a `data-status` attribute to each cart row: `data-status={listing.status ?? ''}`. This lets cart JS identify status products.
- Add a banner element (hidden by default) above the cart table for unavailable item notices.

#### cart.ts: On Page Load

During `hydrateFromCart()`:

- Detect unavailable items:
  - **Hidden:** cart SKUs with no matching row in `rowMap`.
  - **Status:** cart rows where `data-status` is non-empty.
- If any unavailable items exist:
  - Show the banner listing each unavailable item by name (for status items, pull name from the row; for hidden items, use the SKU since no row exists to read a name from).
  - Grey out status product rows: add a `.cs-cart-unavailable` class that mutes the row and disables its quantity controls.
  - Exclude unavailable items from subtotal calculation.

#### cart.ts: On Checkout Click

Before firing the checkout request:

- Check for unavailable items (same detection as above).
- If any exist, show a native `confirm()` dialog listing them: "These items are no longer available and will be removed from your order: [list]. Continue with remaining items?"
- On confirm: proceed with checkout, sending only available items.
- On cancel: do nothing, return to cart.

#### CSS

- `.cs-cart-unavailable`: greyed out row style (reduced opacity, no pointer events on controls).

### Tests

- Update `CatalogProduct` test helpers to use `hidden` instead of `storefront`/`orderSheet`.
- Test `hidden: true` products are excluded from `getListings()`.
- Test status-based button disabling in component tests if applicable.
- Test CSV parsing of `Hidden` column with `true`, `yes`, `no`, empty, and absent values.
- Test cart unavailable item detection for both hidden SKUs (no matching row) and status SKUs (non-empty `data-status`).
- Test that unavailable items are excluded from subtotal.
- Test checkout confirmation flow with unavailable items.

### Init Script

- Update `bin/init.mjs` to scaffold `Hidden` column instead of `Storefront`/`Order Sheet` in the sample CSV.
