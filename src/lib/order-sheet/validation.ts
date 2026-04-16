import type { OrderSheetItem, OrderValidation, OrderValidationError } from './types.js';

export function validateQuantity(quantity: number, moq: number | null): boolean {
  if (quantity === 0) return true;
  if (moq !== null && quantity < moq) return false;
  return true;
}

export function snapToMoq(
  current: number,
  moq: number | null,
  direction: 'up' | 'down',
): number {
  const step = moq ?? 1;
  if (direction === 'up') {
    return current + step;
  }
  const next = current - step;
  if (moq !== null && next > 0 && next < moq) return 0;
  return Math.max(0, next);
}

export function calculateLineTotal(rawPrice: number, quantity: number): number {
  return rawPrice * quantity;
}

export function calculateSubtotal(items: OrderSheetItem[]): number {
  return items.reduce(
    (sum, item) => sum + calculateLineTotal(item.rawPrice, item.quantity),
    0,
  );
}

export function validateOrder(
  items: OrderSheetItem[],
  minCartSizeRaw: number | null,
  buyerName: string,
  buyerEmail: string,
): OrderValidation {
  const errors: OrderValidationError[] = [];

  for (const item of items) {
    if (!validateQuantity(item.quantity, item.moq)) {
      errors.push({
        type: 'moq',
        sku: item.sku,
        message: `Minimum order quantity is ${item.moq}`,
      });
    }
  }

  const hasItems = items.some((i) => i.quantity > 0);
  if (!hasItems) {
    errors.push({ type: 'empty-cart', message: 'Add at least one item' });
  }

  if (hasItems && minCartSizeRaw !== null) {
    const subtotal = calculateSubtotal(items);
    if (subtotal < minCartSizeRaw) {
      errors.push({ type: 'min-cart', message: 'Minimum order total not met' });
    }
  }

  if (!buyerName.trim()) {
    errors.push({ type: 'missing-name', message: 'Name is required' });
  }

  if (!buyerEmail.trim()) {
    errors.push({ type: 'missing-email', message: 'Email is required' });
  }

  return { valid: errors.length === 0, errors };
}
