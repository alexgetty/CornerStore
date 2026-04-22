# Init Parity Audit — Outstanding Gaps

## Status

Open. Critical for the primary distribution path (`cornerstore init`).

## Why this exists

`CLAUDE.md` mandates init parity: every feature that touches consumer-visible surface must update `bin/init.mjs` in the same commit. The rule has been broken repeatedly. This audit lists every currently-known gap between what the library supports and what init actually produces. Close all of them before shipping any new feature.

## Critical gaps

### 1. Checkout endpoint + Astro output mode — consumer projects cannot check out

**Symptom:** A fresh `cornerstore init` project with `STRIPE_SECRET_KEY` set renders the Checkout button as active, but clicking it POSTs to `/api/checkout` which returns 404. Checkout is completely broken.

**Root cause:**
- Commit `ea84cd6` (April 18) removed `src/pages/api/checkout.ts` from the library and exported `createCheckoutHandler` as a factory for consumers to mount.
- `bin/init.mjs` was never updated to scaffold the route file on the consumer side.
- Scaffolded `astro.config.mjs` uses `output: 'static'`, which cannot host API routes at all. Even if a route file existed, Astro would ignore it.
- Scaffolded `cart.astro` at line 400 computes `checkoutEnabled = !!import.meta.env.STRIPE_SECRET_KEY` — the UI lies to the user, claiming checkout is active whenever the env var is set.
- `checkoutUrl` config key exists in `StoreConfig` but init never writes it; default is `/api/checkout`.

**Fix (multi-step):**

1. Pick a default server adapter for scaffolded projects. Recommend Netlify — it has first-class Astro support, free tier, and works for most indie makers. If Netlify isn't acceptable, the alternatives are Vercel, Cloudflare, or a standalone Node server.

2. Update scaffolded `astro.config.mjs`:
   ```js
   import { defineConfig } from 'astro/config';
   import mdx from '@astrojs/mdx';
   import netlify from '@astrojs/netlify';

   export default defineConfig({
     output: 'hybrid',
     adapter: netlify(),
     integrations: [mdx()],
     // ...theme-watcher plugin as today
   });
   ```
   The site stays mostly static; only the checkout route runs server-side via `export const prerender = false`.

3. Scaffold `src/pages/api/checkout.ts`:
   ```ts
   export const prerender = false;
   import type { APIRoute } from 'astro';
   import { createCheckoutHandler } from 'corner-store/checkout';
   import { loadConfig } from 'corner-store';

   const config = await loadConfig();
   const handler = createCheckoutHandler({
     stripeKey: import.meta.env.STRIPE_SECRET_KEY,
     wholesaleMargin: config.wholesaleMargin,
     minCartSize: config.minCartSize,
     shippingFlat: config.shippingFlat,
     shippingFreeThreshold: config.shippingFreeThreshold,
   });

   export const POST: APIRoute = async ({ request, url }) => {
     const body = await request.json();
     return handler(body, url.origin);
   };
   ```

4. Add `@astrojs/netlify` to the scaffolded `package.json` dependencies.

5. Document deployment: add `docs/deployment.md` with per-platform snippets (Netlify default, Vercel / Cloudflare / Node as alternatives).

6. Consider: print a loud message at the end of `cornerstore init` saying "Checkout is configured for Netlify by default. See docs/deployment.md to switch hosts."

**Red team this:** Any indie maker trying this package right now runs init, sets STRIPE_SECRET_KEY, opens their site, adds items to cart, clicks checkout — and nothing happens. That's the current state.

### 2. Missing config keys in scaffolded cornerstore.config.js

These exist in `StoreConfig` and affect cart / checkout behavior, but init never writes them (and never prompts for them):

- `wholesaleMargin` — multiplies catalog price for wholesale pricing mode. Used by both cart and Stripe handler.
- `shippingFlat` — flat shipping rate.
- `shippingFreeThreshold` — cart subtotal above which shipping is free.
- `checkoutUrl` — where the cart POSTs for checkout. Default `/api/checkout` is brittle if host routing differs.
- `logo` — optional logo path for Nav.

**Fix:** Either prompt for each at init time (or a subset — at minimum wholesaleMargin and shipping) OR include commented-out defaults in the scaffolded `cornerstore.config.js` so users can discover them:
```js
export default {
  name: "...",
  home: 'home',
  nav: [...],
  contact: "...",
  listings: { views: ['card', 'table'] },
  minCartSize: 50,
  // Optional:
  // logo: '/logo.svg',
  // wholesaleMargin: 0.5,                 // 50% of retail for wholesale customers
  // shippingFlat: 9.99,
  // shippingFreeThreshold: 100,
  // checkoutUrl: '/api/checkout',
};
```

The commented approach is less invasive and self-documenting. Prompts are better UX for users who don't read the config file.

### 3. Category nav scaffolding

`StoreConfig.nav` supports `dropdown: 'categories' | string[]` to render a category menu. Init doesn't scaffold this and there's no example. Consumers must discover it by reading the library types.

**Fix:** Include a commented example in the scaffolded `cornerstore.config.js` showing the dropdown shape:
```js
// Example category dropdown:
// { label: 'Products', dropdown: 'categories' }
```

### 4. Missing documentation

`docs/SETUP.md` was deleted rather than updated — it was too far out of sync to retrofit, and the project is still WIP. A full consumer-facing docs rewrite is deferred until the cart/checkout/catalog machinery stabilizes. For now, there is NO consumer onboarding doc. When init runs, the user has no guide to read.

**Init parity implication:** when the new docs are written, any command, config key, or file init produces must be documented. Init-parity-audit will need to be revisited then to ensure whatever docs ship match what init scaffolds.

## Definition of done (whole audit, not per item)

Close the audit by running this test end-to-end:

1. `npm run build:lib && npm run build:cli && npm link` in this repo.
2. In a fresh temp directory: `cornerstore init`, follow prompts.
3. Set `STRIPE_SECRET_KEY` in the scaffolded `.env`.
4. `npm run dev` in the scaffolded project.
5. Open the site, browse products, add to cart, click Checkout.
6. Verify a Stripe Checkout session URL comes back and redirects correctly.
7. Verify `/product-names.json` returns the SKU→name map.
8. Verify hidden and status-disabled items flow correctly through the cart banner.

If any step fails, init is still out of parity.

## Preventing recurrence

CLAUDE.md has been updated with a mandatory Init Parity section and a violation history. Future agents reading CLAUDE.md cannot miss the rule. The "Definition of done test" at the top of this audit is also in CLAUDE.md — it must be run before any feature claims completion.

Consider adding a CI step that:
- Runs `cornerstore init` into a temp directory inside a sandbox.
- Runs `npm install && npm run build` in that directory.
- Fails if the scaffolded project can't build.

That would make init drift impossible to merge.

## Files you'll touch (likely)

- Edit: `bin/init.mjs` (scaffold api/checkout.ts, update astro.config scaffold with adapter, expand config scaffold with commented keys)
- Edit: `package.json` (add `@astrojs/netlify` to consumer dep list in the scaffolded package.json)
- New: `docs/deployment.md` (per-platform notes)

## Don't touch

- Any of the library source code. This is purely scaffolding drift.
- Existing scaffolded files beyond what's listed above — no cosmetic refactors.
- The Storefront repo's own `astro.config.mjs` — the library itself doesn't need to be hybrid.

## Related todos (do NOT merge)

- `cart-checkout-unavailable-handling.md` (H5) — overlaps on checkout behavior but is about unavailable items, not init scaffolding. Land either first; the other stays independent.
- `cart-listings-test-coverage.md` (C3) — the test infrastructure. Separate from init.
