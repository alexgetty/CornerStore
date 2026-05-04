# Catalog Cleanup Pass

## Status

Open. Bundle of small, low-risk cleanups consolidated from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md` (M1, M4, M5, M6, D2). Each item is independent. Pick any in any order.

## Problem

Five small items, each non-blocking on its own, accumulated in the catalog-visibility backlog. None are urgent; none should ship without the others either. Bundling them keeps the noise in one PR rather than five.

## Items

### M1 — Extract `isVisible` helper

**Locations:** `src/lib/storefront/get-listings.ts:60`, `src/lib/stripe/catalog-cli.ts:9`

Two independent inline implementations of the visibility predicate (`!p.hidden`). If the rule evolves (archived state, draft, date-gating, etc.), both must change in lockstep.

**Fix:** Extract `isVisible(p: CatalogProduct): boolean` into a new file at `src/lib/catalog/filters.ts`. Replace both inline callsites with the helper. Add unit tests covering hidden true, hidden false, missing-field fallback. After the change, grep `!p.hidden` should match only the helper definition (or zero hits if the helper inverts the check).

### M4 — Validate `Status` length in `parseRow`

**Location:** `src/lib/catalog/csv.ts:111`

`status` is currently `string | null` with no validation. A merchant with `Status: "A".repeat(200)` gets layout-breaking UI labels.

**Fix:** Add a max-length validator (suggested cap 50 chars). Emit a `CatalogValidationError` for anything longer. Leave content free-form otherwise. Do NOT enum-lock merchants to a fixed status vocabulary. One new test.

### M5 — Stale order-sheet plan

**Location:** `docs/superpowers/plans/2026-04-15-order-sheet.md`

Describes the now-deleted Order Sheet page/component. Stale docs are bugs (CLAUDE.md). Both `docs/todo/` order-sheet docs already moved to `docs/todo/archive/`; this last plan is the remaining trailing reference.

**Fix:** Move to `docs/todo/archive/` with a one-line note about supersession, or delete. Either is fine. Archive is lower cognitive load.

### M6 — Delete dead `src/lib/order-sheet/` directory

**Location:** `src/lib/order-sheet/types.ts`, `src/lib/order-sheet/validation.ts`

After deletion of `src/components/OrderSheet/*` and `src/pages/order-sheet.astro`, the `src/lib/order-sheet/` directory lingers with aliased types (`OrderSheetItem`, `OrderValidationError`, `OrderValidation`) that re-export from `validation/types.js`. Verified zero callers outside the directory itself. Barrel-export risk per CLAUDE.md ("every barrel export is a public API contract").

**Fix:** Delete the directory. If grep surfaces any import you missed, migrate the caller to import from `validation/types.js` directly, then delete.

### D2 — Default `Hidden` in `makeCSVRow`

**Location:** `tests/unit/catalog/helpers.ts:33-40`

The default return has no `Hidden` key. Tests override explicitly when needed. Style point, not a correctness issue. Adding a canonical fixture row with every column present keeps test code readable.

**Fix:** Add `Hidden: ''` to the helper default.

## Files you'll touch

- New: `src/lib/catalog/filters.ts` (M1)
- New: `tests/unit/catalog/filters.test.ts` (M1)
- Edit: `src/lib/storefront/get-listings.ts` (M1)
- Edit: `src/lib/stripe/catalog-cli.ts` (M1)
- Edit: `src/lib/catalog/csv.ts` (M4)
- Edit: `tests/unit/catalog/csv.test.ts` or sibling (M4 — one new test)
- Move or delete: `docs/superpowers/plans/2026-04-15-order-sheet.md` (M5)
- Delete: `src/lib/order-sheet/types.ts`, `src/lib/order-sheet/validation.ts`, parent directory (M6)
- Edit: `tests/unit/catalog/helpers.ts` (D2)

## Don't touch

- The `Hidden` parsing / `hidden` property semantics (already shipped, not in scope).
- The `Status` runtime behavior for non-overlong values (free-form stays free-form).
- Any `OrderSheet` component or page — already deleted; the directory cleanup is just trailing references.

## Tests

Failing-test-first per `docs/tdd.md`:
- M1: write `filters.test.ts` first, then extract the helper.
- M4: write the over-long `Status` test against `parseRow` first, then add the validation.
- D2: no new test needed; existing `helpers.ts` consumers continue to pass.

## Source

Items M1, M4, M5, M6, D2 from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md`.
