import type { ValidationItem } from './types.js';

export function calculateLineTotal(rawPrice: number, quantity: number): number {
  return rawPrice * quantity;
}

export function calculateSubtotal(items: ValidationItem[]): number {
  return items.reduce(
    (sum, item) => sum + calculateLineTotal(item.rawPrice, item.quantity),
    0,
  );
}
