import { describe, it, expect } from 'vitest';
import { getSummary } from '../../../src/lib/cart/summary.js';
import type { CartItem } from '../../../src/lib/cart/types.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';
import { wholesaleRules } from '../../../src/lib/cart/rules.js';

function makeProduct(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1000,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('getSummary', () => {
  describe('subtotal', () => {
    it('returns zero for empty cart', () => {
      const result = getSummary([], [], wholesaleRules, {});
      expect(result.subtotal).toBe(0);
    });

    it('calculates subtotal from items and products', () => {
      const items: CartItem[] = [
        { sku: 'A', quantity: 3 },
        { sku: 'B', quantity: 2 },
      ];
      const products: ValidationItem[] = [
        makeProduct({ sku: 'A', rawPrice: 1000 }),
        makeProduct({ sku: 'B', rawPrice: 500 }),
      ];
      const result = getSummary(items, products, wholesaleRules, {});
      expect(result.subtotal).toBe(4000);
    });

    it('ignores items not in products', () => {
      const items: CartItem[] = [
        { sku: 'A', quantity: 2 },
        { sku: 'MISSING', quantity: 5 },
      ];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000 })];
      const result = getSummary(items, products, wholesaleRules, {});
      expect(result.subtotal).toBe(2000);
    });
  });

  describe('shipping', () => {
    it('returns null when no shipping config', () => {
      const result = getSummary([], [], wholesaleRules, {});
      expect(result.shipping).toBeNull();
    });

    it('returns free shipping when subtotal meets threshold', () => {
      const items: CartItem[] = [{ sku: 'A', quantity: 10 }];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000 })];
      const result = getSummary(items, products, wholesaleRules, {
        shippingFlat: 5.99,
        shippingFreeThreshold: 100,
      });
      expect(result.shipping).toEqual({ type: 'free' });
    });

    it('returns remaining when below threshold', () => {
      const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000 })];
      const result = getSummary(items, products, wholesaleRules, {
        shippingFlat: 5.99,
        shippingFreeThreshold: 100,
      });
      expect(result.shipping).toEqual({ type: 'remaining', amount: 5.99, threshold: 10000 });
    });

    it('returns flat when no free threshold', () => {
      const result = getSummary([], [], wholesaleRules, { shippingFlat: 5.99 });
      expect(result.shipping).toEqual({ type: 'flat', amount: 5.99 });
    });
  });

  describe('distanceToMinimum', () => {
    it('returns null when no minCartSize', () => {
      const result = getSummary([], [], wholesaleRules, {});
      expect(result.distanceToMinimum).toBeNull();
    });

    it('returns distance when below minimum', () => {
      const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000 })];
      const result = getSummary(items, products, wholesaleRules, { minCartSize: 50 });
      expect(result.distanceToMinimum).toBe(4000);
    });

    it('returns null when minimum is met', () => {
      const items: CartItem[] = [{ sku: 'A', quantity: 5 }];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000 })];
      const result = getSummary(items, products, wholesaleRules, { minCartSize: 50 });
      expect(result.distanceToMinimum).toBeNull();
    });
  });

  describe('validation', () => {
    it('includes validation result from rules', () => {
      const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
      const products: ValidationItem[] = [makeProduct({ sku: 'A', rawPrice: 1000, moq: 5 })];
      const result = getSummary(items, products, wholesaleRules, {});
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors).toContainEqual(
        expect.objectContaining({ type: 'moq', sku: 'A' }),
      );
    });
  });
});
