# Cart Banner Polish

## Status

Open. Two items from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md` (M2, M7). Both are cart-side polish; neither is a correctness bug.

## Problem

### M2 — Banner rebuilds on every hydration

**Location:** `src/components/Cart/cart.ts:119-143`

`hydrateFromCart` tears down and rebuilds the unavailable banner via `replaceChildren`-style mutation on every call, including on trivial cart mutations that didn't change the unavailable set. Over a session with many qty bumps, this causes visible flicker and unnecessary repaints.

**Fix:** Cache the last-rendered unavailable signature (an array of SKUs joined into a string, or a `Set` equality check). Skip the rebuild when the set hasn't changed. Preserve current behavior when the set DOES change.

### M7 — Qty control transitions lack screen-reader announcement

**Location:** `src/components/Listings/listings.ts:166`

The remove button is hidden/shown based on qty crossing 0 ⇄ 1. No `aria-live` region announces the new actionable control to screen readers. Sighted users see the button appear; screen-reader users hear the qty number change but don't learn a remove control just appeared.

**Fix:** Either wrap the qty control in `aria-live="polite"`, or add a hidden polite announcer (visually-hidden `<div role="status" aria-live="polite">`) that fires a short message like "Remove available" on the 0→1 transition. Match whatever pattern the rest of the repo uses for polite announcements (grep for existing `aria-live` usage first).

## Files you'll touch

- Edit: `src/components/Cart/cart.ts` (M2)
- Edit: `src/components/Listings/listings.ts` (M7)
- Edit: `src/components/Listings/ListingCards.astro` or `ListingTable.astro` (M7 — wherever the announcer lands)

## Don't touch

- The unavailable banner markup in `Cart.astro`. The signature cache lives in JS only.
- The remove button visibility logic itself. The fix is announcement, not behavior.

## Tests

Lives under `docs/todo/cart-listings-test-coverage.md` (DOM test infra prerequisite). When that infrastructure lands:
- M2: test that two `hydrateFromCart` calls with the same unavailable set do NOT cause `replaceChildren` (or equivalent rebuild) to fire. Spy on the relevant DOM mutation.
- M7: test that the polite announcer's `textContent` updates on the 0→1 transition and does not update on subsequent qty changes within the >0 range.

## Source

Items M2 (banner flicker) and M7 (aria-live) from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md`.
