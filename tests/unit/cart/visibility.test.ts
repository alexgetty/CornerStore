import { describe, it, expect } from 'vitest';
import { computeCartVisibility } from '../../../src/lib/cart/visibility.js';
import type { CartItem } from '../../../src/lib/cart/types.js';

describe('computeCartVisibility', () => {
  it('returns empty result for empty cart', () => {
    const result = computeCartVisibility({
      items: [],
      priceMap: { A: 100 },
      disabledSkus: new Set(),
    });
    expect(result).toEqual({
      visibleItems: [],
      unavailableItems: [],
      itemCount: 0,
      subtotal: 0,
    });
  });

  it('aggregates count and subtotal when all items are available', () => {
    const items: CartItem[] = [
      { sku: 'A', quantity: 3 },
      { sku: 'B', quantity: 2 },
    ];
    const result = computeCartVisibility({
      items,
      priceMap: { A: 1000, B: 500 },
      disabledSkus: new Set(),
    });
    expect(result.visibleItems).toEqual(items);
    expect(result.unavailableItems).toEqual([]);
    expect(result.itemCount).toBe(5);
    expect(result.subtotal).toBe(4000); // 3*1000 + 2*500
  });

  it('excludes hidden SKUs (absent from priceMap) from count and subtotal', () => {
    const items: CartItem[] = [
      { sku: 'A', quantity: 3 },
      { sku: 'HIDDEN', quantity: 2 },
    ];
    const result = computeCartVisibility({
      items,
      priceMap: { A: 1000 },
      disabledSkus: new Set(),
    });
    expect(result.visibleItems).toEqual([{ sku: 'A', quantity: 3 }]);
    expect(result.unavailableItems).toEqual([{ sku: 'HIDDEN', quantity: 2 }]);
    expect(result.itemCount).toBe(3);
    expect(result.subtotal).toBe(3000);
  });

  it('excludes status-disabled SKUs (in priceMap, in disabledSkus) from count and subtotal', () => {
    const items: CartItem[] = [
      { sku: 'A', quantity: 3 },
      { sku: 'DISABLED', quantity: 2 },
    ];
    const result = computeCartVisibility({
      items,
      priceMap: { A: 1000, DISABLED: 2000 },
      disabledSkus: new Set(['DISABLED']),
    });
    expect(result.visibleItems).toEqual([{ sku: 'A', quantity: 3 }]);
    expect(result.unavailableItems).toEqual([{ sku: 'DISABLED', quantity: 2 }]);
    expect(result.itemCount).toBe(3);
    expect(result.subtotal).toBe(3000);
  });

  it('handles both hidden and status-disabled items in the same cart', () => {
    const items: CartItem[] = [
      { sku: 'A', quantity: 1 },
      { sku: 'HIDDEN', quantity: 5 },
      { sku: 'DISABLED', quantity: 7 },
      { sku: 'B', quantity: 4 },
    ];
    const result = computeCartVisibility({
      items,
      priceMap: { A: 100, B: 200, DISABLED: 999 },
      disabledSkus: new Set(['DISABLED']),
    });
    expect(result.visibleItems).toEqual([
      { sku: 'A', quantity: 1 },
      { sku: 'B', quantity: 4 },
    ]);
    expect(result.unavailableItems).toEqual([
      { sku: 'HIDDEN', quantity: 5 },
      { sku: 'DISABLED', quantity: 7 },
    ]);
    expect(result.itemCount).toBe(5);
    expect(result.subtotal).toBe(900); // 1*100 + 4*200
  });

  it('treats explicit zero price as visible (contributes to count, 0 to subtotal)', () => {
    const items: CartItem[] = [{ sku: 'FREE', quantity: 3 }];
    const result = computeCartVisibility({
      items,
      priceMap: { FREE: 0 },
      disabledSkus: new Set(),
    });
    expect(result.visibleItems).toEqual([{ sku: 'FREE', quantity: 3 }]);
    expect(result.unavailableItems).toEqual([]);
    expect(result.itemCount).toBe(3);
    expect(result.subtotal).toBe(0);
  });

  it('preserves item order from input in visibleItems and unavailableItems', () => {
    const items: CartItem[] = [
      { sku: 'X', quantity: 1 }, // hidden
      { sku: 'A', quantity: 2 }, // visible
      { sku: 'Y', quantity: 3 }, // disabled
      { sku: 'B', quantity: 4 }, // visible
      { sku: 'Z', quantity: 5 }, // hidden
    ];
    const result = computeCartVisibility({
      items,
      priceMap: { A: 10, B: 20, Y: 30 },
      disabledSkus: new Set(['Y']),
    });
    expect(result.visibleItems.map((i) => i.sku)).toEqual(['A', 'B']);
    expect(result.unavailableItems.map((i) => i.sku)).toEqual(['X', 'Y', 'Z']);
  });

  it('treats disabledSkus-only (not in priceMap) as unavailable', () => {
    // Defensive: disabledSkus lists a SKU that isn't in priceMap (e.g. hidden
    // AND status-disabled, or a stale disabledSkus entry). Still unavailable.
    const items: CartItem[] = [{ sku: 'GHOST', quantity: 2 }];
    const result = computeCartVisibility({
      items,
      priceMap: {},
      disabledSkus: new Set(['GHOST']),
    });
    expect(result.visibleItems).toEqual([]);
    expect(result.unavailableItems).toEqual([{ sku: 'GHOST', quantity: 2 }]);
    expect(result.itemCount).toBe(0);
    expect(result.subtotal).toBe(0);
  });

  it('does not mutate the input items array', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 2 }];
    const frozen = Object.freeze([...items]);
    expect(() =>
      computeCartVisibility({
        items: frozen,
        priceMap: { A: 100 },
        disabledSkus: new Set(),
      }),
    ).not.toThrow();
  });
});
