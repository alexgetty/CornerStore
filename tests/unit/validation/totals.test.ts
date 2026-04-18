import { describe, it, expect } from 'vitest';
import {
  calculateLineTotal,
  calculateSubtotal,
} from '../../../src/lib/validation/totals.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';

function makeItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1999,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

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
