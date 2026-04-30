# Listing Table — Mobile Collapse

## Problem

`src/components/Listings/ListingTable.css` has no responsive treatment. The table renders six or seven columns (Image, Product, MOQ for wholesale, Qty stepper, Price, Total, Remove). At phone widths the stepper crowds the price/total numerals, the product name truncates uselessly, and the row either wraps awkwardly or horizontal-scrolls.

This is the same shape of problem `Cart.css` had pre-collapse. It was solved there with a `display: block` stack + `data-label` `::before` pattern at `(max-width: 40rem)`. Reference: `src/components/Cart/Cart.css` mobile block, and `tests/unit/components/cart-mobile-stack.test.ts` as the contract / test pattern.

## Scope

- Match the cart's 40rem breakpoint and stacking pattern. Each row collapses to a card, each `<td>` becomes a labeled flex row via `data-label`.
- Hit WCAG 2.5.5 (44px) for stepper buttons and remove. Reuse `--cs-cart-touch-target` or introduce an order-table equivalent.
- Hide the order table `<thead>` in the mobile collapse, same as the cart.
- Add tokens to `theme/theme.css` for any new card padding / row gap / card margin specific to the order table; otherwise reuse the `--cs-cart-mobile-*` family if the visual treatment matches.

## Out of scope

- Restructuring the columns themselves. The collapse pattern preserves the column model; it only changes how a narrow viewport renders it.

## Reference

- Mobile-cart implementation: `src/components/Cart/Cart.css` (`@media (max-width: 40rem)` block).
- Pattern docs in test header: `tests/unit/components/cart-mobile-stack.test.ts`.
- Mobile nav (sibling work, just shipped): `src/components/Nav/Nav.css` (`@media (max-width: 40rem)` block) and `tests/unit/components/nav-mobile-disclosure.test.ts`.
