import type { ValidationItem, ValidationError, ValidationResult } from './types.js';
import { validateQuantity } from './quantity.js';
import { calculateSubtotal } from './totals.js';

export function validateOrder(
  items: ValidationItem[],
  minCartSizeRaw: number | null,
  buyerName: string,
  buyerEmail: string,
): ValidationResult {
  const errors: ValidationError[] = [];

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
