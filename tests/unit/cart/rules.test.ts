import { describe, it, expect } from 'vitest';
import { wholesaleRules, dtcRules } from '../../../src/lib/cart/rules.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';
import type { CartItem } from '../../../src/lib/cart/types.js';

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

describe('wholesaleRules', () => {
  describe('validateItem', () => {
    it('returns valid for zero quantity', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 0 };
      const product = makeProduct({ moq: 6 });
      const result = wholesaleRules.validateItem(item, product);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns valid when quantity meets MOQ', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 6 };
      const product = makeProduct({ moq: 6 });
      const result = wholesaleRules.validateItem(item, product);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns moq error when quantity below MOQ', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 3 };
      const product = makeProduct({ moq: 6 });
      const result = wholesaleRules.validateItem(item, product);
      expect(result).toEqual({
        valid: false,
        errors: [
          {
            type: 'moq',
            sku: 'TEST-001',
            message: 'Minimum order quantity is 6',
          },
        ],
      });
    });

    it('returns valid for any positive quantity when no MOQ', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 1 };
      const product = makeProduct({ moq: null });
      const result = wholesaleRules.validateItem(item, product);
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('validateCart', () => {
    it('returns valid for non-empty cart with no MOQ violations', () => {
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 6 }];
      const products = [makeProduct({ moq: 6 })];
      const result = wholesaleRules.validateCart(items, products);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns empty-cart error when no items', () => {
      const result = wholesaleRules.validateCart([], []);
      expect(result).toEqual({
        valid: false,
        errors: [{ type: 'empty-cart', message: 'Add at least one item' }],
      });
    });

    it('returns empty-cart error when all items have zero quantity', () => {
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 0 }];
      const products = [makeProduct()];
      const result = wholesaleRules.validateCart(items, products);
      expect(result).toEqual({
        valid: false,
        errors: [{ type: 'empty-cart', message: 'Add at least one item' }],
      });
    });

    it('returns moq error for items violating MOQ', () => {
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 3 }];
      const products = [makeProduct({ moq: 6 })];
      const result = wholesaleRules.validateCart(items, products);
      expect(result).toEqual({
        valid: false,
        errors: [
          {
            type: 'moq',
            sku: 'TEST-001',
            message: 'Minimum order quantity is 6',
          },
        ],
      });
    });

    it('skips items not found in products', () => {
      const items: CartItem[] = [
        { sku: 'MISSING', quantity: 3 },
        { sku: 'TEST-001', quantity: 6 },
      ];
      const products = [makeProduct({ moq: 6 })];
      const result = wholesaleRules.validateCart(items, products);
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('withMinCartSize', () => {
    it('returns min-cart error when subtotal below minimum', () => {
      const rules = wholesaleRules.withMinCartSize(5000);
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 2 }];
      const products = [makeProduct({ rawPrice: 1000, moq: null })];
      const result = rules.validateCart(items, products);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'min-cart',
        message: 'Minimum order total not met',
      });
    });

    it('returns valid when subtotal meets minimum', () => {
      const rules = wholesaleRules.withMinCartSize(5000);
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 5 }];
      const products = [makeProduct({ rawPrice: 1000, moq: null })];
      const result = rules.validateCart(items, products);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('does not check min-cart when cart is empty', () => {
      const rules = wholesaleRules.withMinCartSize(5000);
      const result = rules.validateCart([], []);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('empty-cart');
    });
  });
});

describe('dtcRules', () => {
  describe('validateItem', () => {
    it('returns valid for any positive quantity regardless of MOQ', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 1 };
      const product = makeProduct({ moq: 6 });
      const result = dtcRules.validateItem(item, product);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns valid for zero quantity', () => {
      const item: CartItem = { sku: 'TEST-001', quantity: 0 };
      const product = makeProduct({ moq: 6 });
      const result = dtcRules.validateItem(item, product);
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('validateCart', () => {
    it('returns valid for non-empty cart', () => {
      const items: CartItem[] = [{ sku: 'TEST-001', quantity: 1 }];
      const products = [makeProduct()];
      const result = dtcRules.validateCart(items, products);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('returns empty-cart error for empty cart', () => {
      const result = dtcRules.validateCart([], []);
      expect(result).toEqual({
        valid: false,
        errors: [{ type: 'empty-cart', message: 'Add at least one item' }],
      });
    });
  });
});
