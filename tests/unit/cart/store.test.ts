import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCart,
  setItem,
  removeItem,
  clear,
  CART_STORAGE_KEY,
  CART_EVENT,
} from '../../../src/lib/cart/store.js';
import type { CartMode } from '../../../src/lib/cart/types.js';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};

const dispatchEventMock = vi.fn();

beforeEach(() => {
  for (const key in store) delete store[key];
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  dispatchEventMock.mockClear();
});

const deps = {
  storage: localStorageMock as unknown as Storage,
  dispatchEvent: dispatchEventMock,
};

const mode: CartMode = 'wholesale';

describe('constants', () => {
  it('exports the correct storage key', () => {
    expect(CART_STORAGE_KEY).toBe('cs-cart');
  });

  it('exports the correct event name', () => {
    expect(CART_EVENT).toBe('cs:cart-updated');
  });
});

describe('getCart', () => {
  it('returns empty cart when localStorage is empty', () => {
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns empty cart when localStorage has invalid JSON', () => {
    store[CART_STORAGE_KEY] = 'not-json{{{';
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns empty cart when localStorage has non-array items', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: 'not-an-array' });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns empty cart when localStorage has null value', () => {
    store[CART_STORAGE_KEY] = JSON.stringify(null);
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns saved items from localStorage', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'ABC-001', quantity: 3 },
        { sku: 'DEF-002', quantity: 1 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [
        { sku: 'ABC-001', quantity: 3 },
        { sku: 'DEF-002', quantity: 1 },
      ],
      mode: 'wholesale',
    });
  });

  it('filters out items with empty sku', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: '', quantity: 1 },
        { sku: 'VALID-001', quantity: 2 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out items with missing sku', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ quantity: 1 }, { sku: 'VALID-001', quantity: 2 }],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out items with negative quantity', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'NEG-001', quantity: -5 },
        { sku: 'VALID-001', quantity: 2 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out items with zero quantity', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'ZERO-001', quantity: 0 },
        { sku: 'VALID-001', quantity: 2 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out non-object items', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [null, 42, 'string', { sku: 'VALID-001', quantity: 2 }],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out items with non-string sku', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 123, quantity: 1 },
        { sku: 'VALID-001', quantity: 2 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('filters out items with non-number quantity', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'BAD-001', quantity: '5' },
        { sku: 'VALID-001', quantity: 2 },
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({
      items: [{ sku: 'VALID-001', quantity: 2 }],
      mode: 'wholesale',
    });
  });

  it('passes the mode through to the returned cart', () => {
    const cart = getCart('dtc', deps);
    expect(cart.mode).toBe('dtc');
  });
});

describe('setItem', () => {
  it('adds new item to empty cart', () => {
    setItem('NEW-001', 5, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([{ sku: 'NEW-001', quantity: 5 }]);
  });

  it('updates quantity of existing item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ sku: 'EXIST-001', quantity: 3 }],
    });
    setItem('EXIST-001', 10, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([{ sku: 'EXIST-001', quantity: 10 }]);
  });

  it('removes item when quantity is 0', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'REMOVE-001', quantity: 3 },
        { sku: 'KEEP-001', quantity: 1 },
      ],
    });
    setItem('REMOVE-001', 0, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([{ sku: 'KEEP-001', quantity: 1 }]);
  });

  it('removes item when quantity is negative', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ sku: 'REMOVE-001', quantity: 3 }],
    });
    setItem('REMOVE-001', -1, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([]);
  });

  it('is a no-op removal for non-existent item with quantity <= 0', () => {
    setItem('GHOST-001', 0, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([]);
  });

  it('dispatches cart updated event', () => {
    setItem('NEW-001', 1, mode, deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    const event = dispatchEventMock.mock.calls[0][0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(CART_EVENT);
  });

  it('preserves other items when adding a new one', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ sku: 'EXISTING-001', quantity: 2 }],
    });
    setItem('NEW-002', 4, mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([
      { sku: 'EXISTING-001', quantity: 2 },
      { sku: 'NEW-002', quantity: 4 },
    ]);
  });
});

describe('removeItem', () => {
  it('removes an existing item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'REMOVE-001', quantity: 5 },
        { sku: 'KEEP-001', quantity: 2 },
      ],
    });
    removeItem('REMOVE-001', mode, deps);
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([{ sku: 'KEEP-001', quantity: 2 }]);
  });

  it('still writes and dispatches for non-existent item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ sku: 'KEEP-001', quantity: 2 }],
    });
    removeItem('GHOST-001', mode, deps);
    expect(localStorageMock.setItem).toHaveBeenCalledOnce();
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    const stored = JSON.parse(store[CART_STORAGE_KEY]);
    expect(stored.items).toEqual([{ sku: 'KEEP-001', quantity: 2 }]);
  });

  it('dispatches cart updated event', () => {
    removeItem('ANY-001', mode, deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    const event = dispatchEventMock.mock.calls[0][0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(CART_EVENT);
  });
});

describe('clear', () => {
  it('removes the storage key', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [{ sku: 'OLD-001', quantity: 1 }],
    });
    clear(deps);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(CART_STORAGE_KEY);
    expect(store[CART_STORAGE_KEY]).toBeUndefined();
  });

  it('dispatches cart updated event', () => {
    clear(deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    const event = dispatchEventMock.mock.calls[0][0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(CART_EVENT);
  });

  it('works when storage is already empty', () => {
    clear(deps);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(CART_STORAGE_KEY);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
  });
});
