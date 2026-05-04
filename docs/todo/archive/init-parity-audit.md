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

## Resolved

### ✅ Gap A: Scaffolded project's initial build errors

**Shipped in:** `3bbd12d` (scaffold templates) and `9e68b3c` (library's own `src/pages/*`).

**What was done:**
- Typed `import.meta.glob<{ default: any }>(...)` so dynamic module access type-checks.
- Added `if (loader)` guards before invoking dynamic MDX loaders. Closed a latent runtime hazard, not just a TS error.
- Resolved the `Cart` filename-collision in scaffolded `cart.astro` by aliasing the import: `import { Cart as CartPage }`. Library's own `src/pages/cart.astro` aligned with the same pattern in commit `2bea35e`.
- Unified the `getStaticPaths` prop shape in `category/[slug].astro` so TypeScript can narrow inside the JSX branch.
- Extracted the scaffold templates into builder functions in `bin/scaffold.mjs` (`buildIndexPage`, `buildSlugPage`, `buildCategorySlugPage`, updated `buildCartPage`), advancing the scaffold-emission-strategy follow-up (since closed; see `docs/todo/archive/scaffold-emission-strategy.md`).
- `npm run typecheck` clean in repo; fresh `cornerstore init` scaffold passes `astro check` with 0 errors.

Archived original investigation doc: `docs/todo/archive/astro-check-page-errors.md`.

## Verified 2026-04-24

Automated DoD steps 1–5 all pass for all three init modes (pdf, stripe+URL, stripe+blank):

- `npm run build:lib && npm run build:cli` — clean.
- `corner-store init` in a fresh temp dir — produces expected files for each mode.
- `npm install` in the scaffolded project (tarball install via `npm pack`) — clean.
- `npx astro check` — 0 errors / 0 warnings / 0 hints across all three modes.
- `npx astro build` — 11 pages built, clean.

Two non-blocking findings surfaced during verification, both since resolved:

- `docs/todo/archive/scaffold-astro-check-deps.md` — closed 2026-04-29. Scaffolded `package.json` now ships a `typecheck: 'astro check'` script; Astro auto-installs `@astrojs/check` + `typescript` on first run, so consumers who never typecheck don't pay the install cost.
- `docs/todo/archive/scaffold-npm-link-build.md` — closed 2026-04-29. `bin/init.mjs` now carries an explanatory comment on the npm-link block. `npm link` is fine for `astro check` and `astro dev` against in-progress library changes; for full downstream-build verification, use `npm pack` + `file:./corner-store-*.tgz`. Dev-workflow issue only; real consumers are unaffected.

## Still open

### Manual DoD steps

Not yet verified (require browser interaction):

- Step 6 (pdf mode): open dev server, add items to cart, click "Submit Order", confirm a PDF downloads.
- Step 7 (stripe mode): open dev server, add items to cart, click "Checkout", confirm the POST hits the configured `checkoutUrl` (mock with a local server).

### Gap B: Consumer documentation

**Explicit deferral:** Alex is the only user of this package and will write documentation before making it public. Not an active item while the package is pre-public. Re-open when the package is about to be distributed externally.

## Maintenance follow-ups (resolved)

Both follow-up todos closed on 2026-04-29:

- `docs/todo/archive/scaffold-maintenance.md` — reviewed and declined as won't-do. Remaining items were either low-value, hypothetical, intentional design, or already shipped. See header note in the archived file.
- `docs/todo/archive/scaffold-emission-strategy.md` — closed by migrating the three inline status-page templates (`404.astro`, `success.astro`, `cancel.astro`) into `bin/scaffold.mjs:buildStatusPage(kind, storeName)`. All four non-trivial scaffolded Astro pages now flow through `scaffold.mjs`. The proposed CLAUDE.md rule was declined; the pattern self-enforces now that four sibling builders exist.

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
- `docs/todo/archive/cart-checkout-unavailable-handling.md` (H5) — resolved; referenced for history only.
