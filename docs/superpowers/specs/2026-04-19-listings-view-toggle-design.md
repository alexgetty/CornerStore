# Listings View Toggle

Merge the card-based store view and table-based order sheet into a single `<Listings />` component with a card/table toggle.

## Motivation

Two separate components (`Listing`/`Listings` and `OrderSheet`) serve the same purpose: display products from the catalog. They share the same data model, cart integration pattern, and quantity control logic but live on separate pages with separate URLs. Merging them into one component with two view modes eliminates redundancy and gives consumers a single, flexible building block.

## Component API

```html
<!-- Default: renders first view from config.listings.views -->
<Listings />

<!-- Explicit mode override -->
<Listings mode="table" />

<!-- Toggle enabled: both views server-rendered, inactive in <template> -->
<Listings toggle />

<!-- Both -->
<Listings mode="table" toggle />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `"card"` \| `"table"` | First entry in `config.listings.views` | Which view to render. Falls back to config default if the specified mode isn't in the enabled views. |
| `toggle` | `boolean` | `false` | Renders toggle UI and the alt view inside a `<template>`. Only effective when `config.listings.views` has both entries. Ignored if only one view is enabled. |

## Config

```js
// cornerstore.config.js
{
  listings: {
    views: ['card', 'table'],  // enabled views, first = default
    // views: ['card'],        // card only, no toggle rendered
    // views: ['table'],       // table only, no toggle rendered
  }
}
```

Replaces the existing `config.orderSheet` boolean.

## Architecture

### File Structure

```
src/components/Listings/
  Listings.astro        # Orchestrator: resolves mode, renders toggle + active/template views
  Listings.css          # Toggle UI + container styles
  ListingCards.astro    # Card grid markup
  ListingCards.css      # Card styles
  ListingTable.astro    # Table markup
  ListingTable.css      # Table styles
  listings.ts           # Toggle swap logic, cart integration, quantity controls
```

### Orchestrator (Listings.astro)

Resolves which view to render:

1. Read `config.listings.views` for enabled views.
2. Determine active view: `mode` prop if provided and valid, otherwise first entry in config.
3. Render the active sub-component directly in the DOM.
4. If `toggle` is true and both views are enabled, render the inactive sub-component inside a `<template>` element.
5. Render toggle UI (if applicable).

### Sub-components

**ListingCards.astro** - Extracted from current `Listing.astro` + `Listings.astro`. Card grid layout. Each product is an `<article>` with image, name, description, price, and quantity controls.

**ListingTable.astro** - Extracted from current `OrderSheet.astro`. Table layout with category grouping. Each product is a `<tr>` with image thumbnail, name, price columns, MOQ, and quantity controls.

Both sub-components are pure display: they receive `Listing[]` as props and render markup. No data fetching.

### Toggle Mechanism

The `<template>` HTML element holds the inactive view's markup. Content inside `<template>` is parsed but not rendered: not visible, not focusable, not in the accessibility tree, images don't load.

On toggle click, `listings.ts`:

1. Moves current live content into a new `<template>`.
2. Pulls the `<template>` content into the live DOM.
3. Re-wires quantity controls and cart listeners on the newly active view.
4. Updates `aria-pressed` on toggle buttons.
5. Persists view preference to localStorage.

### Toggle UI

Two icon buttons (card icon, table icon) rendered inline above the product grid. Only present when `toggle` is true and config has both views enabled. Active button has `aria-pressed="true"`.

### Cart Integration

Both views have per-item quantity controls (add-to-cart button, +/- buttons, quantity input). Shared logic in `listings.ts`:

- Read cart state from localStorage on hydration.
- On quantity change: validate against MOQ (snap to MOQ), update localStorage, dispatch `cs:cart-updated` event.
- On `cs:cart-updated` event or storage event: re-read cart, update displayed quantities in the active view.
- Re-wire listeners after toggle swap.

No checkout flow, no subtotal bar, no order validation. That functionality belongs to the cart system (separate work).

## Cart Mode

View mode (card/table) is orthogonal to cart mode (wholesale/DTC). Cart mode controls business logic (pricing columns, validation rules). View mode controls visual layout.

Wholesale is the only implemented cart mode for now. DTC is stubbed. The `<Listings />` component does not need to know about cart mode directly; it renders what the data layer provides.

## Data Flow

1. `Listings.astro` calls `getListings()` to get `Listing[]` from the catalog.
2. Passes `Listing[]` to the active sub-component (and the template sub-component if toggle is enabled).
3. Sub-components render markup. No data fetching.
4. `listings.ts` hydrates quantity controls and cart sync on the client.

## Removals

| Item | Disposition |
|------|-------------|
| `src/pages/order-sheet.astro` | Deleted |
| `src/components/Listing/` | Absorbed into `ListingCards`, then deleted |
| `src/components/Listings/` (current) | Replaced by new orchestrator |
| `src/components/OrderSheet/` | Absorbed into `ListingTable`, then deleted |
| `CatalogProduct.orderSheet` flag | Removed. `storefront` flag covers both views. |
| `getOrderSheetListings()` | Removed. `getListings()` covers both views. |
| `config.orderSheet` | Replaced by `config.listings.views` |
| Nav link to `/order-sheet` | Removed from default config |

## What Stays Unchanged

- Cart module (`src/lib/cart/`) - no changes
- Validation module (`src/lib/validation/`) - no changes
- Pricing module (`src/lib/storefront/pricing.ts`) - no changes
- `getListings()` - no changes
- `Listing` type - no changes
