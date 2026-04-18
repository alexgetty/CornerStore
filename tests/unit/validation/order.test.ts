import { describe, it, expect } from 'vitest';
import { validateOrder } from '../../../src/lib/validation/order.js';
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
