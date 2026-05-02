import { describe, it, expect } from 'vitest';
import { validateQuantity, snapToMoq, MAX_QUANTITY } from '../../../src/lib/validation/quantity.js';

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

  it('snaps down to zero when current equals MOQ', () => {
    // At MOQ, the only meaningful "less" action is removal from cart.
    expect(snapToMoq(6, 6, 'down')).toBe(0);
  });

  it('snaps down to MOQ when current is above MOQ but step would go below it', () => {
    // e.g., current=8, moq=6, step=6, next=2 → 2 is below MOQ, snap to MOQ.
    // This handles user-typed quantities between MOQ+1 and 2*MOQ; clicking
    // "less" should reduce to MOQ first rather than skipping straight to 0.
    expect(snapToMoq(8, 6, 'down')).toBe(6);
    expect(snapToMoq(7, 5, 'down')).toBe(5);
    expect(snapToMoq(6, 5, 'down')).toBe(5);
  });

  it('decrements normally when result is at or above MOQ', () => {
    // current=11, moq=5, step=5, next=6 → 6 is above MOQ, no snap.
    expect(snapToMoq(11, 5, 'down')).toBe(6);
    expect(snapToMoq(10, 5, 'down')).toBe(5);
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

describe('MAX_QUANTITY', () => {
  it('is exported as 10_000', () => {
    expect(MAX_QUANTITY).toBe(10_000);
  });
});
