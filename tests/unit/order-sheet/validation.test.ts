import { describe, it, expect } from 'vitest';
import {
  validateQuantity,
  calculateLineTotal,
  calculateSubtotal,
  validateOrder,
  snapToMoq,
} from '../../../src/lib/order-sheet/validation.js';
import type { OrderSheetItem } from '../../../src/lib/order-sheet/types.js';

function makeItem(overrides: Partial<OrderSheetItem> = {}): OrderSheetItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1999,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('validateQuantity', () => {
  it('returns true for zero quantity regardless of MOQ', () => {
    expect(validateQuantity(0, 6)).toBe(true);
    expect(validateQuantity(0, null)).toBe(true);
  });

  it('returns true when quantity meets MOQ', () => {
    expect(validateQuantity(6, 6)).toBe(true);
    expect(validateQuantity(12, 6)).toBe(true);
  });

  it('returns false when quantity is below MOQ', () => {
    expect(validateQuantity(3, 6)).toBe(false);
    expect(validateQuantity(1, 6)).toBe(false);
  });

  it('returns true for any positive quantity when MOQ is null', () => {
    expect(validateQuantity(1, null)).toBe(true);
    expect(validateQuantity(100, null)).toBe(true);
  });
});

describe('snapToMoq', () => {
  it('returns 0 when current is 0 and direction is down', () => {
    expect(snapToMoq(0, 6, 'down')).toBe(0);
  });

  it('returns MOQ when current is 0 and direction is up', () => {
    expect(snapToMoq(0, 6, 'up')).toBe(6);
  });

  it('increments by MOQ from current value', () => {
    expect(snapToMoq(6, 6, 'up')).toBe(12);
    expect(snapToMoq(12, 6, 'up')).toBe(18);
  });

  it('decrements by MOQ from current value', () => {
    expect(snapToMoq(12, 6, 'down')).toBe(6);
  });

  it('snaps down to zero when decrement would go below MOQ', () => {
    expect(snapToMoq(6, 6, 'down')).toBe(0);
  });

  it('increments by 1 when MOQ is null and direction is up', () => {
    expect(snapToMoq(0, null, 'up')).toBe(1);
    expect(snapToMoq(5, null, 'up')).toBe(6);
  });

  it('decrements by 1 when MOQ is null and direction is down', () => {
    expect(snapToMoq(5, null, 'down')).toBe(4);
  });

  it('does not go below zero', () => {
    expect(snapToMoq(0, null, 'down')).toBe(0);
  });
});

describe('calculateLineTotal', () => {
  it('returns 0 for zero quantity', () => {
    expect(calculateLineTotal(1999, 0)).toBe(0);
  });

  it('multiplies raw price by quantity', () => {
    expect(calculateLineTotal(1999, 3)).toBe(5997);
  });

  it('handles single unit', () => {
    expect(calculateLineTotal(500, 1)).toBe(500);
  });
});

describe('calculateSubtotal', () => {
  it('returns 0 for empty items', () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it('returns 0 when all quantities are zero', () => {
    const items = [makeItem({ quantity: 0 }), makeItem({ quantity: 0 })];
    expect(calculateSubtotal(items)).toBe(0);
  });

  it('sums line totals', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 500, quantity: 3 }),
    ];
    expect(calculateSubtotal(items)).toBe(3500);
  });

  it('ignores zero-quantity items', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 9999, quantity: 0 }),
    ];
    expect(calculateSubtotal(items)).toBe(2000);
  });
});

describe('validateOrder', () => {
  it('returns valid for a complete valid order', () => {
    const items = [makeItem({ quantity: 6, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns moq error when quantity below MOQ', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'moq', sku: 'TEST-001' }),
    );
  });

  it('allows zero quantity even with MOQ', () => {
    const items = [makeItem({ quantity: 0, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'moq')).toBeUndefined();
  });

  it('returns empty-cart error when no items have quantity', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'empty-cart' }),
    );
  });

  it('returns min-cart error when subtotal is below minimum', () => {
    const items = [makeItem({ rawPrice: 1000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'min-cart' }),
    );
  });

  it('passes min-cart check when subtotal meets minimum', () => {
    const items = [makeItem({ rawPrice: 5000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when minCartSizeRaw is null', () => {
    const items = [makeItem({ rawPrice: 100, quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when cart is empty', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('returns missing-name error when name is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-name error when name is whitespace', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '   ', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-email error when email is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', '');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-email' }),
    );
  });

  it('collects multiple errors', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, 99999, '', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
