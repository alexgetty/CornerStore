# Cart localStorage Privacy Disclosure

## Status

Deferred.

## Note

The storefront writes a `cs-view-preference` key and the cart's wholesale-mode item state to `localStorage` (see `src/components/Listings/listings.ts:128-132` and `src/lib/cart/store.ts`). No privacy disclosure exists today. Acceptable while the data is purely functional preference plus cart contents (no PII), and while the package is pre-public with Alex as the only user.

Re-open when consumer-facing onboarding docs are written and EU targeting matters. The fix is documentation, not code: explain in the consumer-facing README that the storefront uses `localStorage` for view preference and cart state, no third-party transmission, no PII. Note also the potential key-collision risk if a consumer script uses the same key namespace.

## Source

Item M8 from the dissolved `docs/todo/archive/2026-04-22-catalog-visibility-red-team-backlog.md`.
