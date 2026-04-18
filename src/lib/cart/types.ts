// src/lib/cart/types.ts

import type { ValidationItem, ValidationResult } from '../validation/types.js';

export interface CartItem {
  sku: string;
  quantity: number;
}

export type CartMode = 'wholesale' | 'dtc';

export interface Cart {
  items: CartItem[];
  mode: CartMode;
}

export interface CartRules {
  validateItem(item: CartItem, product: ValidationItem): ValidationResult;
  validateCart(items: CartItem[], products: ValidationItem[]): ValidationResult;
}

export type ShippingStatus =
  | { type: 'free' }
  | { type: 'flat'; amount: number }
  | { type: 'remaining'; amount: number; threshold: number };

export interface CartSummary {
  subtotal: number;
  shipping: ShippingStatus | null;
  distanceToMinimum: number | null;
  validation: ValidationResult;
}
