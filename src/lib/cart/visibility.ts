import type { CartItem } from './types.js';

export interface CartVisibilityInput {
  items: readonly CartItem[];
  priceMap: Record<string, number>;
  disabledSkus: Set<string>;
}

export interface CartVisibilityResult {
  visibleItems: CartItem[];
  unavailableItems: CartItem[];
  itemCount: number;
  subtotal: number;
}

export function computeCartVisibility(
  input: CartVisibilityInput,
): CartVisibilityResult {
  const { items, priceMap, disabledSkus } = input;
  const visibleItems: CartItem[] = [];
  const unavailableItems: CartItem[] = [];
  let itemCount = 0;
  let subtotal = 0;

  for (const item of items) {
    const price = priceMap[item.sku];
    const isKnown = price !== undefined;
    const isDisabled = disabledSkus.has(item.sku);

    if (isKnown && !isDisabled) {
      visibleItems.push(item);
      itemCount += item.quantity;
      subtotal += price * item.quantity;
    } else {
      unavailableItems.push(item);
    }
  }

  return { visibleItems, unavailableItems, itemCount, subtotal };
}
