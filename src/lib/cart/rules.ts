import type { CartItem, CartRules } from './types.js';
import type {
  ValidationItem,
  ValidationError,
  ValidationResult,
} from '../validation/types.js';
import { validateQuantity } from '../validation/quantity.js';
import { calculateLineTotal } from '../validation/totals.js';

function resolveItem(
  cartItem: CartItem,
  products: ValidationItem[],
): ValidationItem | null {
  return products.find((p) => p.sku === cartItem.sku) ?? null;
}

function validateItemMoq(
  item: CartItem,
  product: ValidationItem,
): ValidationError[] {
  if (!validateQuantity(item.quantity, product.moq)) {
    return [
      {
        type: 'moq',
        sku: item.sku,
        message: `Minimum order quantity is ${product.moq}`,
      },
    ];
  }
  return [];
}

function validateNotEmpty(items: CartItem[]): ValidationError[] {
  if (items.length === 0 || items.every((i) => i.quantity <= 0)) {
    return [{ type: 'empty-cart', message: 'Add at least one item' }];
  }
  return [];
}

function validateMinCart(
  items: CartItem[],
  products: ValidationItem[],
  minCartSizeRaw: number,
): ValidationError[] {
  const subtotal = items.reduce((sum, item) => {
    const product = resolveItem(item, products);
    if (!product) return sum;
    return sum + calculateLineTotal(product.rawPrice, item.quantity);
  }, 0);

  if (subtotal < minCartSizeRaw) {
    return [{ type: 'min-cart', message: 'Minimum order total not met' }];
  }
  return [];
}

interface WholesaleRules extends CartRules {
  withMinCartSize(minCartSizeRaw: number): CartRules;
}

export const wholesaleRules: WholesaleRules = {
  validateItem(
    item: CartItem,
    product: ValidationItem,
  ): ValidationResult {
    const errors = validateItemMoq(item, product);
    return { valid: errors.length === 0, errors };
  },

  validateCart(
    items: CartItem[],
    products: ValidationItem[],
  ): ValidationResult {
    const errors: ValidationError[] = [];
    errors.push(...validateNotEmpty(items));
    for (const item of items) {
      const product = resolveItem(item, products);
      if (product) errors.push(...validateItemMoq(item, product));
    }
    return { valid: errors.length === 0, errors };
  },

  withMinCartSize(minCartSizeRaw: number): CartRules {
    return {
      validateItem: wholesaleRules.validateItem,
      validateCart(
        items: CartItem[],
        products: ValidationItem[],
      ): ValidationResult {
        const base = wholesaleRules.validateCart(items, products);
        const hasItems =
          items.length > 0 && items.some((i) => i.quantity > 0);
        if (hasItems) {
          base.errors.push(
            ...validateMinCart(items, products, minCartSizeRaw),
          );
          base.valid = base.errors.length === 0;
        }
        return base;
      },
    };
  },
};

export const dtcRules: CartRules = {
  validateItem(
    _item: CartItem,
    _product: ValidationItem,
  ): ValidationResult {
    return { valid: true, errors: [] };
  },

  validateCart(
    items: CartItem[],
    _products: ValidationItem[],
  ): ValidationResult {
    const errors = validateNotEmpty(items);
    return { valid: errors.length === 0, errors };
  },
};
