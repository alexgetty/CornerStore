# Order-of-Record Signal

## Status

Open. Surfaced during a red-team pass on the cart/checkout flow. Operational gap, not a correctness bug. Mostly an issue once order volume grows past "I check Stripe daily."

## Problem

`createCheckoutHandler` in `src/lib/cart/handler.ts` creates a Stripe Checkout Session and returns the session URL. There is no path for the storefront to learn whether the buyer actually completed payment:

- No webhook handler for `checkout.session.completed`.
- `src/pages/success.astro` is a static "thank you" page — it doesn't verify the session, doesn't query Stripe, doesn't notify the seller.
- A buyer who pays and then closes the tab before the redirect leaves no trace on the storefront side.

For the seller, this means:

- New orders are only visible by manually checking the Stripe dashboard (or via Stripe's own email notifications, which are on by default but easy to filter into oblivion).
- No automated record of which Stripe session corresponds to which buyer/cart on our side. If a customer emails asking "did my order go through?", the seller has to cross-reference Stripe by hand.
- No place to hook future enhancements: order-confirmation email from the seller, fulfillment workflows, internal analytics, low-stock alerts.

This is a deliberate part of the "infrastructure, not middleman" stance (see `CLAUDE.md`). We do not want to become an order-of-record. But there's a difference between "we don't store orders" and "the seller has no automated signal that an order happened." The latter is operational debt that gets worse as volume grows.

## Fix direction

Add an opt-in webhook handler factory alongside `createCheckoutHandler`, e.g. `createWebhookHandler({ stripeKey, webhookSecret, onCompleted })`. Verifies the Stripe signature, parses the event, calls a user-supplied callback for relevant event types. The callback is where the seller wires whatever they want: send themselves an email, append to a Google Sheet, post to Slack, etc.

Hard lines (preserve the infrastructure-not-middleman posture):

- We do not store orders ourselves. The factory is a signature-verifier and event-router, not a database.
- The callback is opt-in. A seller who's fine with Stripe's own emails just doesn't mount the handler.
- We do not generate receipts. Stripe already does that.
- No buyer account state. The handler operates on a single event at a time.

Pair with init-parity work: scaffold a commented-out webhook example in the BYO server template alongside the checkout handler example.

## Files you'll touch

- New: `src/lib/cart/webhook.ts` (factory, verification, event dispatch)
- Edit: `src/lib/cart/index.ts` (export the new factory and types)
- Edit: `package.json` exports map (add a `./webhook` subpath if we want to keep it parallel to `./checkout`)
- New: `tests/unit/cart/webhook.test.ts`
- Update: BYO-server documentation and any scaffold examples

## Don't touch

- `createCheckoutHandler`. Webhooks are an independent surface; do not couple them.
- `success.astro` / `cancel.astro`. They stay static; verification lives server-side.
- Catalog or cart state. The webhook reads Stripe events, period.

## Tests

- Stripe signature verification: valid signature passes, invalid/expired fails with 400.
- Event dispatch: `checkout.session.completed` invokes the user callback with the parsed event; unrelated event types are ignored cleanly.
- Idempotency at the webhook level: Stripe can resend events. The factory exposes the event ID; document that downstream handlers should de-dup on it. Don't bake a store into the factory.
- Error handling: a thrown user callback returns 500 to Stripe so it retries.

## Source

Red-team review, 2026-05-05. Flagged alongside the idempotency-key bug and the config-drift item; this is the lower-urgency of the three but worth tracking before order volume forces the issue.
