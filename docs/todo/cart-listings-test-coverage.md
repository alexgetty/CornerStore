# Cart + Listings DOM Test Coverage

## Status

Open. Blocker for CI once `test:coverage` is enforced.

## Problem

Two major client-side modules ship with zero test coverage, in direct violation of the repo's strict TDD contract (`docs/tdd.md`: "No implementation code exists without a failing test that demanded it", 100% coverage threshold).

Untested files:
- `src/components/Cart/cart.ts` — 569 lines
- `src/components/Listings/listings.ts` — 312 lines
- `src/components/Cart/Cart.astro` — 196 lines (SSR markup that `cart.ts` assumes exists)
- `src/components/Listings/ListingCards.astro` — 83 lines
- `src/components/Listings/ListingTable.astro` — 121 lines

Pure-logic decision modules already extracted and at 100% coverage (do NOT cover here):
- `src/components/CartControl/cart-control-actions.ts` (`classifyCartControlTarget`, `nextQuantity`)
- `src/components/Cart/cart-row-actions.ts` (`resolveCartMutation`)

`vitest.config.ts` has `thresholds: { lines: 100, branches: 100, ... }` and the `ci` script is `typecheck && test:coverage && build`. The `.ts` files are **not excluded** in the coverage config (the `.astro` files are implicitly excluded by the include glob `src/**/*.ts`). Running `npm run ci` today will fail at the coverage step.

## Why this is its own work item

The cart/listings code was shipped across commits 650d772 → edf3b1e without tests. Retrofitting full coverage for 708 TS lines plus the markup contract those lines depend on is large enough to warrant its own dedicated session. It also interacts with several open red-team findings (H3, H5, H9) that will change cart behavior — writing tests now against the current code locks in bugs.

## Sequencing

**Do this AFTER** the following findings have been resolved, so tests codify the fixed behavior:
- **H3** — unavailable rows must set `aria-disabled` and disable qty inputs (not just `pointer-events: none`)
- **H5** — RESOLVED (client layer): `confirm()` replaced by an inline "Remove unavailable items" button in the banner + dedicated `.cs-unavailable-notice`. Submit gated while `unavailableSkus.length > 0`. Test contract lives under "Checkout flow" below.
- **H9** — skip attaching click handlers to status rows in cart

If those findings change before this work starts, update the test matrix below accordingly.

## Prerequisites

1. Install a DOM environment for vitest. Recommend `happy-dom` (faster, lighter than jsdom, covers everything cart/listings use):
   ```
   npm i -D happy-dom
   ```
2. Update `vitest.config.ts` to run DOM tests in the right environment. Two options:
   - Global: add `environment: 'happy-dom'` to `test`.
   - Per-file (preferred, keeps node-environment tests fast): add `environmentMatchGlobs: [['tests/unit/components/**', 'happy-dom']]`. Put new tests under `tests/unit/components/`.
3. Add `@types/node` and any missing types if the IDE complains about `window`/`document` in test files.

## Existing test patterns to mimic

- **Vitest structure and mocking** — `tests/unit/stripe/sync.test.ts` is the richest example in the repo. Uses `vi.mock`, `vi.resetModules`, `beforeEach` for per-test isolation, `vi.spyOn(console, ...)` to silence logs, `vi.useFakeTimers()` for retry paths.
- **Cart state fixtures** — `tests/unit/cart/store.test.ts` already covers the localStorage-backed cart store. The new tests should import the same store module (`src/lib/cart/store.ts`) to seed state rather than writing raw JSON strings into `localStorage`.
- **Catalog fixtures** — `tests/unit/catalog/helpers.ts` exports `makeCatalogProduct` — useful if you need to synthesize listing data.

## Test infrastructure helper

Create `tests/unit/components/helpers.ts` that:
- Renders a plausible static HTML string matching `Cart.astro` / `ListingCards.astro` / `ListingTable.astro` output for a given array of listings.
- Inserts it into `document.body`.
- Exports `mountCart(listings)`, `mountCards(listings)`, `mountTable(listings)` that return the container + utility refs (`banner`, `rows`, `submitBtn`).
- Each test calls the helper, seeds localStorage via the cart store, then calls `hydrate(container)` from `cart.ts` / `listings.ts`.

Do NOT try to SSR the real `.astro` files in tests. Astro SSR in a unit-test context is a rabbit hole. A static HTML fixture that mirrors the component output is sufficient for the unit tests — if the markup diverges, coverage of the TS consumer still catches it because the selectors would stop finding elements.

For a belt-and-braces check that the fixture matches real output, add one low-level snapshot test per component that builds the Astro file and asserts the emitted HTML still contains the selectors the TS modules depend on. Keep this out of the unit tests — it's a separate integration check.

## Test matrix — `cart.ts`

Target: 100% lines + branches. File reference: `src/components/Cart/cart.ts`.

> **Note:** As of the CartControl unification (2026-04-24), cart rows mount the
> same `<CartControl>` component as listings, with the unified classes
> (`cs-cart-control`, `cs-cart-control-add/-up/-down/-input/-qty`). Cart-side
> qty interactions go through one root-level event delegation listener (no
> per-row binding). The pure cart-side decision "qty=0 → remove, qty>0 → set"
> lives in `src/components/Cart/cart-row-actions.ts` (`resolveCartMutation`)
> and is fully covered by `tests/unit/components/cart-row-actions.test.ts`.
> Test entries below have been updated to reference the new selectors.

### Hydration — unavailable detection
- [ ] Empty cart → banner hidden, `.cs-cart-empty` shown, submit disabled.
- [ ] Cart with only available items → banner hidden, rows rendered, subtotal correct.
- [ ] Cart with a hidden SKU (no row in DOM, present in localStorage) → banner shown, unavailable list contains the SKU, empty-state hidden, subtotal excludes it.
- [ ] Cart with a status-disabled SKU (row exists with `data-status` truthy) → row gets `.cs-cart-unavailable` class, banner lists product name (from `data-name`), subtotal excludes it.
- [ ] Cart with both hidden and status SKUs → banner lists both, order is stable.
- [ ] Cart where ALL items are unavailable → banner shown, `.cs-unavailable-notice` visible, submit disabled. Empty-state stays hidden (unavailable items still count as cart content until cleared).
- [ ] Banner text: for status rows uses `data-name`.
- [ ] Module-scoped `unavailableSkus` after hydration: matches the union of hidden and status SKUs currently in the cart. Iteration order is cart-insertion order.
- [ ] Hydration with an empty `unavailableSkus` result hides the banner, hides the notice, and does not leave stale `<p>`/`<ul>` children inside the banner element.

### Hidden-SKU name resolution (H4 — `/product-names.json` fetch)
- [ ] On mount, cart.ts fetches `/product-names.json`. Mock `global.fetch`.
- [ ] Fetch success (200 with JSON body): after resolution, hydrateFromCart re-runs and banner `<li>` text for a hidden SKU equals the product name from the map, not the SKU.
- [ ] Fetch failure (404 or network throw): no unhandled rejection; banner still renders with SKU fallback.
- [ ] Fetch returns SKU not present in its map: banner falls back to SKU.
- [ ] No fetch on non-cart pages — confirm the fetch is inside the `init(root)` path guarded by `.cs-cart` presence.
- [ ] Subsequent `hydrateFromCart` calls (CART_EVENT, storage) use the cached map, no additional network requests.
- [ ] Endpoint shape: `src/pages/product-names.json.ts` exports a `GET` that returns a Response with `Content-Type: application/json` and a body that is a valid `Record<string, string>`. Add a unit test under `tests/unit/pages/product-names.test.ts` that mocks `loadCatalog`, invokes the handler, and asserts headers + body shape. (This test is NOT DOM-dependent and can be written today; consider moving it into its own quick task if you want to split.)

### Subtotal computation
- [ ] `getVisibleItems` filter skips `.cs-cart-unavailable` rows.
- [ ] Subtotal = Σ (qty × rawPrice) over visible rows only.
- [ ] Subtotal formats correctly for USD and a second currency (pull from `pricing.ts`).

### Qty controls — available rows (delegated)
- [ ] Fresh mount wires the root click + change delegation exactly once.
- [ ] Clicking `.cs-cart-control-up` from MOQ goes to 2×MOQ; from 0 goes to MOQ; with no MOQ increments by 1.
- [ ] Clicking `.cs-cart-control-down` decrements by MOQ (or 1); landing in (0, MOQ) snaps to 0 AND removes the item from the store (CART_EVENT re-runs hydrate, row hides).
- [ ] `.cs-cart-control-add` is NOT visible for cart rows in steady state — qty>0 hydration toggles the stepper. (Defensive: programmatic click on the add button still routes through `nextQuantity('add', ...)` and sets the item to MOQ-or-1.)
- [ ] `change` on `.cs-cart-control-input` uses the raw value (clamped >=0, floored to int), does NOT snap to MOQ; qty=0 input also removes from the store via the same code path.
- [ ] Clicking the `.cs-remove-btn` on a cart row routes through `handleCartControlAction(control, 'input', 0)` → same `removeItem` call. Spy on `removeItem` to assert it fires once with mode `'wholesale'`.

### Qty controls — unavailable rows (status disabled add button)
- [ ] Status rows render a disabled `.cs-cart-control-add` button (CartControl handles `status` prop). Programmatic click is filtered by the `actionEl.disabled` guard in delegation, so it does NOT mutate localStorage.
- [ ] The `.cs-remove-btn` on status rows still fires removeItem (users can always clear unavailable lines).
- [ ] Keyboard Enter on a disabled add button does NOT mutate localStorage (`actionEl.disabled` short-circuits delegation).

### Checkout flow (H5 resolved — inline "Remove unavailable items" button, no confirm)
- [ ] Submit with only available items → calls `attemptCheckout` (when `checkoutEnabled`). Fetch body contains those items.
- [ ] `confirm()` is never called by `cart.ts`. Spy on `window.confirm` across all test paths and assert zero invocations.
- [ ] Submit button is disabled while `unavailableSkus.length > 0`. Holds for hidden-SKU-only, status-SKU-only, and mixed carts.
- [ ] Submit button re-enables automatically once the unavailable list is cleared (via the clear button below) and no other validation errors remain.
- [ ] `.cs-unavailable-notice` is visible with text "Remove unavailable items to continue" while any unavailable item is in cart. Hidden otherwise.
- [ ] `.cs-clear-unavailable` button click removes each SKU in `unavailableSkus` from the store (assert `removeItem` called once per sku with mode `'wholesale'`).
- [ ] After the clear-button click, `hydrateFromCart` re-runs via `CART_EVENT`, banner hides, notice hides, submit re-enables.
- [ ] Mixed cart (1 hidden + 1 status + 1 available) → clear button removes both unavailable SKUs, leaves the available one, submit enables, checkout payload contains only the available SKU.
- [ ] Regression guard: with an unavailable item in cart, programmatically dispatch `click` on the submit button → no fetch fires, no redirect occurs, checkout URL is NOT called.
- [ ] Banner button handler is wired ONCE at mount. Re-running `hydrateFromCart` does not rebind (dispatch two clicks, assert only the SKUs present at click time are removed, no double-removal).
- [ ] Banner markup preservation: hydration rewrites the `<p>`/`<ul>` inside the banner but keeps the `.cs-clear-unavailable` button element identity stable (no listener loss).
- [ ] Submit in PDF mode (`!checkoutEnabled`) → same gating rules apply. With unavailable items, submit is disabled and `generatePdf` is not called.
- [ ] PDF generation output (when triggered after clearing) strips `.cs-unavailable-notice` and `.cs-cart-unavailable-banner` from the cloned content.

### Cross-tab sync
- [ ] `storage` event for the cart key triggers re-hydration.
- [ ] `storage` event for a different key is ignored.
- [ ] Cart custom event (`CART_EVENT`) triggers re-hydration.

### Error paths
- [ ] `getUnavailableNames` returns SKU when `data-name` is empty string.
- [ ] Invalid price in `data-raw-price` is treated as 0 (or whatever the current behavior is — pin it).

### Utilities
- [ ] Any exported helpers (`snapToMoq`, price formatting wrappers) covered by their own small unit tests.

## Test matrix — `listings.ts`

Target: 100% lines + branches. File reference: `src/components/Listings/listings.ts`.

> **Note:** As of the CartControl unification (2026-04-24), both views mount the
> same `<CartControl>` component with unified classes (`cs-cart-control`,
> `cs-cart-control-add/-up/-down/-input`). The orchestrator uses root-level
> event delegation (no per-row `dataset.wired`), so "re-binding" assertions
> should target the root listener being attached once, not per-element flags.

### Hydration from cart
- [ ] Card view — for each SKU in cart, the card's `.cs-cart-control-input` reflects the quantity.
- [ ] Card view — add/stepper visibility toggles via `hydrateCartControl` based on qty.
- [ ] Table view — qty inputs reflect cart state.
- [ ] Table view — rows whose CartControl renders a disabled add button (status-disabled) exit hydration gracefully; existing cart qty for that SKU is preserved in localStorage (do NOT prune it) — surface whatever H6 decides for the UX side.

### Qty control wiring — cards (delegated)
- [ ] Fresh mount wires the root click + change delegation exactly once.
- [ ] Clicking `.cs-cart-control-add` snaps to MOQ (or 1 if no MOQ).
- [ ] Clicking `.cs-cart-control-up` from MOQ goes to 2×MOQ; from 0 goes to MOQ; with no MOQ increments by 1.
- [ ] Clicking `.cs-cart-control-down` decrements by MOQ (or 1); landing in (0, MOQ) snaps to 0.
- [ ] `change` on `.cs-cart-control-input` uses the raw value (clamped >=0, floored to int), does NOT snap to MOQ.
- [ ] Clicking the table `.cs-remove-btn` sets qty to 0 and removes from store.
- [ ] Re-running `hydrateFromCart` does NOT rebind delegation (no double-increment on a single click).

### Qty control wiring — table (delegated)
- [ ] Same matrix as cards, adapted for table row structure (includes remove button).

### Disabled-control skip
- [ ] Cards with a disabled `.cs-cart-control-add` button do NOT mutate localStorage on programmatic click.
- [ ] Table rows whose CartControl is disabled do NOT mutate localStorage on programmatic click.
- [ ] Disabled-skip holds across view toggles.

### View preference toggle
- [ ] Toggling from card→table writes `cs-view-preference` to localStorage.
- [ ] Toggling back wires handlers to the newly-shown view.
- [ ] No handler leakage between views (event listener count stable).

### Accessibility assertions (smoke-level)
- [ ] Card disabled button has `aria-disabled` or `disabled` attribute present.
- [ ] Status table cell is focusable-or-not per design decision (pin it).

## Acceptance criteria

- `npm run test:coverage` passes with the 100% thresholds intact.
- `npm run ci` green end-to-end.
- Each test has been verified to actually catch a regression: intentionally break the corresponding line of production code, confirm the test fails, restore.
- No test relies on `setTimeout` or real timers — use `vi.useFakeTimers()` for anything time-based.
- Coverage report excludes nothing new from `vitest.config.ts`. If you hit a line that genuinely cannot be tested (e.g. a defensive branch that can't be reached), discuss before adding to the exclude list — the default answer is "write a test for it."

## Out of scope

- Playwright / E2E tests. This is unit-level only.
- Refactoring cart.ts or listings.ts structure. Tests against the existing structure (post-H3/H5/H9 fixes). If structural issues surface while writing tests, log them as new todos.
- Coverage for `.astro` files themselves. Keep them excluded; cover their TS consumers.

## Files you'll touch

- New: `tests/unit/components/cart.test.ts`
- New: `tests/unit/components/listings.test.ts`
- New: `tests/unit/components/helpers.ts`
- Edit: `vitest.config.ts` (add DOM environment glob)
- Edit: `package.json` (add `happy-dom` devDep)

Do NOT touch `src/components/Cart/cart.ts`, `src/components/Listings/listings.ts`, or the `.astro` files unless a test genuinely cannot be written against current behavior — if that happens, stop and surface it.
