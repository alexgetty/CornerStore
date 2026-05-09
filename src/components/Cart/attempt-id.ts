/**
 * Generate a per-attempt nonce for the cart's checkout request. Sent to the
 * BYO server, which derives the Stripe idempotency key from it; without a
 * unique value here, two different buyers with identical carts can collide
 * on the same Stripe session.
 *
 * Three-tier fallback so the cart never strands a buyer:
 *   1. crypto.randomUUID — modern secure-context browsers
 *   2. crypto.getRandomValues — wider support, covers some non-secure contexts
 *      and older browsers that lack randomUUID
 *   3. Math.random + Date.now — last resort. Lower entropy, still unique
 *      enough for our use (single-store, low concurrency); the goal here is
 *      "checkout proceeds" rather than cryptographic strength
 *
 * `crypto` is injected so the function is unit-testable without monkey-patching
 * the global. Callers in cart.ts pass `globalThis.crypto`.
 */
export function generateAttemptId(crypto: Crypto | undefined): string {
  if (crypto?.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to getRandomValues.
    }
  }

  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
