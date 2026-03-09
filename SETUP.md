# Setup

## Prerequisites

- Node.js 18+
- A [Stripe](https://stripe.com) account (test mode is fine)

## 1. Install dependencies

```sh
npm install
```

## 2. Create Stripe test products

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products) (make sure you're in **test mode**)
2. Create a product with a name, price, and optionally an image and description
3. Under the product, create a **Payment Link** (Products > click product > create payment link)
4. Copy the Payment Link URL (e.g., `https://buy.stripe.com/test_xxx`)
5. Add it as product metadata: key = `payment_link`, value = the URL

Repeat for as many products as you want.

## 3. Configure environment

Create a `.env` file in the project root:

```
STRIPE_SECRET_KEY=sk_test_your_key_here
```

Get your test secret key from [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys).

## 4. Run

```sh
# Development
npm run dev

# Build static site
npm run build

# Preview built site
npm run preview
```

## 5. Verify

```sh
# Type checking
npm run typecheck

# Tests with coverage
npm run test:coverage

# Full CI pipeline (typecheck + coverage + build)
npm run ci
```

## How it works

- At build time, Astro calls `getProducts()` which fetches all active products from Stripe
- Products without a `payment_link` in their metadata are skipped
- Each product renders as a card with a "Buy" link pointing to the Stripe Payment Link
- No client-side JavaScript. No database. No API. Just static HTML + CSS.
