# Cart Unavailable Rows — Actually Disable Them

## Status

Open. Merges H3 and H9 from the catalog-visibility red-team review.

## Problem

Cart rows for status-disabled SKUs are "disabled" visually but remain fully interactive under the hood.

### H3: CSS is the only guard
`src/components/Cart/Cart.css:295-298`:
```css
.cs-cart-row.cs-cart-unavailable {
  opacity: 0.4;
  pointer-events: none;
}
```
`pointer-events: none` blocks mouse clicks. It does NOT block keyboard activation. A keyboard user can Tab into the qty input, type a number, press +/-, press Enter on the remove button — every handler fires. No `aria-disabled`, no `aria-invalid`, no visually-hidden descriptive text. Screen readers get no cue that the row is unavailable.

### H9: handlers wired to every row regardless of status
`src/components/Cart/cart.ts:110-153` attaches `click` / `change` listeners to every `.cs-cart-row` at mount, before `hydrateFromCart` runs. No check on `row.dataset.status`. Compare `src/components/Listings/listings.ts:188` which correctly does `if (addBtn.disabled) return;` for card wiring. That pattern is missing here.

### Combined effect
Keyboard user on an unavailable row presses Enter on `+` → `setItem(sku, moq, 'wholesale')` fires → localStorage quantity changes → but `getVisibleItems` still filters `.cs-cart-unavailable` rows out → subtotal doesn't move. User sees "I clicked +, the input says 6, the total didn't change." State desync, silent.

On next page reload, `hydrateFromCart` re-flags the row as unavailable, so the quantity stays in localStorage but the row is greyed out again. The cart now has a zombie entry the user never intended to change.

## Why merge H3 and H9

Same bug from two angles. Fixing H3 alone (aria, disabled attrs) leaves handlers attached — any markup or timing that lets the event fire still mutates state. Fixing H9 alone (guard in wiring loop) leaves the input still focusable, still editable via keyboard. The two fixes are cheap together and dangerous apart.

## Fix

Belt-and-braces: skip rendering the qty controls server-side for status rows, guard the client-side wiring loop, add aria/SR text. CSS keeps only the visual treatment.

### 1. `src/components/Cart/Cart.astro:107-126` — conditional qty/remove rendering

Mirror the pattern `ListingTable.astro` already uses. When `listing.status` is truthy, render a status cell instead of the qty control. Keep the remove button (users need a way to clear dead items) but render the total as `—` since there's no effective line total.

Rough shape:
```astro
<td class="cs-col-qty">
  {listing.status ? (
    <span class="cs-cart-status-label">{listing.status}</span>
  ) : (
    <div class="cs-qty-control">
      <!-- existing -/input/+ markup -->
    </div>
  )}
</td>
<td class="cs-col-total">
  {listing.status ? (
    <span class="cs-line-total">—</span>
  ) : (
    <span class="cs-line-total">$0.00</span>
  )}
</td>
<td class="cs-col-remove">
  <button type="button" class="cs-remove-btn" aria-label={`Remove ${listing.name}`}>&times;</button>
</td>
```

Also add a visually-hidden descriptor inside the product cell so SR users hear "unavailable" before the price column:
```astro
{listing.status && <span class="cs-sr-only">Unavailable: {listing.status}</span>}
```

Put the `cs-sr-only` class in Cart.css if it doesn't exist globally (grep `cs-sr-only` in the repo first — it's used in Nav.astro line ~34 area, so the class likely exists).

### 2. `src/components/Cart/cart.ts:110` — guard the wiring loop

```ts
rows.forEach((row) => {
  if (row.dataset.status) return; // status rows get no handlers
  // ...existing wiring
});
```

Wire the remove button separately in a second pass so status rows CAN still be removed:
```ts
rows.forEach((row) => {
  const removeBtn = row.querySelector<HTMLButtonElement>('.cs-remove-btn');
  if (!removeBtn) return;
  removeBtn.addEventListener('click', () => {
    removeItem(row.dataset.sku ?? '', 'wholesale');
  });
});
```
(The existing loop already binds `removeBtn` inside the qty-wiring block — pull it out so it runs unconditionally. Keep the input.value='0' bit only inside the qty-wiring path where the input exists.)

### 3. `src/components/Cart/cart.ts:hydrateFromCart` (around line 66-74) — aria annotations

When flagging a row unavailable, also set ARIA state:
```ts
if (status) {
  row.hidden = false;
  row.classList.add('cs-cart-unavailable');
  row.setAttribute('aria-disabled', 'true');
  // ...existing logic
}
```
Reset on the cleanup pass at line 53-56:
```ts
rows.forEach((row) => {
  row.hidden = true;
  row.classList.remove('cs-cart-unavailable');
  row.removeAttribute('aria-disabled');
});
```

### 4. `src/components/Cart/Cart.css:295-298` — drop `pointer-events: none`

```css
.cs-cart-row.cs-cart-unavailable {
  opacity: 0.4;
}
```
Keep opacity for the visual treatment. `pointer-events: none` is no longer carrying load (because we're not rendering the qty controls anymore) and it blocks genuine interactions like selecting text in the product name.

Add styling for `.cs-cart-status-label` if needed — match whatever `ListingTable.astro` / `ListingTable.css` uses so the two views feel consistent.

### 5. Keep the remove button enabled

Remove button stays interactive on unavailable rows. UX: unavailable items should be easy to clear. The existing CSS change (dropping pointer-events: none) is what re-enables it.

## Testing

Live tests get added under the separate `cart-listings-test-coverage.md` todo. That todo already sequences AFTER this one and its test matrix is scoped to the fixed behavior.

For immediate verification without the test suite:
1. Start dev server, seed localStorage with a cart containing a status-disabled SKU.
2. Open `/cart`.
3. Verify:
   - Row renders with status label where qty controls used to be.
   - No qty input or +/- buttons in the DOM for that row (inspect element).
   - Tab order skips straight from the product name to the remove button.
   - SR testing (VoiceOver / NVDA) announces "unavailable" somewhere on the row.
   - Clicking remove clears the item from localStorage and removes the row.
4. Manually inject a cart item whose SKU matches an available product, then in DevTools change that row's `data-status` attribute to a non-empty string. Press Tab into the input, type 99, press Enter. Confirm localStorage did NOT change (because the row-wiring guard short-circuited at mount, even though the attribute was added post-mount — if the guard only runs at mount, document that limitation. Late-added status is an edge case we don't need to handle, but note it.)

## Related findings — do not merge

- **H5** (checkout confirm + unavailable item cleanup) — separate todo. Orthogonal to this: H5 is about what happens at checkout; this is about what happens in the row itself.
- **H4** (banner shows raw SKU instead of name for hidden items) — separate todo. Touches the banner; this touches the rows.
- **M7** (qty control aria-live) — listings page, not cart. Different module.

## Acceptance criteria

- Status rows render zero qty input and zero +/- buttons in the DOM. `document.querySelectorAll('.cs-cart-row[data-status] .cs-qty-input')` returns an empty NodeList.
- Status rows have `aria-disabled="true"` set via hydration.
- Status rows include a visually-hidden descriptor so screen readers announce unavailability.
- Status rows' remove button is interactive and clears the SKU from localStorage on click.
- Manual keyboard walkthrough: Tab order on the cart page never lands on a disabled input. Enter on any remaining interactive element in a status row either removes the item (remove button) or is a no-op.
- Existing 608-test suite stays green after these changes.

## Out of scope

- Changing the unavailable banner text or structure (H4 owns that).
- Reconciliation logic that automatically removes stale items from localStorage (user-initiated remove only).
- Any listings-page changes (H6 is a different module).

## Files you'll touch

- Edit: `src/components/Cart/Cart.astro` (conditional render + SR descriptor)
- Edit: `src/components/Cart/Cart.css` (drop pointer-events, add status-label styling)
- Edit: `src/components/Cart/cart.ts` (wiring guard, remove-button split, aria annotations, cleanup reset)

## Don't touch

- `src/components/Listings/listings.ts` — different component, different findings.
- `src/lib/cart/store.ts` or any other business logic — this is pure UI behavior.
- The cart visibility helper work (separate todo). That refactor will later migrate `getVisibleItems` off DOM classes, but keep using DOM filtering for now to avoid scope creep.
