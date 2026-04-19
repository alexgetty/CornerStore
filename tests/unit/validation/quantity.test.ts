import { describe, it, expect } from 'vitest';
import { validateQuantity, snapToMoq } from '../../../src/lib/validation/quantity.js';

describe('validateQuantity', () => {
  it('returns true for zero quantity regardless of MOQ', () => {
    expect(validateQuantity(0, 6)).toBe(true);
    expect(validateQuantity(0, null)).toBe(true);
  });

  it('returns true when quantity meets MOQ', () => {
    expect(validateQuantity(6, 6)).toBe(true);
    expect(validateQuantity(12, 6)).toBe(true);
  });

  it('returns false when quantity is below MOQ', () => {
    expect(validateQuantity(3, 6)).toBe(false);
    expect(validateQuantity(1, 6)).toBe(false);
  });

  it('returns true for any positive quantity when MOQ is null', () => {
    expect(validateQuantity(1, null)).toBe(true);
    expect(validateQuantity(100, null)).toBe(true);
  });
});

describe('snapToMoq', () => {
  it('returns 0 when current is 0 and direction is down', () => {
    expect(snapToMoq(0, 6, 'down')).toBe(0);
  });

  it('returns MOQ when current is 0 and direction is up', () => {
    expect(snapToMoq(0, 6, 'up')).toBe(6);
  });

  it('increments by MOQ from current value', () => {
    expect(snapToMoq(6, 6, 'up')).toBe(12);
    expect(snapToMoq(12, 6, 'up')).toBe(18);
  });

  it('decrements by MOQ from current value', () => {
    expect(snapToMoq(12, 6, 'down')).toBe(6);
  });

  it('snaps down to zero when decrement would go below MOQ', () => {
    expect(snapToMoq(6, 6, 'down')).toBe(0);
  });

  it('snaps down to zero when result is between zero and MOQ', () => {
    // e.g., current=8, moq=6, step=6, next=2 → 2 is between 0 and 6, snap to 0
    expect(snapToMoq(8, 6, 'down')).toBe(0);
  });

  it('increments by 1 when MOQ is null and direction is up', () => {
    expect(snapToMoq(0, null, 'up')).toBe(1);
    expect(snapToMoq(5, null, 'up')).toBe(6);
  });

  it('decrements by 1 when MOQ is null and direction is down', () => {
    expect(snapToMoq(5, null, 'down')).toBe(4);
  });

  it('does not go below zero', () => {
    expect(snapToMoq(0, null, 'down')).toBe(0);
  });
});
