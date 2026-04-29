# Extract Cart Visibility Helper — Unify Widget and Cart Page Math

## Status

Open. H2 from the catalog-visibility red-team review.

## Problem

`src/components/CartWidget/cart-widget.ts` and `src/components/Cart/cart.ts` each compute cart item count and subtotal independently, and they disagree when unavailable items are in the cart.

Concrete discrepancy:
- User's cart (in localStorage) contains 2× a status-disabled SKU ($20 each) plus 3× an available SKU ($10 each).
- **Header widget** renders: badge = 5, subtotal = $70 (includes the status-disabled items because their price is still in the server-rendered `priceMap` — `getListings` filters only on `hidden`, not on `status`).
- **Cart page** renders: unavailable banner for the status SKU, row marked `.cs-cart-unavailable`, badge = N/A, subtotal = $30 (`getVisibleItems` filters `.cs-cart-unavailable` rows out).

For hidden SKUs the math coincidentally aligns on subtotal ($0 contribution — SKU isn't in `priceMap`) but the badge still counts the qty. Cart page count = 0, badge count = 2.

Two sources of truth for "what's in the cart" — trust breaks.

## Fix — extract a shared helper

Create a DOM-agnostic visibility helper that both consumers call. One definition of "visible cart item," one price/qty computation.

### Proposed helper

`src/lib/cart/visibility.ts` (new)

```ts
import type { CartItem } from './types.js';

export interface CartVisibilityInput {
  items: CartItem[];
  /** SKU → raw price (minor units). Absence ⇒ unknown/hidden SKU. */
  priceMap: Record<string, number>;
  /** SKUs that exist in listings but are status-disabled (unavailable). */
  disabledSkus: Set<string>;
}

export interface CartVisibilityResult {
  visibleItems: CartItem[];
  unavailableItems: CartItem[];
  itemCount: number;   // qty sum over visibleItems only
  subtotal: number;    // Σ(qty × priceMap[sku]) over visibleItems only
}

export function computeCartVisibility(input: CartVisibilityInput): CartVisibilityResult {
  // An item is visible iff priceMap has its sku AND disabledSkus does not contain it.
}
```

### Integration points

**1. `src/components/CartWidget/cart-widget.ts`** — replace inline reduce with helper call.
- Pass the helper `cart.items`, `prices` (from `data-prices`), and a new `disabledSkus` set.
- Requires CartWidget.astro to emit a `data-disabled-skus` attribute. Source: `listings.filter(l => l.status != null).map(l => l.sku)`.

**2. `src/components/CartWidget/CartWidget.astro`** — add `data-disabled-skus` JSON attribute alongside `data-prices`.
- Plumb through `Nav.astro` and `ContentPage.astro` (which already builds `priceMap` from `getListings()` at `src/layouts/ContentPage.astro:24-29`). Add a parallel `disabledSkus: string[]` prop next to `priceMap`.

**3. `src/components/Cart/cart.ts`** — replace DOM-based `getVisibleItems` (class-based filter on `.cs-cart-unavailable`) with the helper.
- The cart row currently derives name/qty/rawPrice from the DOM. That's brittle (flagged separately in M3). The helper takes structured inputs — migrate the cart page to read from the same server-provided `priceMap` + `disabledSkus` data attributes on the Cart.astro root element.
- The server already has this data; pass it through `Cart.astro` as `data-prices` / `data-disabled-skus`.

**4. `src/components/Cart/Cart.astro`** — add the same `data-prices` and `data-disabled-skus` attributes. Values come from props or resolved via `getListings` + priceMap helper in the page scope. Match whatever pattern is cleanest with ContentPage.

### Tests

Unit tests live in `tests/unit/cart/visibility.test.ts` (new). Cover:
- Empty cart → `{ visibleItems: [], unavailableItems: [], itemCount: 0, subtotal: 0 }`.
- All items available → all in visibleItems, correct count and subtotal.
- One hidden SKU (absent from priceMap) → in unavailableItems, excluded from count and subtotal. Remaining items still aggregate correctly.
- One status-disabled SKU (in priceMap, in disabledSkus) → same shape as hidden case.
- Both hidden and status-disabled present → both in unavailableItems.
- Zero price in priceMap (explicit 0, not missing) → item IS considered visible (price is known to be 0), contributes 0 to subtotal but 1+ to count.
- `priceMap` undefined / nullish values → treat as hidden.

After extraction, tests for widget and cart DOM behavior will come from the separate `cart-listings-test-coverage.md` todo. Those tests can mock or stub the helper; the helper itself stays pure and fully covered here.

## Related findings — don't merge but be aware

- **H4** (cart banner shows raw SKU for hidden items) — needs a SKU→name map for *all* products (including hidden). That's not the same as `priceMap` (which is listings-only). Keep H4 as its own work; this helper doesn't need the full product name map.
- **M3** (cart.ts reads from DOM `strong` textContent) — the cart.ts migration step in this todo (point 3 above) naturally resolves M3 if done right (read name/qty/price from data-attributes on the row, not DOM text content). Call it done as part of this work.
- **H6** (listings page silently hides cart qty for status SKUs) — might benefit from the same helper, but the listings page cares about a different view (qty indicator on a listing row). Don't pull it into this scope.

## Acceptance criteria

- `src/lib/cart/visibility.ts` exists with 100% branch coverage in `tests/unit/cart/visibility.test.ts`.
- `cart-widget.ts` imports and uses `computeCartVisibility`. No independent reduce logic remains in the widget.
- `cart.ts` uses `computeCartVisibility` for count/subtotal. The class-based `.cs-cart-unavailable` filter stays for visual state (CSS), but numerical computation comes from the helper.
- Manual verification matrix in a real browser (localStorage seeded, both pages loaded):
  - Available-only cart → widget and cart page agree on count and subtotal.
  - Hidden-SKU cart → widget shows 0/0; cart page shows the item in unavailable banner with 0 count.
  - Status-disabled-SKU cart → widget shows 0/0; cart page shows the row marked unavailable, 0 contribution to subtotal.
  - Mixed cart → widget and cart page agree; unavailable banner on cart page lists only the problematic SKUs.
- Export `computeCartVisibility` from `src/lib/cart/index.ts` barrel since it's now a public API surface (per CLAUDE.md: every barrel export is a public contract — add deliberately).

## Out of scope

- Changing status semantics (H-values, enum, etc.). Treat `status` as a truthy-string flag as today.
- The cart banner's name-vs-SKU display behavior — H4 owns that.
- Playwright / E2E tests. Leave for later.
- Refactoring `getListings` or `priceMap` construction. They're already correct for this purpose.

## Files you'll touch

- New: `src/lib/cart/visibility.ts`
- New: `tests/unit/cart/visibility.test.ts`
- Edit: `src/lib/cart/index.ts` (add export)
- Edit: `src/components/CartWidget/cart-widget.ts`
- Edit: `src/components/CartWidget/CartWidget.astro` (add `data-disabled-skus`)
- Edit: `src/components/Nav/Nav.astro` (new prop pass-through)
- Edit: `src/layouts/ContentPage.astro` (build `disabledSkus` alongside `priceMap`)
- Edit: `src/components/Cart/Cart.astro` (add `data-prices`, `data-disabled-skus` to root)
- Edit: `src/components/Cart/cart.ts` (replace getVisibleItems with helper; drop DOM-derived pricing)

## Non-goals / don't touch

- `src/lib/storefront/get-listings.ts` — no changes needed.
- Anything in `src/lib/stripe/` — Stripe sync is agnostic to cart visibility.
- `src/components/Listings/listings.ts` — H6 handles listings-side concerns.
