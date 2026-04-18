// src/lib/cart/summary.ts

import type { CartItem, CartRules, CartSummary, ShippingStatus } from './types.js';
import type { ValidationItem } from '../validation/types.js';
import { calculateLineTotal } from '../validation/totals.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';

interface ShippingConfig {
  shippingFlat?: number;
  shippingFreeThreshold?: number;
  minCartSize?: number;
}

function calculateCartSubtotal(items: CartItem[], products: ValidationItem[]): number {
  return items.reduce((sum, item) => {
    const product = products.find((p) => p.sku === item.sku);
    if (!product) return sum;
    return sum + calculateLineTotal(product.rawPrice, item.quantity);
  }, 0);
}

function resolveShipping(subtotal: number, config: ShippingConfig): ShippingStatus | null {
  if (config.shippingFlat == null) return null;

  if (config.shippingFreeThreshold != null) {
    const thresholdRaw = decimalToRawPrice(config.shippingFreeThreshold, DEFAULT_CURRENCY);
    if (subtotal >= thresholdRaw) {
      return { type: 'free' };
    }
    return { type: 'remaining', amount: config.shippingFlat, threshold: thresholdRaw };
  }

  return { type: 'flat', amount: config.shippingFlat };
}

function resolveDistanceToMinimum(subtotal: number, config: ShippingConfig): number | null {
  if (config.minCartSize == null) return null;
  const minRaw = decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY);
  const remaining = minRaw - subtotal;
  return remaining > 0 ? remaining : null;
}

export function getSummary(
  items: CartItem[],
  products: ValidationItem[],
  rules: CartRules,
  config: ShippingConfig,
): CartSummary {
  const subtotal = calculateCartSubtotal(items, products);
  return {
    subtotal,
    shipping: resolveShipping(subtotal, config),
    distanceToMinimum: resolveDistanceToMinimum(subtotal, config),
    validation: rules.validateCart(items, products),
  };
}
