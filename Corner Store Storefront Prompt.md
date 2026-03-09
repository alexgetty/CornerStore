---
id: '-csStorefrontPrompt'
tags:
  - working-doc
date created: 2026-03-08
date modified: 2026-03-08
---

You are building a minimal static storefront called Corner Store. It fetches products from Stripe at build time and links each one directly to a Stripe Payment Link for checkout. No cart, no API, no client-side JS. The "Buy Now" button is a plain `<a>` tag to Stripe's hosted checkout.

This is a proof of concept. Make it work, not pretty. Build every file with complete contents. No placeholders, no stubs.

## Tech Stack

- **Astro** (latest stable), SSG mode only (`output: 'static'` in `astro.config.mjs`)
- **TypeScript** everywhere
- **Stripe Node SDK**, build-time only
- **Minimal CSS.** Enough to make a product grid readable. Browser defaults are fine for everything else.
- **Zero client-side JS.** Payment Links are plain `<a>` tags.

## Project Structure

```
corner-store/
├── .env.example
├── .gitignore
├── SETUP.md
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── src/
│   ├── lib/
│   │   └── stripe.ts          # Build-time Stripe data fetching
│   ├── layouts/
│   │   └── Base.astro          # HTML shell
│   ├── components/
│   │   ├── ProductCard.astro   # Single product: image (grey placeholder if none), name, price, buy link
│   │   └── ProductGrid.astro   # Grid wrapper
│   └── pages/
│       ├── index.astro         # Product grid
│       ├── success.astro       # Post-checkout
│       └── cancel.astro        # Checkout cancelled
└── public/
    └── favicon.svg
```

## Environment Variables

`.env.example`:
```
STRIPE_SECRET_KEY=
```

Build-time only. Must NOT be prefixed with `PUBLIC_`. Accessed via `import.meta.env.STRIPE_SECRET_KEY` in `src/lib/stripe.ts`.

## Build-Time Data Fetching: `src/lib/stripe.ts`

This module runs at build time only.

1. Initialize Stripe client using `STRIPE_SECRET_KEY` from `import.meta.env`. Fail fast with a clear error if the key is missing.
2. Export `getProducts()`:
   - Fetches all active products with their default prices from Stripe. Use auto-pagination to get every product, not just the first page. Stripe requires a price to save a product, so `default_price` is always present on active products.
   - Reads `metadata.payment_link` from each product (the Stripe Payment Link URL, e.g. `https://buy.stripe.com/test_abc123`). Products missing this field are skipped with a `console.warn`.
   - Returns an array of objects with: `name`, `description`, `image` (first image from Stripe, or `null` if none), formatted `price` (USD only), and `paymentLink`.
   - The displayed price comes from the product's `default_price`. The Payment Link handles its own pricing at checkout. These may differ if the merchant updates one without the other, but that's a merchant workflow concern, not a storefront concern.
3. Type using `Stripe.Product` and `Stripe.Price` from the SDK. No `any`.

## Critical Rules

- NEVER import Stripe SDK in client code
- NEVER reference `STRIPE_SECRET_KEY` in any way that reaches the browser
- All product data rendered as static HTML at build time
- Checkout = user clicks a link. That is it.

## Out of Scope

Do not build: cart, serverless API, config file, theme system, design tokens, CSS custom properties, webhooks, order management, user accounts, inventory, email, analytics, testing, CI/CD. Product images come from Stripe.

## `SETUP.md`

Include this file with steps:

1. Create products in Stripe Dashboard (test mode)
2. For each product, create a Payment Link in the Dashboard
3. Copy the Payment Link URL into the product's `metadata.payment_link` field
4. Set Payment Link success URL to `{your-site}/success`, cancel to `{your-site}/cancel`
5. Copy Secret Key to `.env` as `STRIPE_SECRET_KEY`
6. `npm install && npm run dev`

## Checklist

1. `npm run dev` works with Stripe test keys
2. Products fetched from Stripe. Zero hardcoded.
3. Products missing `metadata.payment_link` skipped with warning
4. "Buy Now" is a plain link to Stripe Payment Link
5. No client-side JavaScript in built output

