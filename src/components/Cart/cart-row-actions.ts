/**
 * Pure decision logic for cart-row mutations triggered by the unified
 * <CartControl /> component.
 *
 * Listings (cards/table) and the cart use the same CartControl + the same
 * `nextQuantity` math (see `src/components/CartControl/cart-control-actions.ts`).
 * The only cart-context concern is what to do with the resulting quantity:
 *
 * - qty <= 0  → remove the item from the store. The cart's
 *               `hydrateFromCart` re-runs on CART_EVENT and hides the row,
 *               so the DOM cleanup is automatic.
 * - qty > 0   → set the item to that quantity in the store.
 *
 * Keeping this as a pure function lets us cover the qty=0 / remove path with
 * 100% line + branch coverage without touching the DOM-orchestrator portions
 * of `cart.ts` (which live in the 0%-coverage bucket tracked by
 * `docs/todo/cart-listings-test-coverage.md`).
 */
export type CartMutation =
  | { op: 'remove' }
  | { op: 'set'; quantity: number };

export function resolveCartMutation(nextQty: number): CartMutation {
  if (nextQty <= 0) return { op: 'remove' };
  return { op: 'set', quantity: nextQty };
}
