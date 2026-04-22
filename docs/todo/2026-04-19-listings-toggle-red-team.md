# Red Team: Listings View Toggle

## Critical

### `Listing` export removed but still imported by pages

**Location:** `src/pages/index.astro:3`, `src/pages/[slug].astro:3`, `bin/init.mjs:256,287`

`Listing` was removed from the barrel export but both page files still import it. The `Listing` component was passed to MDX rendering as a component override, allowing users to write `<Listing product="something" />` in their MDX files for single-product embeds. That use case is now broken.

**Status:** Fixed

## High

### `bin/init.mjs` scaffolds deleted page and references removed exports

**Location:** `bin/init.mjs:39-65,173-235,256,275,287,310`

The CLI init command still asks "Order Sheet? (Y/n)", scaffolds `src/pages/order-sheet.astro` with deleted imports, adds Order Sheet nav link, and passes `{ Listings, Listing }` to MDX components.

**Status:** Fixed (prompt changed to "Table view (wholesale)?", scaffolds `listings` config, order-sheet page removed)

### `orderSheet` backwards-compat logic has untested edge case

**Location:** `src/lib/storefront/config.ts:46`

When `{ orderSheet: true, listings: { views: ['garbage'] } }` is passed, the `orderSheet` fallback doesn't fire because the first branch consumed `listings`. User gets `['card']` only. Behavior is correct but untested.

**Status:** Open (add test)

### `listings.ts` localStorage value used unsanitized in selector

**Location:** `src/components/Listings/listings.ts:138-142`

The `saved` value from localStorage is interpolated directly into a CSS selector string. Should validate against known values ('card'|'table') before use.

**Status:** Fixed (validates saved === 'card' || saved === 'table' before use)

### No tests for new Astro components or client-side logic

**Location:** `src/components/Listings/*.ts`, `src/components/Listings/*.astro`

Zero test coverage for toggle swap, cart hydration, quantity wiring, and prop resolution.

**Status:** Open (add tests)

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
