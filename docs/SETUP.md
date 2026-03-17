# Setup

## Prerequisites

- Node.js 18+
- A [Stripe](https://stripe.com) account (test mode is fine)
- A Stripe secret API key (`sk_test_*` or `sk_live_*`)

## Quick Start

```sh
npm install
echo "STRIPE_SECRET_KEY=sk_test_your_key_here" > .env
npm run dev
```

If the build succeeds, you'll see a summary of matched payment links. If something's wrong, the error message will point you to the relevant section below.

## Setting Up Stripe

The storefront is link-first: it starts from your payment links and pulls product data from them automatically. No manual matching needed.

### Payment Links

Each active payment link becomes a card on your storefront. Create them in [Stripe Dashboard > Payment Links](https://dashboard.stripe.com/test/payment-links):

1. Click **New** and select one or more products
2. The link is live immediately — the storefront picks it up at build time

**Single-product links** inherit everything from the product: name, description, image, price.

**Multi-product links** (bundles) auto-generate display metadata or use a config file — see [Bundle Configuration](#bundle-configuration) below.

### Products

Products are set up in [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products). Each product needs:

- **Name** (required)
- **Price** (required) — this is how the storefront gets pricing
- **Image** (optional) — one image per product, set in the Stripe dashboard
- **Description** (optional)

### Optional: Image Alt Text

Add descriptive alt text for product images via Stripe metadata:

1. Go to the product in Stripe Dashboard
2. Under **Metadata**, add key `image_alt` with a descriptive value (e.g., "A hand-poured soy candle in amber glass")

If no `image_alt` metadata is set, the product name is used as the alt text.

## Bundle Configuration

Multi-product payment links automatically get a card with generated metadata:

- **Title:** `Bundle` + last 4 characters of the link ID (e.g., "Bundle a3f9")
- **Description:** Lists included products alphabetically (e.g., "This bundle includes: Candle, Holder, Matchbox")
- **Image:** First product's image (alphabetically by name)
- **Price:** Sum of product prices if all use the same currency; omitted if currencies differ

To customize a bundle's appearance, create a subdirectory in `/bundles/` with a markdown config file and any images:

```
bundles/
  holiday-set/
    bundle.md
    photo1.jpg
    photo2.jpg
  starter-kit/
    my-notes.md
    hero.png
```

The markdown file contains frontmatter configuration:

```md
---
link: https://buy.stripe.com/your_payment_link_url
title: Holiday Candle Set
description: Everything you need for a cozy night
cover: photo2.jpg
image_alt: A cozy holiday candle set
---
```

- **`link`** (required): Full payment link URL — copy from Stripe dashboard
- **`title`**: Overrides auto-generated name
- **`description`**: Overrides auto-generated product list
- **`cover`**: Filename of an image in the same directory to use as the card image. Falls back to first image file alphabetically if not specified
- **`image_alt`**: Alt text for the bundle image; falls back to `title` if not specified

Each subdirectory in `/bundles/` is a bundle. The `.md` filename is arbitrary — the `link` URL is the identifier. If a directory contains multiple `.md` files, the first alphabetically is used and the build warns about the rest. If multiple bundles reference the same link, the first directory alphabetically wins and the build warns about duplicates.

All image files in the directory are copied to the build output at build time. Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.svg`.

## Environment Setup

Create a `.env` file in the project root:

```
STRIPE_SECRET_KEY=sk_test_your_key_here
```

Get your test secret key from [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys).

**The key must start with `sk_`** — either `sk_test_` (test mode) or `sk_live_` (live mode). If you accidentally paste your publishable key (`pk_*`), the build will tell you.

## Build and Verify

```sh
# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

A successful build logs a summary:

```
[Storefront] Build complete:
  Payment links found: 5
  Single-product cards: 3
  Bundle cards: 2 (1 configured, 1 default)
```

If any links couldn't be built into cards, warnings appear above the summary:

```
[Storefront] Warnings:
  - https://buy.stripe.com/xyz: failed to fetch line items
  - https://buy.stripe.com/abc: 3 products, no bundle config — using defaults

[Storefront] Build complete:
  ...
  Links skipped: 1
```

Warnings about unconfigured bundles are informational — the bundle still gets a card with auto-generated metadata. Links that are skipped (e.g., failed to fetch) don't get cards but the build still succeeds if at least one card was built.

## Deployment

### GitHub Pages

1. **Add the secret key as a repository secret:**
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add `STRIPE_SECRET_KEY` with your `sk_live_*` key

2. **Configure Astro for GitHub Pages** in `astro.config.mjs`:

   ```js
   export default defineConfig({
     site: 'https://yourusername.github.io',
     base: '/your-repo-name',
   });
   ```

3. **Set up a GitHub Actions workflow** (`.github/workflows/deploy.yml`) that:
   - Checks out the repo
   - Installs dependencies
   - Runs `npm run build` with `STRIPE_SECRET_KEY` from secrets
   - Deploys the `dist/` directory to GitHub Pages

4. **Update Payment Link redirect URLs** to point to your live domain:
   - Success URL → `https://yourdomain.com/success`
   - Cancel URL → `https://yourdomain.com/cancel`

## Troubleshooting

Each error message includes a reference to the relevant section below.

### Missing API Key

**Error:** `STRIPE_SECRET_KEY is not set`

The `STRIPE_SECRET_KEY` environment variable is missing or empty.

- Verify `.env` exists in the project root with `STRIPE_SECRET_KEY=sk_test_...`
- If deploying, ensure the secret is set in your CI/CD environment (e.g., GitHub Actions secrets)
- Restart the dev server after changing `.env`

### Invalid Key Format

**Error:** `STRIPE_SECRET_KEY must start with sk_`

You likely pasted a publishable key (`pk_test_*` or `pk_live_*`) instead of a secret key. Secret keys start with `sk_test_` (test mode) or `sk_live_` (live mode).

Find your secret key at [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys).

### Invalid API Key

**Error:** `Invalid API key`

The key starts with `sk_` but Stripe rejected it. Common causes:

- Key was revoked or rolled in the Stripe dashboard
- Key is from a different Stripe account
- Typo when copying the key

Generate a new key at [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys).

### Insufficient Permissions

**Error:** `API key lacks required permissions`

Your API key doesn't have permission to read payment links and products. If using restricted keys, ensure these permissions are enabled:

- Payment Links: Read
- Products: Read

### Connection Error

**Error:** `Cannot reach Stripe API`

The build couldn't connect to Stripe. Check your internet connection and try again. If behind a firewall or proxy, ensure `api.stripe.com` is reachable.

### Rate Limit

**Error:** `Too many requests — try again shortly`

You've hit Stripe's API rate limit. Wait a minute and try again. This is unusual for a storefront build — if it persists, check for other processes using the same API key.

### Invalid Request

**Error:** `Invalid API request — possible SDK version mismatch`

The Stripe SDK made a request the API didn't understand. This can happen if the SDK version is significantly ahead of or behind the API version. Try:

```sh
npm update stripe
```

### Stripe API Error

**Error:** `Stripe internal error — try again, contact Stripe support if persistent`

Stripe returned a server error. Try again. If it persists, check [Stripe Status](https://status.stripe.com/) and contact Stripe support.

### No Payment Links

**Error:** `No active payment links found in Stripe`

The Stripe account has no active payment links. Create at least one:

1. Go to [Stripe Dashboard > Payment Links](https://dashboard.stripe.com/test/payment-links)
2. Click **New** and select a product
3. Ensure the payment link is **active**
4. Verify you're using the correct API key (test key sees test links, live key sees live links)

### No Cards

**Error:** `No cards could be built from payment links`

Payment links exist but none could be turned into storefront cards. This means every link failed to fetch line items or had no valid products. Check the warnings above the error for specific details about each link.

Common causes:

- Products referenced by payment links were deleted or archived
- API permissions don't include product read access
- Temporary Stripe API issues — try building again

## Verification Checklist

Before going live:

- [ ] Products appear on the storefront with correct names, prices, and images
- [ ] "Buy" buttons link to the correct Stripe Payment Links
- [ ] Payment Links redirect to your success/cancel pages after checkout
- [ ] Bundle cards display correctly (with config or auto-generated)
- [ ] Live API key (`sk_live_*`) is set in production environment
- [ ] Live products and payment links are active in Stripe (not test mode)
- [ ] Build summary shows expected counts with no unexpected warnings

## How It Works

At build time, the storefront:

1. Fetches all active payment links from Stripe
2. For each link, fetches line items with expanded product data
3. Single-product links become cards that inherit product metadata
4. Multi-product links become bundle cards (auto-generated or configured via `/bundles/<name>/`)
5. Renders all cards as static HTML with "Buy" links

No client-side JavaScript. No database. No API server. Just static HTML + CSS served from anywhere.
