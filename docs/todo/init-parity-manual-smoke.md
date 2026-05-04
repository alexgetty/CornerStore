# Init Parity — Manual Smoke Tests

## Status

Open. The only items from the dissolved `docs/todo/archive/init-parity-audit.md` that survived the close-out: two browser-interaction smoke tests that the automated DoD steps cannot cover.

All other gaps verified clean (Gap 1 checkout config + cart signal parity, Gap 2 missing optional config keys, Gap 3 category nav dropdown example, Gap A scaffolded build errors). Gap B (consumer documentation) is explicitly deferred at `docs/todo/archive/deferred/consumer-documentation.md` until the package is ready to go public.

## Problem

The init-parity DoD has seven steps. Steps 1 through 5 (build clean, init clean, install clean, `astro check` clean, `astro build` clean) all run without browser interaction and were verified automatable on 2026-04-24 across all three init modes (pdf, stripe+URL, stripe+blank).

Steps 6 and 7 require running a dev server, opening a browser, and exercising the cart end-to-end. Until those run cleanly, init-parity is technically still open.

## Smoke test 1 — PDF mode

1. Fresh `cornerstore init` in an empty temp directory. Choose `pdf` for checkout style.
2. Install deps (`npm install` against the local tarball via `npm pack` from the library repo).
3. Start the dev server (`npm run dev`).
4. Add at least two items to the cart from the listings page.
5. Navigate to `/cart`. Click "Submit Order".
6. Confirm a PDF downloads. Open it. Confirm:
   - Each cart row appears with correct qty and price.
   - The subtotal line is present.
   - No interactive controls (qty steppers, remove buttons, action buttons) are rendered in the PDF.
   - No unavailable-banner markup leaks through.

## Smoke test 2 — Stripe mode

1. Fresh `cornerstore init` in an empty temp directory. Choose `stripe` for checkout style. Provide a `checkoutUrl` pointing at a tiny local mock server (a 10-line Express handler that logs the request body and returns `{ url: 'https://example.com/dummy' }`).
2. Install deps (tarball install).
3. Start the dev server.
4. Add at least two items to the cart.
5. Navigate to `/cart`. Click "Checkout".
6. Confirm:
   - The mock server receives a POST at the configured URL.
   - The request body is JSON with shape `{ items: [{ sku, quantity }, ...] }`.
   - The browser is redirected to whatever URL the mock returned.

## Files you'll touch

None in the library repo. This is a manual verification pass against scaffolded output.

If the tests reveal scaffold bugs, file separate todos rather than amending this one.

## Don't touch

- Library source — these tests verify the library is already correct, not that it needs changing.
- Scaffold templates — same. Bug findings spawn new todos.

## When this closes

When both smoke tests pass cleanly on a reproducible procedure. Capture the procedure in `docs/principles.md` or a future testing doc once the package goes public.

## Source

Steps 6 and 7 from the dissolved `docs/todo/archive/init-parity-audit.md`. All other gaps in that audit verified clean (Gaps 1, 2, 3, A all resolved).
