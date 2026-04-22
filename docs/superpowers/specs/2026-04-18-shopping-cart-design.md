# Shopping Cart Design Spec

## Overview

Client-side shopping cart for Corner Store storefronts. The cart is a standalone data layer that any UI surface (order sheet, storefront listings, future cart page) can read from and write to. Wholesale-only for the first implementation, with the architecture supporting DTC as a future mode.

Checkout routes to Stripe Checkout Sessions via a single serverless function. PDF generation (existing order sheet behavior) serves as a resilient fallback when Stripe/server is unavailable.

## Data Model

### CartItem

```typescript
interface CartItem {
  sku: string;
  quantity: number;
}
```

Intentionally thin. No prices, names, or images. The cart holds what you want to buy and how many. UI layers resolve display data from the catalog at render time.

### Cart

```typescript
interface Cart {
  items: CartItem[];
  mode: 'wholesale' | 'dtc';
}
```

### CartRules

```typescript
interface CartRules {
  validateItem(item: CartItem, catalog: CatalogProduct): ItemValidation;
  validateCart(items: CartItem[], catalog: CatalogProduct[]): CartValidation;
}
```

Mode-specific behavior is injected as rules, not hardcoded. Wholesale rules enforce MOQ per item and minimum cart size. DTC rules (future) are permissive. The cart core doesn't know which mode it's in; it runs whatever rules it was given.

## Cart Core

### Operations

```
getCart() -> Cart
setItem(sku, quantity) -> void
removeItem(sku) -> void
clear() -> void
getSummary(catalog, rules) -> CartSummary
```

`setItem` with quantity 0 is equivalent to `removeItem`. No separate "add" vs "update" distinction.

### Persistence

localStorage under a single key (`cs-cart`). Every write serializes the full cart. Every read deserializes. No in-memory cache that can drift from storage.

### Events

Two event mechanisms for sync:

1. **Same-tab:** Cart dispatches a custom event on `window` (`cs:cart-updated`) after every write.
2. **Cross-tab:** The browser's `storage` event fires when localStorage changes from another tab.

Any UI surface listens for both. Between the two, every consumer stays in sync.

### Validation is a Read Operation

Rules are not enforced on write. You can add an item that violates MOQ. The cart stores what you tell it. Validation is queried separately via `getSummary` or direct rule calls.

The UI should be smart about this: when a buyer types a quantity below MOQ and leaves the field, the UI snaps it up and shows a helpful note ("Minimum order: 12"). Not a red error. Helpful correction.

## Cart Summary

`getSummary(catalog, rules)` returns:

- **Subtotal** at the applicable pricing (wholesale margin applied)
- **Shipping status:** "Free shipping" | "$X.XX shipping" | "$Y.YY more for free shipping"
- **Distance to minimum order:** "$42.00 away from $150.00 minimum" or null if met
- **Validation result** from the rules

Pure function, no side effects. Catalog data is passed in by the caller. On the order sheet, this comes from data attributes already in the DOM. Future UI surfaces (cart page, storefront) will resolve catalog data from whatever source is available to them at render time (Astro build data, inline JSON, etc.).

## Shared Validation

MOQ and min cart size validation functions currently live in `src/lib/order-sheet/validation.ts`. These become shared utilities:

```
src/lib/validation/    <- pure functions, shared
src/lib/cart/          <- imports from validation
src/components/OrderSheet/ <- imports from validation (standalone mode)
                           <- imports from cart (enhanced mode)
```

The cart's wholesale rules compose from these shared functions. The order sheet's standalone fallback calls them directly. One source of truth for the math.

## Wholesale Rules

- **MOQ per item:** Each product has an optional `moq` field. Quantity must be 0 (not in cart) or >= MOQ. Items without MOQ accept any quantity > 0.
- **Minimum cart size:** Optional `minCartSize` config value. Cart subtotal (at wholesale price) must meet or exceed it.
- **Wholesale pricing:** Server applies `wholesaleMargin` from config when creating the Stripe Checkout Session. Client displays wholesale prices for UX feedback using the same margin, but the server is the pricing authority.

## Checkout Flow

### Happy Path: Stripe Checkout

1. Buyer hits "Checkout" on the order sheet.
2. Client validates cart (MOQ, min cart size). If invalid, show messages, block submit.
3. Client sends `{items: [{sku, quantity}]}` to `POST /api/checkout`.
4. Server looks up Stripe prices, applies wholesale margin, validates server-side.
5. Server creates Stripe Checkout Session with line items, shipping config, success/cancel URLs.
6. Server returns `{url: string}`.
7. Client redirects to Stripe.
8. Stripe handles address, payment, review, confirmation.
9. Stripe redirects to `/success`.

### Fallback: PDF Generation

On first checkout failure, show error message and surface the PDF download option alongside a "Try Again" button. Both stay available. Buyer decides. No forced fallback, no retry limit.

PDF generation uses the existing `html2pdf.js` workflow: clone DOM, strip UI elements, replace inputs with text, generate PDF, show mailto link.

### Server Responsibilities

**Validates:**
- Every SKU exists in the catalog
- Every quantity meets MOQ
- Cart subtotal (at wholesale price) meets minimum
- All prices computed server-side from catalog + margin config

**Does not:**
- Authenticate. No user system.
- Persist the cart. Client owns that.
- Check real-time inventory. Catalog `status` field is what exists.

## Config Additions

Two new optional fields on `StoreConfig`:

```typescript
shippingFlat?: number;          // Flat shipping rate in dollars (e.g., 5.99)
shippingFreeThreshold?: number; // Order subtotal above which shipping is free
```

These feed into:
- **Cart summary** (client): displays shipping status based on subtotal
- **Checkout session** (server): applies the correct Stripe shipping rate

Existing config fields used by the cart: `wholesaleMargin`, `minCartSize`.

## Order Sheet Integration

Progressive enhancement. The order sheet works in two layers:

### Base Layer (standalone, no cart)

Self-contained DOM behavior. Quantities in inputs, validation on change, PDF generation on submit. This is what exists today. Works if the cart module fails to load, if localStorage is unavailable, or if the store owner doesn't use the cart at all.

### Enhancement Layer (with cart)

When the cart module is available:
- **On page load:** Order sheet hydrates quantity inputs from cart state. Products not in the cart show zero. Products in the cart show their saved quantity.
- **On quantity change:** Order sheet writes to the cart via `setItem`. Cart persists, fires event.
- **On submit:** Routes to the checkout endpoint instead of PDF. On failure, PDF option appears alongside retry.
- **On cart event from another tab:** Rehydrates inputs from updated cart state.

The order sheet is a consumer of the cart, not the owner. If the cart isn't present, the order sheet doesn't degrade. It just runs its base behavior.

## Future: Storefront Integration

Not in scope for this implementation. When added:
- Storefront listings get "Add to Cart" buttons that call `setItem`.
- A cart page or drawer reads from the cart and displays items with quantities.
- Same cart module, same rules, different UI surface.
- DTC mode uses permissive rules (no MOQ, no min cart size).

## What This Is Not

- No user accounts or authentication
- No server-side cart persistence
- No real-time inventory system
- No tier-based pricing
- No multi-step checkout form (Stripe Checkout handles that)
- No approval workflows, PO systems, or net terms
