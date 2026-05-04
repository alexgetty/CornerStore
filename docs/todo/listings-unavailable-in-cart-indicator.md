# Listings — Surface Cart Qty on Status-Disabled Items

## Status

Open. H6 from the catalog-visibility red-team review.

## Problem

When a customer has items in their cart for a SKU that subsequently becomes status-disabled (e.g. "Sold Out"), the listings page hides the cart state entirely. Both views silently drop the cart quantity during hydration:

**Card view — `src/components/Listings/listings.ts` `hydrateCartControl`:**
```ts
const addBtn = control.querySelector<HTMLButtonElement>('.cs-cart-control-add');
// Disabled (status/unavailable) controls only have the disabled add button.
if (addBtn?.disabled) return;  // ← status-disabled cards exit here, qty never shown
```

**Table view — same `hydrateCartControl` path applies:**
```ts
// Status rows render <CartControl status=...> which emits a disabled <button>.
// hydrateCartControl bails on addBtn.disabled before reading the qty input,
// so the current-cart quantity never surfaces on those rows.
```

Result: a user who had 6 units in their cart before the product became "Sold Out" sees only the "Sold Out" label on the card/row. The cart still contains those 6 units. The listings page is lying about the cart state. Discovered only by navigating to `/cart`.

## Fix — option A, "N in cart" indicator

Non-destructive signal that directs the user to /cart, where H5's "Remove unavailable items" button resolves the conflict. Listings never mutate cart state — they only surface it.

### 1. `src/components/Listings/ListingTable.astro` — status cell

The qty cell now always mounts `<CartControl>`; status rows get a disabled button from CartControl itself. Add a sibling `.cs-listing-cart-indicator` inside `.cs-col-qty` so the "N in cart" signal has a slot:

```astro
<td class="cs-col-qty">
  <CartControl sku={listing.sku} name={listing.name} moq={listing.moq} status={listing.status} />
  {listing.status && <span class="cs-listing-cart-indicator" hidden></span>}
</td>
```

### 2. `src/components/Listings/ListingCards.astro`

The card already has `<span class="cs-listing-badge" hidden></span>` at line 40. No markup change needed — just reuse it for status-disabled cards when cart qty > 0. Verify the CSS makes the badge visible even when the card renders with a disabled add button (may need a `.cs-listing[data-status] .cs-listing-badge` rule, check current state).

### 3. `src/components/Listings/listings.ts` — hydration logic

Rewrite the card-view branch so the early return no longer drops status-disabled items. Intercept BEFORE calling `hydrateCartControl` (which bails on disabled controls):

```ts
root.querySelectorAll<HTMLElement>('.cs-listing').forEach((card) => {
  const sku = card.dataset.sku ?? '';
  const item = cart.items.find((i) => i.sku === sku);
  const qty = item?.quantity ?? 0;

  const badge = card.querySelector('.cs-listing-badge') as HTMLElement | null;
  const control = card.querySelector('.cs-cart-control') as HTMLElement | null;
  const addBtn = control?.querySelector<HTMLButtonElement>('.cs-cart-control-add');
  if (!badge || !control) return;

  // Status-disabled path: surface cart qty via badge only, don't touch qty control.
  if (addBtn?.disabled) {
    if (qty > 0) {
      badge.textContent = `${qty} in cart`;
      badge.hidden = false;
      card.classList.add('cs-has-unavailable-in-cart');
    } else {
      badge.hidden = true;
      card.classList.remove('cs-has-unavailable-in-cart');
    }
    return;
  }

  // Available path: existing behavior
  hydrateCartControl(control, qty);
  // ...badge/cs-in-cart management as today
});
```

For the table-view branch, add a disabled-addBtn guard before the existing hydrate path:

```ts
root.querySelectorAll<HTMLElement>('.cs-listing-row').forEach((row) => {
  const sku = row.dataset.sku ?? '';
  const item = cart.items.find((i) => i.sku === sku);
  const qty = item?.quantity ?? 0;
  const control = row.querySelector('.cs-cart-control') as HTMLElement | null;
  const addBtn = control?.querySelector<HTMLButtonElement>('.cs-cart-control-add');

  if (addBtn?.disabled) {
    // Status row: surface cart qty via indicator if there is any.
    const indicator = row.querySelector('.cs-listing-cart-indicator') as HTMLElement | null;
    if (indicator) {
      if (qty > 0) {
        indicator.textContent = `${qty} in cart`;
        indicator.hidden = false;
      } else {
        indicator.hidden = true;
      }
    }
    return;
  }

  if (!control) return;
  hydrateCartControl(control, qty);
  updateTableRow(row);
});
```

### 4. `src/components/Listings/ListingCards.css`, `ListingTable.css`

Minimal styling:
- `.cs-listing[data-status] .cs-listing-badge` — make sure the badge is visible and legible over a status-disabled card. Color/position should visually distinguish "in cart" from "count for available item."
- `.cs-listing-cart-indicator` — small inline label, gray text, appears below or next to the status span.
- Decide: same styling as the qty badge on available items, or visually differentiated (warning tone) since it's flagging a conflict? Pick one. Warning-tone (amber/gray) communicates "needs attention" better than primary color.

### 5. `ListingCards.astro` — data attribute

Currently the card doesn't have `data-status` on the `<article>`. Add it so the CSS selector above works and so future JS can query it:
```astro
<article
  class="cs-listing"
  data-sku={listing.sku}
  data-status={listing.status ?? ''}
  ...
>
```
The table version already has `data-status` on the row (confirmed in `Cart.astro` precedent and general convention).

## Important non-goals

- **Do NOT auto-remove the SKU from localStorage.** This would silently destroy user state. Resolution belongs to the user via the cart page (H5's remove button).
- **Do NOT try to "fix" the cart from the listings page.** Listings is read-only for cart state — it only displays.
- **Do NOT add a "remove from cart" button here.** The cart page is the single place users manage cart content. Listings just signals.

## Tests

Depends on DOM test infrastructure (see `cart-listings-test-coverage.md`). Add to the listings.ts test matrix in that todo:

- Card with `disabled` add button AND cart qty > 0 for its SKU → badge visible, text is `"6 in cart"` (or chosen format), `cs-has-unavailable-in-cart` class applied.
- Card with `disabled` add button AND cart qty == 0 → badge hidden.
- Available card AND cart qty > 0 → existing behavior unchanged (badge shows qty number, qty control visible).
- Table row with `data-status` AND cart qty > 0 → indicator visible, text shows qty, no mutation of any qty input (none exists).
- Table row with `data-status` AND cart qty == 0 → indicator hidden.
- Transition from available → status-disabled (simulated by flipping data-status + disabling button between hydrations) preserves cart qty in localStorage (assert store state unchanged).

## Related todos

- **H5** — resolved, archived at `docs/todo/archive/cart-checkout-unavailable-handling.md`. Cart page now handles unavailable items via banner + remove button + server guards.
- **C3** (`cart-listings-test-coverage.md`) — test infrastructure. H6 tests go in the listings.ts matrix already scoped in that todo.
- **H3+H9** (`cart-unavailable-row-disabling.md`) — different module (cart, not listings). No overlap.

## Acceptance criteria

- Card view: status-disabled card with cart qty > 0 shows "N in cart" badge. No Add/Qty controls shown. No cart mutation on card interaction.
- Table view: status row with cart qty > 0 shows the status label AND a "N in cart" indicator. No cart mutation on row interaction.
- Zero localStorage writes from the listings page when interacting with status-disabled items.
- Manual smoke test in a real browser:
  1. Seed cart with 6 units of a SKU.
  2. Flip that SKU's Status in `catalog.csv` to something truthy. Rebuild.
  3. Reload the listings page.
  4. Verify the "6 in cart" indicator appears on both card and table views.
  5. Click through to /cart, verify the cart page flags the SKU as unavailable (per H5's fix).

## Files you'll touch

- Edit: `src/components/Listings/listings.ts` (hydration logic for both views)
- Edit: `src/components/Listings/ListingCards.astro` (add `data-status` to article)
- Edit: `src/components/Listings/ListingTable.astro` (add indicator span to status cell)
- Edit: `src/components/Listings/ListingCards.css` (badge visibility on status cards)
- Edit: `src/components/Listings/ListingTable.css` (indicator styling)
- Edit: `docs/todo/cart-listings-test-coverage.md` (extend listings.ts test matrix)

## Don't touch

- `src/lib/cart/**` — no store changes.
- Any cart component. Listings is read-only for cart state.
- H5's resolution flow. That lives in the cart page.
