/** Maximum quantity allowed per line item. Sized for real wholesale orders; rejects abuse. */
export const MAX_QUANTITY = 10_000;

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
