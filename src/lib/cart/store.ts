import type { Cart, CartItem, CartMode } from './types.js';

export const CART_STORAGE_KEY = 'cs-cart';
export const CART_EVENT = 'cs:cart-updated';

interface StoreDeps {
  storage: Storage;
  dispatchEvent: (event: Event) => void;
}

const defaultDeps: StoreDeps = {
  get storage() {
    return window.localStorage;
  },
  dispatchEvent: (event: Event) => window.dispatchEvent(event),
};

function isValidItem(item: unknown): item is CartItem {
  if (item === null || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.sku === 'string' &&
    rec.sku.length > 0 &&
    typeof rec.quantity === 'number' &&
    rec.quantity > 0
  );
}

function readItems(deps: StoreDeps): CartItem[] {
  try {
    const raw = deps.storage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isValidItem);
  } catch {
    return [];
  }
}

function writeItems(items: CartItem[], deps: StoreDeps): void {
  deps.storage.setItem(CART_STORAGE_KEY, JSON.stringify({ items }));
  deps.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function getCart(
  mode: CartMode,
  deps: StoreDeps = defaultDeps,
): Cart {
  return { items: readItems(deps), mode };
}

export function setItem(
  sku: string,
  quantity: number,
  mode: CartMode,
  deps: StoreDeps = defaultDeps,
): void {
  const items = readItems(deps);
  const existing = items.findIndex((i) => i.sku === sku);

  if (quantity <= 0) {
    if (existing !== -1) items.splice(existing, 1);
  } else if (existing !== -1) {
    items[existing] = { sku, quantity };
  } else {
    items.push({ sku, quantity });
  }

  writeItems(items, deps);
}

export function removeItem(
  sku: string,
  mode: CartMode,
  deps: StoreDeps = defaultDeps,
): void {
  const items = readItems(deps).filter((i) => i.sku !== sku);
  writeItems(items, deps);
}

export function clear(deps: StoreDeps = defaultDeps): void {
  deps.storage.removeItem(CART_STORAGE_KEY);
  deps.dispatchEvent(new CustomEvent(CART_EVENT));
}
