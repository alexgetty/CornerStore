# Seller Setup Experience

## Context

The storefront builds and works, but the seller experience when setting things up is rough. Build failures produce cryptic stack traces, silent failures result in empty stores with no explanation, and SETUP.md references the old metadata approach that no longer exists.

During red team review, a fundamental architecture issue was identified: the current model fetches products first and then finds matching payment links (product-first). This creates a strict one-to-one relationship that doesn't align with Stripe's data model, where payment links can contain multiple products. The correct approach is link-first — fetch payment links, then populate with product data.

---

## Architecture: Link-First Model

**Status:** Implemented

### The Problem

The current implementation fetches products, then finds payment links that match. This:

- Forces a one-to-one relationship between products and payment links
- Breaks when a payment link contains multiple products (bundles)
- Misrepresents what's actually purchasable — payment links are the buyable thing, not products
- Contradicts Stripe's data model where payment links are containers for one or many products

### The Fix

Invert the flow. Payment links are the anchor:

1. Fetch all active payment links
2. For each link, fetch its line items to get price IDs
3. Fetch product data for those prices
4. Render cards based on payment links, populated with product data

### Single-Product Links

No config needed. The card inherits all metadata from the one product: name, description, image, image alt text.

### Multi-Product Links (Bundles)

Two paths:

**Without config (default):** The build auto-generates display metadata:
- **Title:** "Bundle" + last 4 characters of the payment link ID (e.g., "Bundle a3f9"). Stable across builds — derived from the link itself, not fetch order.
- **Description:** "This bundle includes: Soy Candle, Candle Holder, Matchbox" (lists included product names)
- **Image:** Image from the product whose name sorts first alphabetically. Stripe does not guarantee line item ordering, so fetch order is not stable — alphabetical by product name is deterministic across builds.
- **Price:** Sum of line item amounts if all share the same currency. If currencies are mixed, omit price from the card and emit a build warning (Stripe likely reconciles via presentment currency at checkout, but we don't have access to that conversion — don't guess what the customer will see).

Renders a card that's functional if not pretty. Sellers who want better presentation create a config file. The display name is not an identifier — the payment link URL is the canonical identifier throughout the system. In the effectively impossible case of a 4-char collision (62⁴ = 14.8M combinations), the build appends additional characters from the link ID to disambiguate and warns the seller.

**With config:** Seller creates a markdown file in `/bundles/` with frontmatter:

```md
---
link: https://buy.stripe.com/9B6fZg0R60sh1s32A5g3604
title: Holiday Candle Set
description: Everything you need for a cozy night
image: holiday-bundle.jpg
---
```

- **`link`** (required): Full payment link URL, one-click copyable from Stripe dashboard
- **`title`**: Overrides the auto-generated "Bundle N" name
- **`description`**: Overrides the auto-generated product list
- **`image`**: Filename of an image stored with the bundle config. Overrides the first-product fallback
- **`image_alt`**: Alt text for the bundle image. Falls back to `title` if not specified

Filename of the markdown file is arbitrary — the `link` URL is the identifier. If multiple config files reference the same link, the build uses the first file found alphabetically by filename and warns about the duplicates.

### Type Architecture

Two-layer schema: domain types → display types.

**Domain types** — what the seller manages:
- **`Product`** — canonical representation of a single product (sourced from Stripe)
- **`Bundle`** — canonical representation of a multi-product grouping (sourced from Stripe + local config)

**Display types** — what the buyer sees:
- **`CatalogListing`** — discriminated union (`SingleListing | BundleListing`), the renderable card for catalog views
- **`DetailListing`** — future display type for individual product/bundle detail pages, branching on the discriminant for layout differences

The build pipeline transforms Stripe data → domain types → display types. The catalog card component accepts `CatalogListing` and renders both variants identically. Detail pages will use `DetailListing` to switch on the discriminant for layout, content depth, and visual differentiation.

---

## Error Handling & Build Pipeline

**Status:** Implemented

### What Survives the Architecture Shift

These decisions are independent of the product-first vs link-first flow:

**StripeSetupError class** — extends Error, adds `guidance` property. All errors prefixed with `[Storefront]`, reference `SETUP.md#{section}`. Original error preserved as `cause`. Already implemented.

**Env validation** — check `STRIPE_SECRET_KEY` exists, is non-empty, starts with `sk_`. Already implemented.

**Stripe error wrapping** — check error `type` string (not `instanceof`). Map of six Stripe error types to user-friendly messages with guidance sections. Non-Stripe errors pass through unwrapped. Already implemented.

**Error path test rule** — test each distinct throw site inside a try block. One test per `await`/throwing call that can fail independently. Coverage tools can't distinguish them since they hit the same `catch` line.

**Currency formatting** — format prices with `Intl.NumberFormat`. Remove hardcoded `$` and `content="USD"`. Already implemented, survives as-is.

**Dead `warnSpy` cleanup** — remove unused `console.warn` mocks from tests.

### Build Pipeline (Link-First)

1. **Validate env** — same as current
2. **Fetch active payment links** → error if zero
3. **For each link, fetch line items** → warn and skip link if fails or empty
4. **Collect unique price IDs, fetch product data** → warn and skip affected links if product not found
5. **Load bundle config files** from `/bundles/`
6. **Build cards** — single-product inherits from product, multi-product uses config or auto-generates
7. **Error if zero cards built**
8. **Warnings, then summary**

Each active payment link becomes a card. Multiple links referencing the same product are distinct offerings — both get cards. No collision logic, no suppression.

### Build Summary

Warnings first, then summary. Links by URL.

```
[Storefront] Build complete:
  Payment links found: N
  Single-product cards: N
  Bundle cards: N (M customized, K auto-generated)
  Links skipped: N
```

Principles:
- Every count must be accurately labeled
- Show what was found, what was built, what was skipped
- Each warning should be actionable — the seller can find the thing in their Stripe dashboard or project files

### Warning Categories

| Category | Meaning | Example |
|----------|---------|---------|
| Skipped links | Active link couldn't become a card | `buy.stripe.com/xyz: referenced product not found` |
| Orphaned configs | Bundle config doesn't match any active link | `my-bundle.md: no matching payment link` |
| Unconfigured bundles | Multi-product link rendered with defaults | `buy.stripe.com/abc: 3 products, no bundle config — using defaults` |
| Mixed currencies | Bundle line items have different currencies, price omitted | `buy.stripe.com/abc: mixed currencies (USD, GBP) — price omitted` |
| Duplicate configs | Two config files reference the same payment link | `my-bundle.md: duplicate link — already configured in holiday-set.md, using holiday-set.md` |
| Display name collision | Two bundles generated the same 4-char suffix | `Bundle a3f9: display name collision with another bundle — extended to "Bundle a3f9c" to disambiguate` |

### What Gets Rewritten

- **Type architecture** — current `Product` type replaced with two-layer schema: `Product` and `Bundle` (domain), `CatalogListing` discriminated union (display), with `DetailListing` planned for detail pages. See "Type Architecture" section above
- **Price and currency source** — currently pulled from `default_price`. In link-first, price and currency come from the line item's price. Single-product links: price from the one line item. Multi-product links: sum line item amounts if all currencies match; omit price if mixed.

---

## SETUP.md Rewrite

**Status:** Implemented

Current SETUP.md is accurate for the product-first model. After link-first migration, update:

1. "Setting Up Stripe" section — explain link-first matching, bundle support
2. "Build and Verify" section — new summary format
3. "Troubleshooting" sections — new/changed error messages
4. "How It Works" section — describe link-first flow
5. Add section on bundle configuration (markdown files)

### Troubleshooting Sections

These error-to-guidance mappings survive as-is:
- `#missing-api-key` — STRIPE_SECRET_KEY not set
- `#invalid-key-format` — key doesn't start with `sk_`
- `#invalid-api-key` — StripeAuthenticationError
- `#insufficient-permissions` — StripePermissionError
- `#connection-error` — StripeConnectionError
- `#rate-limit` — StripeRateLimitError
- `#invalid-request` — StripeInvalidRequestError
- `#stripe-api-error` — StripeAPIError

Updated for link-first:
- `#no-payment-links` — zero active payment links (primary empty-state check)
- `#no-cards` — payment links exist but zero cards could be built (all links had issues)
- `#no-products` — removed or reworked (products are fetched per-link, not independently)

---

## Stripe Facts

Constraints confirmed through testing and research — do not re-litigate:

- Stripe dashboard requires a price before saving a product. "No default price" is impossible via dashboard. Only a potential future edge case if the hosted version creates products via API.
- Stripe dashboard supports one image per product.
- Payment links can contain multiple products (line items). Stripe allows creating multiple payment links for the same price — this is by design for different checkout configurations (tax, quantities, etc.).
