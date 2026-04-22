# Cart + Listings DOM Test Coverage

## Status

Open. Blocker for CI once `test:coverage` is enforced.

## Problem

Two major client-side modules ship with zero test coverage, in direct violation of the repo's strict TDD contract (`docs/tdd.md`: "No implementation code exists without a failing test that demanded it", 100% coverage threshold).

Untested files:
- `src/components/Cart/cart.ts` — 406 lines
- `src/components/Listings/listings.ts` — 302 lines
- `src/components/Cart/Cart.astro` — 173 lines (SSR markup that `cart.ts` assumes exists)
- `src/components/Listings/ListingCards.astro` — 96 lines
- `src/components/Listings/ListingTable.astro` — 130 lines

`vitest.config.ts` has `thresholds: { lines: 100, branches: 100, ... }` and the `ci` script is `typecheck && test:coverage && build`. The `.ts` files are **not excluded** in the coverage config (the `.astro` files are implicitly excluded by the include glob `src/**/*.ts`). Running `npm run ci` today will fail at the coverage step.

## Why this is its own work item

The cart/listings code was shipped across commits 650d772 → edf3b1e without tests. Retrofitting full coverage for 708 TS lines plus the markup contract those lines depend on is large enough to warrant its own dedicated session. It also interacts with several open red-team findings (H3, H5, H9) that will change cart behavior — writing tests now against the current code locks in bugs.

## Sequencing

**Do this AFTER** the following findings have been resolved, so tests codify the fixed behavior:
- **H3** — unavailable rows must set `aria-disabled` and disable qty inputs (not just `pointer-events: none`)
- **H5** — checkout confirm flow; removing unavailable items from localStorage on confirm-accept
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

### Hydration — unavailable detection
- [ ] Empty cart → banner hidden, `.cs-cart-empty` shown, submit disabled.
- [ ] Cart with only available items → banner hidden, rows rendered, subtotal correct.
- [ ] Cart with a hidden SKU (no row in DOM, present in localStorage) → banner shown, unavailable list contains the SKU, empty-state hidden, subtotal excludes it.
- [ ] Cart with a status-disabled SKU (row exists with `data-status` truthy) → row gets `.cs-cart-unavailable` class, banner lists product name (from `data-name`), subtotal excludes it.
- [ ] Cart with both hidden and status SKUs → banner lists both, order is stable.
- [ ] Cart where ALL items are unavailable → banner shown, submit behavior per H5 decision (pin whatever the fixed behavior is).
- [ ] Banner text: for status rows uses `data-name`.

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

### Qty controls — available rows
- [ ] +/- buttons mutate localStorage AND update the displayed qty.
- [ ] Remove button deletes from localStorage and removes the row.
- [ ] Manual qty input snaps to MOQ on change.
- [ ] Remove button hidden when qty = 0, shown when qty > 0.

### Qty controls — unavailable rows (depends on H3, H9 resolutions)
- [ ] Status rows do not attach qty handlers (per H9). Programmatic button click does NOT mutate localStorage.
- [ ] Status rows' qty input is `disabled` and has `aria-disabled="true"` (per H3).
- [ ] Keyboard Enter on a status-row + button does NOT mutate localStorage.

### Checkout flow (depends on H5 resolution)
- [ ] Submit with only available items → calls `attemptCheckout` (when `checkoutEnabled`), does not call `confirm`.
- [ ] Submit with unavailable items → shows the confirm (or in-page modal per H5). If user declines, no fetch, no redirect, no localStorage mutation.
- [ ] Submit with unavailable items + user accepts → unavailable SKUs are removed from localStorage BEFORE redirect (per H5 fix). Fetch payload contains only available items.
- [ ] Submit in PDF mode (`!checkoutEnabled`) → calls `generatePdf`, same unavailable-item rules apply.

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

### Hydration from cart
- [ ] Card view — for each SKU in cart, the card's qty input reflects the quantity.
- [ ] Card view — `removeBtn.hidden` correctly toggles based on qty.
- [ ] Table view — qty inputs reflect cart state.
- [ ] Table view — rows with `data-status` (no qty input) exit hydration gracefully; existing cart qty for that SKU is preserved in localStorage (do NOT prune it) — surface whatever H6 decides for the UX side.

### Qty control wiring — cards
- [ ] Fresh mount wires `+`, `-`, remove, change handlers.
- [ ] Clicking `+` snaps to MOQ on first click, increments by 1 afterward.
- [ ] Clicking remove sets qty to 0 and calls `removeItem` on the store.
- [ ] Handlers set `dataset.wired = 'true'`.
- [ ] Re-running `hydrate` on an already-wired card does NOT rebind (no double-increment).

### Qty control wiring — table
- [ ] Same matrix as cards, adapted for table row structure.

### Disabled button skip (per H9 in red-team review)
- [ ] Cards with `addBtn.disabled === true` do NOT receive click handlers. Programmatic click does not mutate localStorage.
- [ ] Table rows with `data-status` do NOT receive qty handlers.
- [ ] Disabled-skip is idempotent across view toggles.

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
