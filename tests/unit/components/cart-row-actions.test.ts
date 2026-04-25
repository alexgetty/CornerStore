import { describe, it, expect } from 'vitest';
import { resolveCartMutation } from '../../../src/components/Cart/cart-row-actions.js';

describe('resolveCartMutation', () => {
  it('returns a remove operation when next quantity is 0', () => {
    expect(resolveCartMutation(0)).toEqual({ op: 'remove' });
  });

  it('returns a remove operation when next quantity is negative (defensive clamp)', () => {
    // Upstream nextQuantity() clamps to >= 0, but the cart-side helper
    // must still defend against negative input (e.g. malformed dataset
    // values). qty <= 0 is a removal, period.
    expect(resolveCartMutation(-1)).toEqual({ op: 'remove' });
  });

  it('returns a set operation with the quantity for positive values', () => {
    expect(resolveCartMutation(1)).toEqual({ op: 'set', quantity: 1 });
    expect(resolveCartMutation(6)).toEqual({ op: 'set', quantity: 6 });
    expect(resolveCartMutation(120)).toEqual({ op: 'set', quantity: 120 });
  });

  it('does not coerce non-integer positive values (responsibility of upstream nextQuantity)', () => {
    // The cart-row-actions helper is downstream of nextQuantity, which floors
    // input. If anything non-integer reaches us, surface it verbatim so the
    // bug is loud at the boundary instead of being silently rounded here.
    expect(resolveCartMutation(2.5)).toEqual({ op: 'set', quantity: 2.5 });
  });
});
