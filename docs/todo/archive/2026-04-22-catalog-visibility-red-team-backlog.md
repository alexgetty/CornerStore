# Catalog Visibility Red-Team — Medium + Deferred Backlog

## Context

This file captures all non-blocking findings from the red-team review of the 13-commit `Storefront`/`Order Sheet` → `Hidden` refactor plus downstream cart and listings work. Critical and High items were either resolved inline or promoted to their own dedicated todos. The items below are **not build-blocking**. Work them when the current WIP stabilizes or when touching adjacent code.

Critical / High resolution summary (for cross-reference):
- C1 — scaffolded CSV row → **fixed inline.**
- C2 — Stripe sync zombie products → **fixed inline.**
- C3 — no cart/listings tests → `docs/todo/cart-listings-test-coverage.md`.
- H1 — hidden-filter test gap → **fixed inline.**
- H2 — widget/cart subtotal drift → **resolved, archived at `docs/todo/archive/cart-visibility-helper.md`.**
- H3 + H9 — unavailable rows only visually disabled → **resolved, archived at `docs/todo/archive/cart-unavailable-row-disabling.md`.**
- H4 — banner shows raw SKU → **fixed inline (with init parity fix).**
- H5 — checkout confirm + server guard → **resolved, archived at `docs/todo/archive/cart-checkout-unavailable-handling.md`.**
- H6 — listings hides cart qty on status items → `docs/todo/listings-unavailable-in-cart-indicator.md`.
- H7 — stale SETUP.md → **deleted the file, cleaned up runtime refs. Docs rewrite deferred until product stabilizes.**
- H8 — legacy CSV migration → dismissed. No users to migrate.
- Init parity (not numbered, surfaced during the review) → `docs/todo/archive/init-parity-audit.md`.

---

## Medium items

### M1 — Duplicate `!p.hidden` filter in two places

**Locations:** `src/lib/stripe/catalog-cli.ts:9`, `src/lib/storefront/get-listings.ts:60`

Two independent implementations of the visibility predicate. If the rule evolves (archived state, draft, date-gating, etc.), both must change in lockstep or they drift. Grep confirms only those two callsites today.

**Fix:** Extract `isVisible(p: CatalogProduct): boolean` into `src/lib/catalog/types.ts` or a new `src/lib/catalog/filters.ts`. Replace both callsites. Add unit tests for the helper covering hidden true/false, missing field fallback. Grep `!p.hidden` should afterward match only the helper definition.

**Dependency:** None.

---

### M2 — Cart banner rebuilds via `replaceChildren` every hydrate

**Location:** `src/components/Cart/cart.ts:85-100`

`hydrateFromCart` tears down and rebuilds the unavailable banner (`banner.replaceChildren(p, ul)`) on every call, including on trivial cart mutations that didn't change the unavailable set. Over a session with many qty bumps, causes visible flicker and unnecessary repaints.

**Fix:** Cache the last rendered unavailable signature (array of SKUs stringified, or a Set equality check). Skip the rebuild when the set hasn't changed.

**Dependency:** After `cart-unavailable-row-disabling.md` and `cart-visibility-helper.md` land — the banner logic will have moved or changed. Don't optimize prematurely.

---

### M3 — Cart reads name/price/qty from DOM textContent

**Location:** `src/components/Cart/cart.ts:168-190` (`getVisibleItems`)

`row.querySelector('strong')?.textContent` for name, `row.dataset.rawPrice` for price, `row.querySelector('.cs-cart-control-input').value` for qty. Any markup refactor to `Cart.astro` (wrapping name in a different tag, renaming a class) silently breaks subtotal and error messages. Implicit contract between HTML structure and TS logic.

**Fix (STATUS: resolved by H2 todo):** `docs/todo/archive/cart-visibility-helper.md` already prescribed replacing DOM-derived cart math with structured inputs (server-rendered `priceMap` + `disabledSkus` on the root element, name from `dataset.name`). H2 has shipped and M3 is closed alongside it.

**Dependency:** Closed by `docs/todo/archive/cart-visibility-helper.md`. Do NOT do separately.

---

### M4 — `status` is a free-form string with no validation

**Location:** `src/lib/catalog/csv.ts:82`, `src/lib/catalog/types.ts`

`status: string | null` accepts anything. A merchant with `Status: "sold out"`, `Status: "SOLD OUT"`, `Status: "⛔ Unavailable"`, or `Status: "A".repeat(200)` all get wildly different UI labels. No XSS (Astro auto-escapes) but layout breaks possible.

**Fix:** Add a max-length validator in `parseRow` (e.g. 50 chars). Emit a `CatalogValidationError` for anything longer. Leave content free-form for now — don't enum-lock merchants until we have a real UX for picking statuses.

**Dependency:** None. Small change, one new test.

---

### M5 — Stale order-sheet docs in `docs/superpowers/plans/`

**Status:** Partially resolved. The two `docs/todo/` order-sheet docs have been moved to `docs/todo/archive/` (`order-sheet.md`, `order-sheet-and-cart.md`). One stale plan remains.

**Remaining location:**
- `docs/superpowers/plans/2026-04-15-order-sheet.md`

Describes the now-deleted Order Sheet page/component. Future contributors reading it get a stale mental model. Stale docs are bugs (CLAUDE.md).

**Fix:** Move to `docs/todo/archive/` with a one-line note about supersession, or delete. Either is fine; archive is lower cognitive load.

**Dependency:** None.

---

### M6 — Dead `src/lib/order-sheet/` module

**Location:** `src/lib/order-sheet/types.ts`

After deletion of `src/components/OrderSheet/*` and `src/pages/order-sheet.astro`, the `src/lib/order-sheet/` directory lingers with aliased types (`OrderSheetItem`, `OrderValidationError`, `OrderValidation`) that re-export from `validation/types.js`. Likely unused. Barrel-export risk (CLAUDE.md: every barrel export is a public API contract).

**Fix:** Grep for imports of each aliased type. If none, delete the directory. If any callers exist, migrate them to import from `validation/types.js` directly and delete after.

**Dependency:** None. Pure cleanup.

---

### M7 — Qty control lacks aria-live announcement

**Location:** `src/components/Listings/listings.ts:166`

Remove button hidden/shown based on qty crossing 0⇄1. No `aria-live` region announces the new actionable control to screen readers. Users hear the number change but don't learn a remove control just appeared.

**Fix:** Wrap the qty control in an `aria-live="polite"` region, or add a visually-hidden polite announcement that fires on the transition. Match the pattern used (if any) in the rest of the repo.

**Dependency:** None. Tests live under `cart-listings-test-coverage.md` when that lands.

---

### M8 — localStorage `cs-view-preference` has no privacy disclosure

**Location:** `src/components/Listings/listings.ts:128-132`

Writes a view preference to `localStorage` with no disclosure. Probably acceptable (functional preference, no PII) but notable if EU targeting becomes a priority. Also potential key collision if a consumer script uses the same key.

**Fix:** When consumer onboarding docs are rewritten (see H7 note), document that the storefront uses localStorage for view preference and cart state. No code change required.

**Dependency:** Consumer docs rewrite. Low priority.

---

## Deferred items

### D1 — Cart renders dead qty controls for status rows

**Location:** `src/components/Cart/Cart.astro:107-123`

Minor perf. `ListingTable.astro` conditionally renders qty control or status span. `Cart.astro` unconditionally renders qty control even for status rows.

**Fix (STATUS: resolved by H3+H9):** Resolved upstream when H3+H9 shipped. Cart no longer renders dead qty controls on status rows. Archived at `docs/todo/archive/cart-unavailable-row-disabling.md`.

**Dependency:** Closed.

---

### D2 — Test helper `makeCSVRow` doesn't default `Hidden`

**Location:** `tests/unit/catalog/helpers.ts:33-40`

Default return has no `Hidden` key. Tests override explicitly when needed. Style point, not a correctness issue — could emit a canonical fixture with every column present.

**Fix:** Add `Hidden: ''` to the helper default. Optional — only if it comes up during test writing.

**Dependency:** None.

---

### D3 — `catalogDiff` doesn't detect `metadata.sku` mismatch

**Location:** `src/lib/stripe/sync.ts:83-119`

If a Stripe product's `metadata.sku` was manually edited to mismatch its `catalog.csv` SKU, the diff treats it as orphaned + new (double-write). Out of scope for the visibility refactor but worth tracking.

**Fix:** Detect by comparing `product.metadata.sku` to the lookup key at `readStripeState` time and surface as a warning or a new change code. Deferred — no evidence this has ever happened in practice.

**Dependency:** None. Low priority.

---

### D4 — Checkout handler accepts Stripe-only SKUs that aren't in the catalog

**Location:** `src/lib/cart/handler.ts` (availability gate introduced by H5)

The H5 server guard rejects requests whose SKU is `hidden` or has a `status` set in the catalog. It does **not** reject a SKU that is missing from the catalog entirely. If a product exists in Stripe state but has been removed from `catalog.csv`, the handler still builds a line item for it (falling through to the existing Stripe-map lookup). The existing "Unknown SKU" error path only fires when the SKU is absent from BOTH sources.

**Impact:** Low today. Catalog deletions should also trigger Stripe archival via the sync tool, so in practice a Stripe-only SKU is a transient drift window. If sync skips or fails silently, a catalog-deleted product remains purchasable until Stripe state catches up.

**Fix:** Decide whether catalog is the sole source of truth for checkout. If yes, tighten `handler.ts` to reject any SKU not present in the catalog (return `Unavailable SKU` with a clear error). If no, document the current behavior as intentional.

**Dependency:** None. Surface during any future pass on the handler.

---

## Summary table

| ID | Status | Owner todo |
|----|--------|------------|
| M1 | Open | (this file) |
| M2 | Open; defer until cart work stabilizes | (this file) |
| M3 | Resolved elsewhere | `cart-visibility-helper.md` |
| M4 | Open | (this file) |
| M5 | Open | (this file) |
| M6 | Open | (this file) |
| M7 | Open | (this file) |
| M8 | Open; awaits docs rewrite | (this file) |
| D1 | Resolved | `docs/todo/archive/cart-unavailable-row-disabling.md` |
| D2 | Open | (this file) |
| D3 | Open | (this file) |
| D4 | Open | (this file) |

Ten items live in this file. Three are closed by other todos or dismissed. Nothing blocks release.
