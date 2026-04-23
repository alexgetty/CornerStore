# Checkout — Unavailable Item Handling (Client UX + Server Guard)

## Status

Open. H5 from the catalog-visibility red-team review, expanded with server-side defense-in-depth per explicit direction: **never send an unavailable item to Stripe, from any code path.**

## Problem

Two compounding bugs in the checkout flow:

### Client-side (`src/components/Cart/cart.ts:285-300`)
```ts
submitBtn.addEventListener('click', async () => {
  const unavailable = getUnavailableNames();
  if (unavailable.length > 0) {
    const ok = confirm(`These items are no longer available...`);
    if (!ok) return;
  }
  if (checkoutEnabled) await attemptCheckout();
  else await generatePdf();
});
```

Issues:
- `confirm()` is a blocking native dialog. Browsers increasingly throttle or block it. Extensions, automated environments, or headless scenarios can suppress it. Under suppression, `ok` may default truthy and the user proceeds without ever seeing the list of unavailable items.
- On accept, `attemptCheckout` filters to `getVisibleItems()` so the Stripe payload is clean — BUT the unavailable items stay in localStorage. On return from Stripe, the cart still contains the dead SKUs and the banner re-shows.
- On decline, same state persists. Cart stays permanently showing a banner until the user manually removes items one by one.

### Server-side (`src/lib/cart/handler.ts`, `src/lib/cart/checkout.ts`)

Both the Stripe-map path (`handler.ts`) and the catalog path (`checkout.ts:buildLineItems`) will happily accept unavailable SKUs and construct line items for them. There is **zero server-side guard** against a malicious or buggy client sending `{ sku: 'HIDDEN-001', quantity: 5 }`. The handler will look up the price and create a checkout session for a product the merchant intended to be unavailable.

This is the user's explicit concern: even if the UI is fixed, any programmatic POST (JS bug, stale tab, direct curl) bypasses the client-side filter entirely.

## Fix — two layers

### Layer 1: Client UX (replaces confirm() flow)

Shift to an inline, non-blocking, explicit action model.

**`src/components/Cart/Cart.astro`** — add a "Remove these items" button inside the unavailable banner:
```astro
<div class="cs-cart-unavailable-banner" hidden role="alert">
  <!-- existing <p> and <ul> populated by cart.ts -->
  <button type="button" class="cs-clear-unavailable">Remove unavailable items</button>
</div>
```
The `<p>` and `<ul>` are still populated by `hydrateFromCart`; the button stays static.

**`src/components/Cart/cart.ts`**:
- Remove the `confirm()` block entirely at line 287-293.
- In `hydrateFromCart`, when building the banner, also collect the unavailable SKUs (not just display names) into a module-scoped `unavailableSkus: string[]`.
- Wire the banner's `.cs-clear-unavailable` button once at mount: on click, iterate `unavailableSkus`, call `removeItem(sku, 'wholesale')` for each, and rely on the existing `CART_EVENT` listener to re-hydrate.
- In `updateTotals` (or `hydrateFromCart`): while `unavailableSkus.length > 0`, set `submitBtn.disabled = true` and add a helper message near the submit button ("Remove unavailable items to continue" in an existing `cs-order-errors` slot, or a new dedicated element). Once cleared, submit re-enables via the normal validation path.

**`src/components/Cart/Cart.css`** — minimal styling for `.cs-clear-unavailable`. Match existing button patterns.

Result: no native dialog, no surprise cart state, submit flow is honest about what's being checked out.

### Layer 2: Server guard (defense-in-depth)

Both server-side paths must reject unavailable items regardless of what the client sends.

**`src/lib/cart/checkout.ts:buildLineItems`** (the catalog-based path):

Currently at line 64-67:
```ts
const product = catalog.find((p) => p.sku === item.sku);
if (!product) {
  return { ok: false, error: `Unknown SKU: ${item.sku}` };
}
```

Add a second guard immediately after the product-found check:
```ts
if (product.hidden) {
  return { ok: false, error: `Unavailable SKU: ${item.sku}` };
}
if (product.status) {
  return { ok: false, error: `Unavailable SKU: ${item.sku} (${product.status})` };
}
```

Rationale for rejecting rather than silently dropping: a silently-dropped item leads to a partial checkout the customer didn't knowingly approve (they submitted N items, 4 went through, they get charged for 4). Explicit 400 with a clear error lets the client re-sync state and explain. Silent filtering is user-hostile.

**`src/lib/cart/handler.ts:createCheckoutHandler`** (the Stripe-map path):

This path reads from Stripe state, not catalog state, so it has no knowledge of `hidden` / `status`. Two options:

**Option (i)** — load the catalog inside the handler and cross-reference:
```ts
// at top of createCheckoutHandler factory
import { loadCatalog } from '../catalog/csv.js';
// ...
let catalogCache: Map<string, CatalogProduct> | null = null;
async function getCatalog() {
  if (catalogCache) return catalogCache;
  const products = await loadCatalog();
  catalogCache = new Map(products.map(p => [p.sku, p]));
  return catalogCache;
}
// in the request handler, before the SKU map lookup:
const catalog = await getCatalog();
const catalogProduct = catalog.get(item.sku);
if (!catalogProduct || catalogProduct.hidden || catalogProduct.status) {
  return new Response(JSON.stringify({ error: `Unavailable SKU: ${item.sku}` }), { status: 400 });
}
```

**Option (ii)** — deprecate the Stripe-map path entirely and route everything through `buildLineItems`. Eliminates dual-path drift. Bigger refactor.

Go with **option (i)** for this work item. Option (ii) is right long-term but is a separate cleanup task.

### Cache invalidation for the server-side catalog

The `catalogCache` in handler.ts is module-scoped and only initialized once. After a catalog edit + rebuild + redeploy, the cache gets fresh data naturally. In a long-running dev server this cache can go stale — but so can the existing `skuMap` cache, which has the same pattern. Live with it for now; flag as known limitation in a comment.

## Tests

### Server tests (do these as part of this work item)

These are pure-function tests with no DOM dependency. Land them now.

**`tests/unit/cart/checkout.test.ts`** — extend `buildLineItems` test block:
- [ ] `buildLineItems` returns `{ ok: false, error: /Unavailable SKU/ }` when a requested SKU has `hidden: true` in the catalog.
- [ ] `buildLineItems` returns `{ ok: false, error: /Unavailable SKU/ }` when a requested SKU has a truthy `status`.
- [ ] Error message includes the SKU for hidden and includes SKU + status for status-disabled.
- [ ] A mixed request (one available, one hidden) rejects with the hidden SKU named. Order of checks matches iteration order of `items`.

**`tests/unit/cart/handler.test.ts`** (exists already) — add:
- [ ] Handler rejects a request whose SKU is hidden in the catalog even though it exists in Stripe state.
- [ ] Handler rejects a request whose SKU has a status, even though it exists in Stripe state.
- [ ] Handler's catalog cache is populated on first request and reused on second (assert `loadCatalog` called once across two requests).
- [ ] Regression guard: temporarily remove the hidden check, confirm the test fails.

### Client tests (add to cart-listings-test-coverage.md test matrix)

Will be written as part of the DOM test infrastructure todo, but document the contract here:
- Submit button disabled while `unavailableSkus.length > 0`.
- "Remove unavailable items" button removes each listed SKU from localStorage on click.
- After button click, cart re-hydrates; banner hides if no more unavailable items remain.
- No `confirm()` call anywhere in the submit path (mock and assert never called).
- Checkout fetch body contains no unavailable SKUs (can't happen given submit is disabled, but useful regression guard).

## Related findings

- **H3+H9** (`cart-unavailable-row-disabling.md`) — orthogonal. Those handle row-level keyboard/screen-reader behavior. This handles the submit-flow and server-side behavior. No merge.
- **H2** (`cart-visibility-helper.md`) — the `unavailableSkus` list here overlaps with what the helper extracts. If the helper work lands first, use it. If this lands first, rebuild on top of it later. Don't block on sequencing.
- **Init-script parity** (separate concern) — bin/init.mjs does NOT currently scaffold an `src/pages/api/checkout.ts` for consumers, even though the cart page defaults `checkoutUrl` to `/api/checkout`. This is a preexisting gap unrelated to H5. Flag it but don't fix it here.

## Acceptance criteria

**Client:**
- No `confirm()` call in `cart.ts`. Grep confirms.
- Submit button is disabled as long as the cart contains any unavailable item (hidden or status).
- Banner contains a user-actionable button that clears unavailable items.
- Manual walkthrough in a real browser:
  - Add an item, flip it to hidden in the CSV, rebuild/reload → banner shows with the remove button, submit disabled.
  - Click the button → banner disappears, submit enables, checkout proceeds with only available items.
  - Repeat with a status-disabled item instead of hidden.

**Server:**
- `buildLineItems` rejects requests containing any hidden or status-disabled SKU with a 400 and a clear message naming the SKU.
- `createCheckoutHandler` rejects the same, even when the SKU exists in Stripe state (simulating a legacy-synced but now-hidden product).
- Unit tests for both paths pass and have been verified to fail when the guard is temporarily removed.

**Full suite:** `npm run test` green. Existing 608 tests unaffected.

## Out of scope

- Deprecating the dual server-side path (handler.ts vs checkout.ts) — separate cleanup.
- Scaffolding an `api/checkout.ts` in `bin/init.mjs` — separate init-parity issue.
- Playwright / E2E tests for the checkout redirect flow.
- Any changes to Stripe sync (`src/lib/stripe/**`).

## Files you'll touch

- Edit: `src/components/Cart/Cart.astro` (banner button markup)
- Edit: `src/components/Cart/cart.ts` (remove confirm, wire button, submit gating)
- Edit: `src/components/Cart/Cart.css` (minimal button styling)
- Edit: `src/lib/cart/checkout.ts` (hidden + status guards in `buildLineItems`)
- Edit: `src/lib/cart/handler.ts` (catalog cache + cross-reference guard)
- Edit: `tests/unit/cart/checkout.test.ts` (new test cases)
- Edit: `tests/unit/cart/handler.test.ts` (new test cases)
- Edit: `docs/todo/cart-listings-test-coverage.md` (add the new DOM test scenarios — already partially done for H4, extend for H5)

## Don't touch

- `src/lib/stripe/**` — unrelated module.
- The cart visibility helper work (separate todo).
- Cart row disabling (H3+H9 separate todo).
