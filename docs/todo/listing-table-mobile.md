# Listing Table — Mobile Collapse

## Problem

`src/components/Listings/ListingTable.css` has no responsive treatment. The table renders six or seven columns (Image, Product, MOQ for wholesale, Qty stepper, Price, Total, Remove). At phone widths the stepper crowds the price/total numerals, the product name truncates uselessly, and the row either wraps awkwardly or horizontal-scrolls.

The cart table previously had its own mobile-stack treatment (`display: block` + `data-label` `::before` at `max-width: 40rem`), but that was deleted as part of the cart/catalog row consolidation. Both surfaces now share the same row partial (`src/components/Listings/ListingRow.astro`) and the same desktop chrome (`src/components/Listings/ListingTable.css`). Whatever mobile treatment lands here covers BOTH the cart page and the catalog table view, by design.

## Scope

- A single mobile collapse pattern applied to `.cs-listing-table` so both the catalog (table view) and the cart inherit it.
- Hit WCAG 2.5.5 (44px) for stepper buttons and remove.
- Decide between the previous `data-label` stacked-card pattern and an alternative (e.g. simply hiding low-priority columns at narrow widths). The data-label approach was working for the cart but added attribute weight to every row; the new shared row currently does NOT carry `data-label` attributes.
- Add any new tokens to `theme/theme.css` for card padding / row gap / card margin if the data-label pattern is reintroduced.

## Out of scope

- Restructuring the columns themselves. The collapse pattern preserves the column model; it only changes how a narrow viewport renders it.

## Reference

- Shared row markup: `src/components/Listings/ListingRow.astro` and `src/components/Listings/ListingThead.astro`.
- Mobile nav (sibling work for breakpoint precedent): `src/components/Nav/Nav.css` (`@media (max-width: 40rem)` block) and `tests/unit/components/nav-mobile-disclosure.test.ts`.
