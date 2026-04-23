# Init Parity Audit — Outstanding Gaps

## Status

Open. The original audit (pre-2026-04-23) was written under a wrong architectural assumption and has been rewritten. Most of the critical gaps it described are now resolved; new gaps discovered during verification are recorded below.

## Why this exists

`CLAUDE.md` mandates init parity: every feature that touches consumer-visible surface must update `bin/init.mjs` in the same commit. This audit tracks every currently-known gap between what the library supports and what `cornerstore init` actually produces.

## Architecture (current, correct)

Corner Store is a **bring-your-own-server** model:

- The consumer's storefront is a pure static Astro site. No adapter, no server endpoints scaffolded, `output: 'static'`.
- The consumer runs a **separate server** (their own host, their own deployment) that imports `createCheckoutHandler` from `corner-store/checkout` and exposes a POST endpoint.
- The storefront's cart POSTs to that endpoint via a `checkoutUrl` the maker configures in `cornerstore.config.js`.
- Store operators who don't want server-side checkout run in PDF mode: the cart generates a downloadable order form locally and the consumer never needs to stand up a server.

The previous version of this audit proposed adding an Astro adapter (Netlify/Vercel/etc.) and scaffolding `src/pages/api/checkout.ts` into consumer projects. That was wrong — it conflated the factory's consumers (your server, not the storefront) with the storefront itself. The BYO-server model is what the `createCheckoutHandler` export has always been designed for.

## Resolved gaps

### ✅ Gap 1: Checkout mode config and cart signal parity

**Shipped in:** `2b904b3`, `b057bd0`, `8bd280c` (library), `9b6f330` (init).

**What was done:**
- Added `checkout: 'pdf' | 'stripe'` config key to `StoreConfig` (default `'pdf'`).
- Cart's effective signal is now `checkoutEnabled = config.checkout === 'stripe' && !!config.checkoutUrl` — replacing the old `!!import.meta.env.STRIPE_SECRET_KEY` sniff that lived in both the library cart page and the scaffolded cart page.
- `loadConfig` emits a one-shot build warning when `checkout === 'stripe'` and `checkoutUrl` is blank; runtime gracefully falls back to PDF (since the signal evaluates false). This lets makers scaffold first and stand up the server later.
- `parseConfig` throws on invalid `checkout` values (no silent fallback). `loadConfig`'s try/catch was narrowed so validation errors propagate while missing-file fallback is preserved.
- `bin/init.mjs` prompts for checkout style, conditionally prompts for `checkoutUrl`, and writes matching config.
- `bin/init.mjs` no longer prompts for or scaffolds `STRIPE_SECRET_KEY` — that secret lives on the consumer's separate server, not in the storefront.
- Scaffold logic extracted into `bin/scaffold.mjs` for testability; `tests/unit/bin/init.test.ts` covers all four init modes (pdf, stripe+URL, stripe+blank, re-init round-trip).

### ✅ Gap 2: Missing optional config keys

**Shipped in:** `9b6f330`.

The scaffolded `cornerstore.config.js` now includes a commented "Optional" block with `logo`, `wholesaleMargin`, `shippingFlat`, `shippingFreeThreshold`. Consumers discover them by reading the generated file rather than having to hunt through library types.

### ✅ Gap 3: Category nav dropdown example

**Shipped in:** `9b6f330`.

The scaffolded config now includes a commented example of the `dropdown: 'categories'` nav item shape.

## Still open

### Gap A: Scaffolded project's initial build has pre-existing errors

**Discovered:** during `9b6f330` verification (definition-of-done test per CLAUDE.md).

**Symptoms:** After `cornerstore init` in a fresh temp directory, `npx astro check` reports:
- TypeScript strictness errors in scaffolded `src/pages/[slug].astro` and `src/pages/category/[slug].astro` (missing null-guards on values the templates treat as defined).
- A name collision involving `Cart` in scaffolded `src/pages/cart.astro`.
- Roughly 8 errors total.

**Verified pre-existing:** the same errors reproduce against the pre-Task-2 scaffold output (`8bd280c:bin/init.mjs`). Task 2 did not introduce them.

**Why this matters:** CLAUDE.md's "definition of done" test requires a scaffolded project to actually build. Right now it doesn't. The checkout-mode feature is correctly wired, but a maker running `cornerstore init` today still can't `astro build` successfully without hand-editing the scaffolded pages.

**Fix:** investigate each error individually. Likely candidates:
- The `Cart` collision may be a symbol shadow between `import { Cart } from 'corner-store/components'` and something else the file imports or declares. Read the scaffolded output at HEAD.
- The `[slug].astro` and `category/[slug].astro` null-guard errors suggest the templates assume `getEntry` or similar returns non-null. Either tighten the scaffolded code or loosen `tsconfig` strictness for scaffolded projects (the latter is backward, prefer the former).

### Gap B: Consumer documentation

**Explicit deferral:** Alex is the only user of this package and will write documentation before making it public. Not an active item while the package is pre-public. Re-open when the package is about to be distributed externally.

## Maintenance follow-ups (non-blocking)

Tracked in dedicated todo files:

- `docs/todo/scaffold-maintenance.md` — small cleanups (quoting style, duplicated defaults, brittle test assertions, dead vars, validation asymmetry).
- `docs/todo/scaffold-emission-strategy.md` — pick a single convention for how scaffolded files are emitted (inline strings vs. builder functions vs. static stubs).

## Preventing recurrence

The `CLAUDE.md` "Init Parity" section and the definition-of-done test remain the source of truth. Consider adding a CI job that runs `cornerstore init` in a temp directory and asserts the scaffolded project passes `astro check`. That would catch gap-A-class regressions automatically.

## Definition of done (whole audit)

Close the audit when:

1. `npm run build:lib && npm run build:cli && npm link` (in this repo) — clean.
2. `cornerstore init` in a fresh temp directory with each mode (pdf, stripe+URL, stripe+blank) — produces the expected files.
3. `npm install` in the scaffolded project — clean.
4. `npx astro check` in the scaffolded project — clean (this is currently Gap A).
5. `npx astro build` in the scaffolded project — clean.
6. For pdf mode: open the dev server, add items to cart, click "Submit Order", confirm a PDF downloads.
7. For stripe mode with URL set: open the dev server, add items to cart, click "Checkout", confirm the POST hits the configured `checkoutUrl` (mock it with a local server for the test).

Gaps A above is the last item blocking this.

## Related todos (do NOT merge into this audit)

- `cart-listings-test-coverage.md` (C3) — test infrastructure. Separate from init.
- `docs/archive/done/cart-checkout-unavailable-handling.md` (H5) — resolved; referenced for history only.
