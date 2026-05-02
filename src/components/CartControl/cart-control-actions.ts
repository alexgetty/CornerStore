import { snapToMoq } from '../../lib/validation/quantity.js';

export type CartControlAction = 'add' | 'up' | 'down' | 'input';

const CLASS_TO_ACTION: ReadonlyArray<readonly [string, CartControlAction]> = [
  ['cs-cart-control-add', 'add'],
  ['cs-cart-control-down', 'down'],
  ['cs-cart-control-up', 'up'],
  ['cs-cart-control-input', 'input'],
];

/**
 * Classify an element's class list into a cart-control action, or null if the
 * element is not a cart-control surface. Takes a plain string[] so the pure
 * logic can be unit-tested without a DOM.
 */
export function classifyCartControlTarget(classList: readonly string[]): CartControlAction | null {
  for (const [cls, action] of CLASS_TO_ACTION) {
    if (classList.includes(cls)) return action;
  }
  return null;
}

/**
 * Compute the next quantity for a cart-control action.
 *
 * - `add` sets the quantity to the initial order size (`moq` or 1). This is
 *   fired by the "Add to Cart" button which is only visible when the current
 *   quantity is 0.
 * - `up` increments by MOQ (or 1 if no MOQ) relative to the current quantity.
 * - `down` decrements by MOQ. If the step would land between 0 and MOQ
 *   (e.g. user typed 7 with MOQ=5), it snaps to MOQ first; only a click from
 *   exactly MOQ removes the line.
 * - `input` uses the user-entered value verbatim (clamped >= 0, floored to int).
 *   We deliberately do NOT snap `input` to MOQ — the parent surfaces MOQ
 *   violations as validation errors instead of silently coercing the user's
 *   input.
 */
export function nextQuantity(
  action: CartControlAction,
  current: number,
  moq: number | null,
  inputValue?: number,
): number {
  switch (action) {
    case 'add':
      return moq ?? 1;
    case 'up':
      return snapToMoq(current, moq, 'up');
    case 'down':
      return snapToMoq(current, moq, 'down');
    case 'input': {
      if (inputValue === undefined || Number.isNaN(inputValue)) return 0;
      return Math.max(0, Math.floor(inputValue));
    }
  }
}
