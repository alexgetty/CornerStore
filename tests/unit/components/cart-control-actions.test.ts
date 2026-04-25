import { describe, it, expect } from 'vitest';
import {
  nextQuantity,
  classifyCartControlTarget,
} from '../../../src/components/CartControl/cart-control-actions.js';

describe('classifyCartControlTarget', () => {
  it('returns "add" when the class list includes the add button class', () => {
    expect(classifyCartControlTarget(['cs-cart-control-add'])).toBe('add');
  });

  it('returns "down" when the class list includes the down button class', () => {
    expect(classifyCartControlTarget(['cs-cart-control-down'])).toBe('down');
  });

  it('returns "up" when the class list includes the up button class', () => {
    expect(classifyCartControlTarget(['cs-cart-control-up'])).toBe('up');
  });

  it('returns "input" when the class list includes the input class', () => {
    expect(classifyCartControlTarget(['cs-cart-control-input'])).toBe('input');
  });

  it('returns null when no recognized class is present', () => {
    expect(classifyCartControlTarget(['cs-something-else'])).toBeNull();
  });

  it('returns null for an empty class list', () => {
    expect(classifyCartControlTarget([])).toBeNull();
  });

  it('ignores unrelated classes alongside a recognized one', () => {
    expect(classifyCartControlTarget(['foo', 'cs-cart-control-up', 'bar'])).toBe('up');
  });
});

describe('nextQuantity', () => {
  describe('add action', () => {
    it('sets to MOQ when MOQ is set (initial order size)', () => {
      expect(nextQuantity('add', 0, 6)).toBe(6);
    });

    it('sets to 1 when MOQ is null', () => {
      expect(nextQuantity('add', 0, null)).toBe(1);
    });

    it('ignores current quantity — "Add to Cart" is only visible when current is 0', () => {
      // If the add button is programmatically clicked while the stepper is
      // live, the action should still produce the initial order size rather
      // than compound onto the existing qty.
      expect(nextQuantity('add', 6, 6)).toBe(6);
      expect(nextQuantity('add', 3, null)).toBe(1);
    });
  });

  describe('up action', () => {
    it('increments by 1 when MOQ is null', () => {
      expect(nextQuantity('up', 3, null)).toBe(4);
    });

    it('increments by MOQ when MOQ is set', () => {
      expect(nextQuantity('up', 6, 6)).toBe(12);
    });

    it('from 0 goes to MOQ', () => {
      expect(nextQuantity('up', 0, 6)).toBe(6);
    });
  });

  describe('down action', () => {
    it('decrements by 1 when MOQ is null', () => {
      expect(nextQuantity('down', 3, null)).toBe(2);
    });

    it('decrements by MOQ when MOQ is set', () => {
      expect(nextQuantity('down', 12, 6)).toBe(6);
    });

    it('decrementing from MOQ snaps to 0', () => {
      expect(nextQuantity('down', 6, 6)).toBe(0);
    });

    it('never goes below 0', () => {
      expect(nextQuantity('down', 0, null)).toBe(0);
      expect(nextQuantity('down', 1, null)).toBe(0);
    });
  });

  describe('input action', () => {
    it('uses the provided input value', () => {
      expect(nextQuantity('input', 0, null, 5)).toBe(5);
    });

    it('clamps negative input values to 0', () => {
      expect(nextQuantity('input', 0, null, -3)).toBe(0);
    });

    it('floors non-integer input to integer', () => {
      expect(nextQuantity('input', 0, null, 3.7)).toBe(3);
    });

    it('treats undefined input value as 0', () => {
      expect(nextQuantity('input', 5, null)).toBe(0);
    });

    it('treats NaN input value as 0', () => {
      expect(nextQuantity('input', 5, null, NaN)).toBe(0);
    });

    it('does NOT snap to MOQ on manual input (preserves user intent for validation)', () => {
      expect(nextQuantity('input', 0, 6, 3)).toBe(3);
    });
  });
});
