# Red Team: Listings View Toggle

## High

### `orderSheet` backwards-compat logic has untested edge case

**Location:** `src/lib/storefront/config.ts:46`

When `{ orderSheet: true, listings: { views: ['garbage'] } }` is passed, the `orderSheet` fallback doesn't fire because the first branch consumed `listings`. User gets `['card']` only. Behavior is correct but untested.

**Status:** Open (add test)

### No tests for new Astro components or client-side logic

**Location:** `src/components/Listings/*.ts`, `src/components/Listings/*.astro`

Zero test coverage for toggle swap, cart hydration, quantity wiring, and prop resolution.

**Status:** Open (add tests). Tracked under `cart-listings-test-coverage.md`.

## Medium

### `inactiveView` logic assumes only two views exist

**Location:** `src/components/Listings/Listings.astro:29`

Hardcodes `activeView === 'card' ? 'table' : 'card'` instead of deriving from enabled views.

**Status:** Open

### `<script>` tag inside `<div>` is not idiomatic Astro

**Location:** `src/components/Listings/Listings.astro:72`

Works but unconventional. Standard is root-level placement.

**Status:** Open

### CSS icons use hardcoded pixel offsets

**Location:** `src/components/Listings/Listings.css:63,69,93`

Box-shadow offsets won't scale if icon size is customized. Acceptable since no size tokens exist today.

**Status:** Open (note for future)

### Duplicate `data-wired` markers persist across toggle swaps

**Location:** `src/components/Listings/listings.ts:176-177,210-211`

Correct behavior for the current move-based swap. Would break if swap mechanism changed to cloning.

**Status:** Open (note for future)
