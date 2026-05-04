# Listings Toggle — Follow-ups

## Status

Open. Two surviving items from the dissolved listings-toggle red-team review (`docs/todo/archive/2026-04-19-listings-toggle-red-team.md`). All other items in the original review verified obsolete (orderSheet shim removed, CSS icons tokenized, `data-wired` swap moved to root delegation) or are tracked as duplicate-of-record under `docs/todo/cart-listings-test-coverage.md`.

## Problem

### `inactiveView` is hardcoded for the two-view case

**Location:** `src/components/Listings/Listings.astro:47`

The toggle derives `inactiveView` as `activeView === 'card' ? 'table' : 'card'`. That ternary assumes the only two possible views are `'card'` and `'table'`. The config schema (`ListingsConfig.views`) is already typed `('card' | 'table')[]`, so today the assumption holds, but the toggle should derive from `config.listings.views` (the enabled set) rather than encoding the pair inline. A future third view would silently break the toggle.

**Fix:** Compute `inactiveView` as "the next enabled view that isn't `activeView`," sourced from the resolved `views` array. If only one view is enabled, the toggle button should not render at all (verify current behavior matches).

### `<script>` tag inside `<div class="cs-listings">` is not idiomatic Astro

**Location:** `src/components/Listings/Listings.astro:95`

The `<script>` tag is currently nested inside the component's root `<div>`. Works, but Astro's standard pattern places `<script>` blocks at the root of the component template (sibling to the markup, not child of it). Move to root level.

## Files you'll touch

- Edit: `src/components/Listings/Listings.astro` (both items)

## Don't touch

- `src/components/Listings/listings.ts` — these are markup/template changes, not behavior changes.
- The view toggle event wiring — already correct.

## Tests

Lives under `docs/todo/cart-listings-test-coverage.md` (the `listings.ts` matrix). When that DOM test infrastructure lands, add a regression test that asserts toggling between enabled views computes the inactive view from the enabled set, not from a hardcoded pair.

## Source

Items M1 (`inactiveView`) and M2 (`<script>` placement) from the dissolved `docs/todo/archive/2026-04-19-listings-toggle-red-team.md`. The other four items in that audit verified obsolete or moved to `docs/todo/cart-listings-test-coverage.md`.
