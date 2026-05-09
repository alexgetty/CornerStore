# Checkout Handler Config Drift

## Status

Open. Surfaced during a red-team pass on the cart/checkout flow. Not a bug today (every value happens to match), but a structural weakness: the cart-display surface and the BYO checkout server hold their own independent copies of four pricing/rules fields, and nothing forces them to agree.

## Problem

The cart page in `src/pages/cart.astro:1-27` reads four fields from `cornerstore.config.js`:

- `wholesaleMargin`
- `minCartSize`
- `shippingFlat`
- `shippingFreeThreshold`

`createCheckoutHandler` in `src/lib/cart/handler.ts:7-13` accepts the *same* four fields as its own `CheckoutHandlerConfig` options. The consumer's BYO server is responsible for passing them in when constructing the handler.

If the two configs drift — operator updates `cornerstore.config.js` and forgets to redeploy the server, or vice versa — the buyer is shown one set of prices/rules in the cart and gets charged under a different one at Stripe:

- `wholesaleMargin` drift: cart displays wholesale prices, server charges retail (or vice versa). Silent over- or under-charging.
- `minCartSize` drift: cart says the minimum is met, server rejects with a different threshold.
- `shippingFlat` / `shippingFreeThreshold` drift: cart shows free shipping, Stripe charges flat (or shows flat, charges free).

The handler already reads the *catalog* from disk on every request (see `docs/todo/archive/2026-04-25-handler-stateless-catalog-plan.md`) so the CSV is a single source of truth for products. The four config fields above are the last bit of state that lives in two places.

## Fix direction

Have `createCheckoutHandler` call `loadConfig()` itself and pull the four pricing/rules fields from there, the same way it pulls the catalog. The server reads `cornerstore.config.js` from `process.cwd()` at request time; `cornerstore.config.js` becomes the single source of truth for both surfaces.

`CheckoutHandlerConfig` shrinks to just `stripeKey` (and any future server-only secrets). The four shared fields move out of the constructor and into the per-request config read.

Considerations:

- The BYO server must deploy `cornerstore.config.js` alongside its code. Document this.
- Reading config per request is cheap (small JS module, already cached by Node's import system) but verify it doesn't refetch unnecessarily. If `loadConfig()` becomes hot, memoize behind a file-mtime check.
- An explicit override path on `CheckoutHandlerConfig` is acceptable as an escape hatch (e.g. `overrides: { wholesaleMargin: 0.4 }`) but the default must be "read from config."

## Files you'll touch

- Edit: `src/lib/cart/handler.ts` (drop the four fields from `CheckoutHandlerConfig`, read from `loadConfig()` instead)
- Edit: `tests/unit/cart/checkout.test.ts` (rewrite tests to mock `loadConfig` instead of passing config via the factory)
- Update: any docs / JSDoc that show the BYO server wiring example
- Update: `src/pages/cart.astro` is unaffected — it already reads from `loadConfig`

## Don't touch

- The catalog read path. That's the model we're extending, not changing.
- The `stripeKey` parameter. Secrets stay in factory args / env vars, not in `cornerstore.config.js`.

## Tests

- `loadConfig` is mocked; the handler picks up `wholesaleMargin` / `minCartSize` / `shippingFlat` / `shippingFreeThreshold` from the mocked return value.
- Changing the mocked config between two handler invocations is reflected on the second call without a process restart (mirrors the existing "reflects a catalog mutation between requests without restart" test).
- The handler still works when those four fields are absent from the config (no margin, no minimum, no shipping line).

## Source

Red-team review, 2026-05-05. See conversation log; the headline finding was the idempotency-key collision (now tracked separately) and this was the highest follow-up.
