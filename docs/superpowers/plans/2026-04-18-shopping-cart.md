# Shopping Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side shopping cart data layer with localStorage persistence, wholesale rules, Stripe Checkout integration via serverless function, and progressive enhancement of the existing order sheet.

**Architecture:** Cart is a standalone module in `src/lib/cart/`. Shared validation functions (MOQ, min cart size, line totals) are extracted from `src/lib/order-sheet/` into `src/lib/validation/` so both the cart and the standalone order sheet can use them. The order sheet progressively enhances with cart support: base behavior works without the cart, cart hooks in on top when available. A single serverless function at `src/pages/api/checkout.ts` creates Stripe Checkout Sessions.

**Tech Stack:** TypeScript, Vitest, Astro API routes, Stripe SDK, localStorage, CustomEvent API

**Spec:** `docs/superpowers/specs/2026-04-18-shopping-cart-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/validation/types.ts` | Shared validation types (ValidationItem, ValidationError, ValidationResult) |
| `src/lib/validation/index.ts` | Barrel export |
| `src/lib/validation/quantity.ts` | validateQuantity, snapToMoq (moved from order-sheet) |
| `src/lib/validation/totals.ts` | calculateLineTotal, calculateSubtotal (moved from order-sheet) |
| `src/lib/validation/order.ts` | validateOrder (moved from order-sheet, updated to use new types) |
| `src/lib/cart/types.ts` | CartItem, Cart, CartRules, CartSummary, ShippingStatus types |
| `src/lib/cart/index.ts` | Barrel export |
| `src/lib/cart/store.ts` | getCart, setItem, removeItem, clear, localStorage persistence, events |
| `src/lib/cart/rules.ts` | wholesaleRules, dtcRules implementing CartRules interface |
| `src/lib/cart/summary.ts` | getSummary: subtotal, shipping status, distance to minimum |
| `src/pages/api/checkout.ts` | Astro API route: validates cart, applies wholesale pricing, creates Stripe Checkout Session |
| `tests/unit/validation/quantity.test.ts` | Tests for validateQuantity, snapToMoq |
| `tests/unit/validation/totals.test.ts` | Tests for calculateLineTotal, calculateSubtotal |
| `tests/unit/validation/order.test.ts` | Tests for validateOrder |
| `tests/unit/cart/store.test.ts` | Tests for cart store operations + localStorage + events |
| `tests/unit/cart/rules.test.ts` | Tests for wholesale and DTC rules |
| `tests/unit/cart/summary.test.ts` | Tests for getSummary |
| `tests/unit/cart/checkout.test.ts` | Tests for checkout endpoint request validation and session creation |

### Modified files

| File | Change |
|------|--------|
| `src/lib/storefront/types.ts` | Add `shippingFlat` and `shippingFreeThreshold` to StoreConfig |
| `src/lib/storefront/config.ts` | Parse new shipping config fields |
| `src/lib/order-sheet/validation.ts` | Replace with re-exports from `src/lib/validation/` |
| `src/lib/order-sheet/types.ts` | Keep OrderSheetItem, import shared types from validation |
| `src/components/OrderSheet/order-sheet.ts` | Progressive enhancement: hydrate from cart, route submit to checkout with PDF fallback |
| `src/components/OrderSheet/OrderSheet.astro` | Add checkout button, error/fallback UI elements |
| `src/pages/order-sheet.astro` | Pass shipping config to OrderSheet |
| `tests/unit/storefront/config.test.ts` | Add tests for shipping config parsing |

---

## Task 1: Extract shared validation types

**Files:**
- Create: `src/lib/validation/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/validation/types.ts

export interface ValidationItem {
  sku: string;
  name: string;
  rawPrice: number;
  moq: number | null;
  quantity: number;
}

export interface ValidationError {
  type: 'moq' | 'min-cart' | 'empty-cart' | 'missing-name' | 'missing-email';
  message: string;
  sku?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

These are identical to the existing `OrderSheetItem`, `OrderValidationError`, and `OrderValidation` types from `src/lib/order-sheet/types.ts`, extracted so both the order sheet and the cart can use them without depending on each other.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation/types.ts
git commit -m "feat(validation): add shared validation types"
```

---

## Task 2: Move validation functions to shared module

**Files:**
- Create: `src/lib/validation/quantity.ts`
- Create: `src/lib/validation/totals.ts`
- Create: `src/lib/validation/order.ts`
- Create: `src/lib/validation/index.ts`
- Modify: `src/lib/order-sheet/validation.ts`
- Modify: `src/lib/order-sheet/types.ts`
- Move: `tests/unit/order-sheet/validation.test.ts` -> split into `tests/unit/validation/quantity.test.ts`, `tests/unit/validation/totals.test.ts`, `tests/unit/validation/order.test.ts`

This is a pure move/split. No logic changes. Existing tests must pass after the move.

- [ ] **Step 1: Create `src/lib/validation/quantity.ts`**

```typescript
// src/lib/validation/quantity.ts

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
```

- [ ] **Step 2: Create `src/lib/validation/totals.ts`**

```typescript
// src/lib/validation/totals.ts

import type { ValidationItem } from './types.js';

export function calculateLineTotal(rawPrice: number, quantity: number): number {
  return rawPrice * quantity;
}

export function calculateSubtotal(items: ValidationItem[]): number {
  return items.reduce(
    (sum, item) => sum + calculateLineTotal(item.rawPrice, item.quantity),
    0,
  );
}
```

- [ ] **Step 3: Create `src/lib/validation/order.ts`**

```typescript
// src/lib/validation/order.ts

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
```

- [ ] **Step 4: Create `src/lib/validation/index.ts`**

```typescript
// src/lib/validation/index.ts

export type { ValidationItem, ValidationError, ValidationResult } from './types.js';
export { validateQuantity, snapToMoq } from './quantity.js';
export { calculateLineTotal, calculateSubtotal } from './totals.js';
export { validateOrder } from './order.js';
```

- [ ] **Step 5: Update `src/lib/order-sheet/types.ts` to re-export from shared**

```typescript
// src/lib/order-sheet/types.ts

export type { ValidationItem as OrderSheetItem } from '../validation/types.js';
export type { ValidationError as OrderValidationError } from '../validation/types.js';
export type { ValidationResult as OrderValidation } from '../validation/types.js';
```

- [ ] **Step 6: Update `src/lib/order-sheet/validation.ts` to re-export from shared**

```typescript
// src/lib/order-sheet/validation.ts

export { validateQuantity, snapToMoq } from '../validation/quantity.js';
export { calculateLineTotal, calculateSubtotal } from '../validation/totals.js';
export { validateOrder } from '../validation/order.js';
```

- [ ] **Step 7: Create `tests/unit/validation/quantity.test.ts`**

```typescript
// tests/unit/validation/quantity.test.ts

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
```

- [ ] **Step 8: Create `tests/unit/validation/totals.test.ts`**

```typescript
// tests/unit/validation/totals.test.ts

import { describe, it, expect } from 'vitest';
import { calculateLineTotal, calculateSubtotal } from '../../../src/lib/validation/totals.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';

function makeItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1999,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('calculateLineTotal', () => {
  it('returns 0 for zero quantity', () => {
    expect(calculateLineTotal(1999, 0)).toBe(0);
  });

  it('multiplies raw price by quantity', () => {
    expect(calculateLineTotal(1999, 3)).toBe(5997);
  });

  it('handles single unit', () => {
    expect(calculateLineTotal(500, 1)).toBe(500);
  });
});

describe('calculateSubtotal', () => {
  it('returns 0 for empty items', () => {
    expect(calculateSubtotal([])).toBe(0);
  });

  it('returns 0 when all quantities are zero', () => {
    const items = [makeItem({ quantity: 0 }), makeItem({ quantity: 0 })];
    expect(calculateSubtotal(items)).toBe(0);
  });

  it('sums line totals', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 500, quantity: 3 }),
    ];
    expect(calculateSubtotal(items)).toBe(3500);
  });

  it('ignores zero-quantity items', () => {
    const items = [
      makeItem({ rawPrice: 1000, quantity: 2 }),
      makeItem({ rawPrice: 9999, quantity: 0 }),
    ];
    expect(calculateSubtotal(items)).toBe(2000);
  });
});
```

- [ ] **Step 9: Create `tests/unit/validation/order.test.ts`**

```typescript
// tests/unit/validation/order.test.ts

import { describe, it, expect } from 'vitest';
import { validateOrder } from '../../../src/lib/validation/order.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';

function makeItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1999,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('validateOrder', () => {
  it('returns valid for a complete valid order', () => {
    const items = [makeItem({ quantity: 6, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns moq error when quantity below MOQ', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'moq', sku: 'TEST-001' }),
    );
  });

  it('allows zero quantity even with MOQ', () => {
    const items = [makeItem({ quantity: 0, moq: 6 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'moq')).toBeUndefined();
  });

  it('returns empty-cart error when no items have quantity', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'empty-cart' }),
    );
  });

  it('returns min-cart error when subtotal is below minimum', () => {
    const items = [makeItem({ rawPrice: 1000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'min-cart' }),
    );
  });

  it('passes min-cart check when subtotal meets minimum', () => {
    const items = [makeItem({ rawPrice: 5000, quantity: 1 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when minCartSizeRaw is null', () => {
    const items = [makeItem({ rawPrice: 100, quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('skips min-cart check when cart is empty', () => {
    const items = [makeItem({ quantity: 0 })];
    const result = validateOrder(items, 5000, 'Jane', 'jane@example.com');
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });

  it('returns missing-name error when name is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-name error when name is whitespace', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, '   ', 'jane@example.com');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-name' }),
    );
  });

  it('returns missing-email error when email is empty', () => {
    const items = [makeItem({ quantity: 1 })];
    const result = validateOrder(items, null, 'Jane', '');
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'missing-email' }),
    );
  });

  it('collects multiple errors', () => {
    const items = [makeItem({ quantity: 3, moq: 6 })];
    const result = validateOrder(items, 99999, '', '');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 10: Run new tests to verify they pass**

Run: `npx vitest run tests/unit/validation/`
Expected: All tests pass (identical logic, just moved)

- [ ] **Step 11: Run old tests to verify re-exports work**

Run: `npx vitest run tests/unit/order-sheet/`
Expected: All tests still pass via re-exports

- [ ] **Step 12: Delete old test file**

Delete `tests/unit/order-sheet/validation.test.ts`. The tests now live in `tests/unit/validation/`.

- [ ] **Step 13: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 14: Commit**

```bash
git add src/lib/validation/ src/lib/order-sheet/ tests/unit/validation/
git rm tests/unit/order-sheet/validation.test.ts
git commit -m "refactor: extract shared validation into src/lib/validation"
```

---

## Task 3: Add shipping config to StoreConfig

**Files:**
- Modify: `src/lib/storefront/types.ts:26-36`
- Modify: `src/lib/storefront/config.ts:7-39`
- Modify: `tests/unit/storefront/config.test.ts`

- [ ] **Step 1: Write failing tests for shipping config parsing**

Add to `tests/unit/storefront/config.test.ts`:

```typescript
describe('shipping config', () => {
  it('parses shippingFlat when valid positive number', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFlat: 5.99 });
    expect(config.shippingFlat).toBe(5.99);
  });

  it('omits shippingFlat when zero', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFlat: 0 });
    expect(config.shippingFlat).toBeUndefined();
  });

  it('omits shippingFlat when negative', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFlat: -5 });
    expect(config.shippingFlat).toBeUndefined();
  });

  it('omits shippingFlat when not a number', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFlat: 'free' });
    expect(config.shippingFlat).toBeUndefined();
  });

  it('parses shippingFreeThreshold when valid positive number', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFreeThreshold: 100 });
    expect(config.shippingFreeThreshold).toBe(100);
  });

  it('omits shippingFreeThreshold when zero', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFreeThreshold: 0 });
    expect(config.shippingFreeThreshold).toBeUndefined();
  });

  it('omits shippingFreeThreshold when negative', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFreeThreshold: -50 });
    expect(config.shippingFreeThreshold).toBeUndefined();
  });

  it('omits shippingFreeThreshold when not a number', () => {
    const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], shippingFreeThreshold: true });
    expect(config.shippingFreeThreshold).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: FAIL (shippingFlat and shippingFreeThreshold not parsed)

- [ ] **Step 3: Add types to StoreConfig**

In `src/lib/storefront/types.ts`, add to the `StoreConfig` interface:

```typescript
export interface StoreConfig {
  name: string;
  home: string;
  nav: NavItem[];
  footerNav: NavItem[];
  contact?: string;
  logo?: string;
  orderSheet?: boolean;
  minCartSize?: number;
  wholesaleMargin?: number;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
}
```

- [ ] **Step 4: Add parsing logic to config.ts**

In `src/lib/storefront/config.ts`, add to the `parseConfig` function after the `wholesaleMargin` block:

```typescript
  if (typeof obj.shippingFlat === 'number' && obj.shippingFlat > 0) {
    config.shippingFlat = obj.shippingFlat;
  }

  if (typeof obj.shippingFreeThreshold === 'number' && obj.shippingFreeThreshold > 0) {
    config.shippingFreeThreshold = obj.shippingFreeThreshold;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/storefront/types.ts src/lib/storefront/config.ts tests/unit/storefront/config.test.ts
git commit -m "feat(config): add shippingFlat and shippingFreeThreshold"
```

---

## Task 4: Cart types

**Files:**
- Create: `src/lib/cart/types.ts`

- [ ] **Step 1: Write cart types**

```typescript
// src/lib/cart/types.ts

import type { ValidationItem, ValidationResult } from '../validation/types.js';

export interface CartItem {
  sku: string;
  quantity: number;
}

export type CartMode = 'wholesale' | 'dtc';

export interface Cart {
  items: CartItem[];
  mode: CartMode;
}

export interface CartRules {
  validateItem(item: CartItem, product: ValidationItem): ValidationResult;
  validateCart(items: CartItem[], products: ValidationItem[]): ValidationResult;
}

export type ShippingStatus =
  | { type: 'free' }
  | { type: 'flat'; amount: number }
  | { type: 'remaining'; amount: number; threshold: number };

export interface CartSummary {
  subtotal: number;
  shipping: ShippingStatus | null;
  distanceToMinimum: number | null;
  validation: ValidationResult;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/cart/types.ts
git commit -m "feat(cart): add cart type definitions"
```

---

## Task 5: Cart store (localStorage persistence + events)

**Files:**
- Create: `src/lib/cart/store.ts`
- Create: `tests/unit/cart/store.test.ts`

- [ ] **Step 1: Write failing tests for cart store**

```typescript
// tests/unit/cart/store.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCart, setItem, removeItem, clear, CART_STORAGE_KEY, CART_EVENT } from '../../../src/lib/cart/store.js';
import type { CartMode } from '../../../src/lib/cart/types.js';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
};

// Mock window.dispatchEvent
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

describe('getCart', () => {
  it('returns empty cart when localStorage is empty', () => {
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns empty cart when localStorage has invalid JSON', () => {
    store[CART_STORAGE_KEY] = 'not-json';
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns empty cart when localStorage has non-array items', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: 'not-array' });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [], mode: 'wholesale' });
  });

  it('returns saved items from localStorage', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'A', quantity: 3 }] });
    const cart = getCart(mode, deps);
    expect(cart).toEqual({ items: [{ sku: 'A', quantity: 3 }], mode: 'wholesale' });
  });

  it('filters out invalid items from localStorage', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({
      items: [
        { sku: 'A', quantity: 3 },
        { sku: '', quantity: 1 },
        { quantity: 5 },
        { sku: 'B', quantity: -1 },
        'not-an-object',
      ],
    });
    const cart = getCart(mode, deps);
    expect(cart.items).toEqual([{ sku: 'A', quantity: 3 }]);
  });
});

describe('setItem', () => {
  it('adds a new item to empty cart', () => {
    setItem('SKU-1', 6, mode, deps);
    const saved = JSON.parse(store[CART_STORAGE_KEY]);
    expect(saved.items).toEqual([{ sku: 'SKU-1', quantity: 6 }]);
  });

  it('updates quantity of existing item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'SKU-1', quantity: 6 }] });
    setItem('SKU-1', 12, mode, deps);
    const saved = JSON.parse(store[CART_STORAGE_KEY]);
    expect(saved.items).toEqual([{ sku: 'SKU-1', quantity: 12 }]);
  });

  it('removes item when quantity is 0', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'SKU-1', quantity: 6 }] });
    setItem('SKU-1', 0, mode, deps);
    const saved = JSON.parse(store[CART_STORAGE_KEY]);
    expect(saved.items).toEqual([]);
  });

  it('dispatches cart updated event', () => {
    setItem('SKU-1', 6, mode, deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    const event = dispatchEventMock.mock.calls[0][0];
    expect(event.type).toBe(CART_EVENT);
  });
});

describe('removeItem', () => {
  it('removes existing item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'A', quantity: 3 }, { sku: 'B', quantity: 5 }] });
    removeItem('A', mode, deps);
    const saved = JSON.parse(store[CART_STORAGE_KEY]);
    expect(saved.items).toEqual([{ sku: 'B', quantity: 5 }]);
  });

  it('is a no-op for non-existent item', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'A', quantity: 3 }] });
    removeItem('Z', mode, deps);
    const saved = JSON.parse(store[CART_STORAGE_KEY]);
    expect(saved.items).toEqual([{ sku: 'A', quantity: 3 }]);
  });

  it('dispatches cart updated event', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'A', quantity: 3 }] });
    removeItem('A', mode, deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
  });
});

describe('clear', () => {
  it('removes all items', () => {
    store[CART_STORAGE_KEY] = JSON.stringify({ items: [{ sku: 'A', quantity: 3 }] });
    clear(deps);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(CART_STORAGE_KEY);
    expect(store[CART_STORAGE_KEY]).toBeUndefined();
  });

  it('dispatches cart updated event', () => {
    clear(deps);
    expect(dispatchEventMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart/store.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement cart store**

```typescript
// src/lib/cart/store.ts

import type { Cart, CartItem, CartMode } from './types.js';

export const CART_STORAGE_KEY = 'cs-cart';
export const CART_EVENT = 'cs:cart-updated';

interface StoreDeps {
  storage: Storage;
  dispatchEvent: (event: Event) => void;
}

const defaultDeps: StoreDeps = {
  get storage() { return window.localStorage; },
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

export function getCart(mode: CartMode, deps: StoreDeps = defaultDeps): Cart {
  return { items: readItems(deps), mode };
}

export function setItem(sku: string, quantity: number, mode: CartMode, deps: StoreDeps = defaultDeps): void {
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

export function removeItem(sku: string, mode: CartMode, deps: StoreDeps = defaultDeps): void {
  const items = readItems(deps).filter((i) => i.sku !== sku);
  writeItems(items, deps);
}

export function clear(deps: StoreDeps = defaultDeps): void {
  deps.storage.removeItem(CART_STORAGE_KEY);
  deps.dispatchEvent(new CustomEvent(CART_EVENT));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cart/store.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/store.ts tests/unit/cart/store.test.ts
git commit -m "feat(cart): add cart store with localStorage persistence and events"
```

---

## Task 6: Cart rules (wholesale + DTC)

**Files:**
- Create: `src/lib/cart/rules.ts`
- Create: `tests/unit/cart/rules.test.ts`

- [ ] **Step 1: Write failing tests for cart rules**

```typescript
// tests/unit/cart/rules.test.ts

import { describe, it, expect } from 'vitest';
import { wholesaleRules, dtcRules } from '../../../src/lib/cart/rules.js';
import type { CartItem } from '../../../src/lib/cart/types.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';

function makeProduct(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1000,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('wholesaleRules.validateItem', () => {
  it('returns valid for zero quantity', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 0 };
    const product = makeProduct({ moq: 6 });
    const result = wholesaleRules.validateItem(item, product);
    expect(result.valid).toBe(true);
  });

  it('returns valid when quantity meets MOQ', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 12 };
    const product = makeProduct({ moq: 6 });
    const result = wholesaleRules.validateItem(item, product);
    expect(result.valid).toBe(true);
  });

  it('returns moq error when quantity below MOQ', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 3 };
    const product = makeProduct({ moq: 6 });
    const result = wholesaleRules.validateItem(item, product);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'moq', sku: 'TEST-001' }),
    );
  });

  it('returns valid for any positive quantity when no MOQ', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 1 };
    const product = makeProduct({ moq: null });
    const result = wholesaleRules.validateItem(item, product);
    expect(result.valid).toBe(true);
  });
});

describe('wholesaleRules.validateCart', () => {
  it('returns valid for non-empty cart with no min cart size', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 6 }];
    const products = [makeProduct({ sku: 'A', moq: 6, rawPrice: 1000 })];
    const result = wholesaleRules.validateCart(items, products);
    expect(result.valid).toBe(true);
  });

  it('returns empty-cart error when all quantities are zero', () => {
    const items: CartItem[] = [];
    const products = [makeProduct({ sku: 'A' })];
    const result = wholesaleRules.validateCart(items, products);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'empty-cart' }),
    );
  });

  it('returns moq error for individual items that violate MOQ', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 3 }];
    const products = [makeProduct({ sku: 'A', moq: 6, rawPrice: 1000 })];
    const result = wholesaleRules.validateCart(items, products);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'moq', sku: 'A' }),
    );
  });

  it('skips items not found in products', () => {
    const items: CartItem[] = [{ sku: 'UNKNOWN', quantity: 5 }];
    const products = [makeProduct({ sku: 'A' })];
    const result = wholesaleRules.validateCart(items, products);
    // Unknown items are ignored in validation, not an error
    expect(result.errors.find(e => e.type === 'moq')).toBeUndefined();
  });
});

describe('wholesaleRules.validateCart with minCartSize', () => {
  it('returns min-cart error when subtotal below minimum', () => {
    const rules = wholesaleRules.withMinCartSize(5000);
    const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const result = rules.validateCart(items, products);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'min-cart' }),
    );
  });

  it('returns valid when subtotal meets minimum', () => {
    const rules = wholesaleRules.withMinCartSize(5000);
    const items: CartItem[] = [{ sku: 'A', quantity: 5 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const result = rules.validateCart(items, products);
    expect(result.errors.find(e => e.type === 'min-cart')).toBeUndefined();
  });
});

describe('dtcRules.validateItem', () => {
  it('returns valid for any positive quantity regardless of MOQ', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 1 };
    const product = makeProduct({ moq: 100 });
    const result = dtcRules.validateItem(item, product);
    expect(result.valid).toBe(true);
  });

  it('returns valid for zero quantity', () => {
    const item: CartItem = { sku: 'TEST-001', quantity: 0 };
    const product = makeProduct();
    const result = dtcRules.validateItem(item, product);
    expect(result.valid).toBe(true);
  });
});

describe('dtcRules.validateCart', () => {
  it('returns valid for non-empty cart', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
    const products = [makeProduct({ sku: 'A' })];
    const result = dtcRules.validateCart(items, products);
    expect(result.valid).toBe(true);
  });

  it('returns empty-cart error for empty cart', () => {
    const items: CartItem[] = [];
    const products = [makeProduct({ sku: 'A' })];
    const result = dtcRules.validateCart(items, products);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'empty-cart' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart/rules.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement cart rules**

```typescript
// src/lib/cart/rules.ts

import type { CartItem, CartRules } from './types.js';
import type { ValidationItem, ValidationError, ValidationResult } from '../validation/types.js';
import { validateQuantity } from '../validation/quantity.js';
import { calculateLineTotal } from '../validation/totals.js';

function resolveItem(cartItem: CartItem, products: ValidationItem[]): ValidationItem | null {
  return products.find((p) => p.sku === cartItem.sku) ?? null;
}

function validateItemMoq(item: CartItem, product: ValidationItem): ValidationError[] {
  if (!validateQuantity(item.quantity, product.moq)) {
    return [{
      type: 'moq',
      sku: item.sku,
      message: `Minimum order quantity is ${product.moq}`,
    }];
  }
  return [];
}

function validateNotEmpty(items: CartItem[]): ValidationError[] {
  if (items.length === 0 || items.every((i) => i.quantity <= 0)) {
    return [{ type: 'empty-cart', message: 'Add at least one item' }];
  }
  return [];
}

function validateMinCart(items: CartItem[], products: ValidationItem[], minCartSizeRaw: number): ValidationError[] {
  const subtotal = items.reduce((sum, item) => {
    const product = resolveItem(item, products);
    if (!product) return sum;
    return sum + calculateLineTotal(product.rawPrice, item.quantity);
  }, 0);

  if (subtotal < minCartSizeRaw) {
    return [{ type: 'min-cart', message: 'Minimum order total not met' }];
  }
  return [];
}

interface WholesaleRules extends CartRules {
  withMinCartSize(minCartSizeRaw: number): CartRules;
}

export const wholesaleRules: WholesaleRules = {
  validateItem(item: CartItem, product: ValidationItem): ValidationResult {
    const errors = validateItemMoq(item, product);
    return { valid: errors.length === 0, errors };
  },

  validateCart(items: CartItem[], products: ValidationItem[]): ValidationResult {
    const errors: ValidationError[] = [];

    errors.push(...validateNotEmpty(items));

    for (const item of items) {
      const product = resolveItem(item, products);
      if (product) errors.push(...validateItemMoq(item, product));
    }

    return { valid: errors.length === 0, errors };
  },

  withMinCartSize(minCartSizeRaw: number): CartRules {
    return {
      validateItem: wholesaleRules.validateItem,
      validateCart(items: CartItem[], products: ValidationItem[]): ValidationResult {
        const base = wholesaleRules.validateCart(items, products);
        const hasItems = items.length > 0 && items.some((i) => i.quantity > 0);
        if (hasItems) {
          base.errors.push(...validateMinCart(items, products, minCartSizeRaw));
          base.valid = base.errors.length === 0;
        }
        return base;
      },
    };
  },
};

export const dtcRules: CartRules = {
  validateItem(_item: CartItem, _product: ValidationItem): ValidationResult {
    return { valid: true, errors: [] };
  },

  validateCart(items: CartItem[], _products: ValidationItem[]): ValidationResult {
    const errors = validateNotEmpty(items);
    return { valid: errors.length === 0, errors };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cart/rules.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/rules.ts tests/unit/cart/rules.test.ts
git commit -m "feat(cart): add wholesale and DTC cart rules"
```

---

## Task 7: Cart summary

**Files:**
- Create: `src/lib/cart/summary.ts`
- Create: `tests/unit/cart/summary.test.ts`

- [ ] **Step 1: Write failing tests for cart summary**

```typescript
// tests/unit/cart/summary.test.ts

import { describe, it, expect } from 'vitest';
import { getSummary } from '../../../src/lib/cart/summary.js';
import type { CartItem } from '../../../src/lib/cart/types.js';
import type { ValidationItem } from '../../../src/lib/validation/types.js';
import { wholesaleRules } from '../../../src/lib/cart/rules.js';

function makeProduct(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    rawPrice: 1000,
    moq: null,
    quantity: 0,
    ...overrides,
  };
}

describe('getSummary', () => {
  it('returns zero subtotal for empty cart', () => {
    const summary = getSummary([], [], wholesaleRules, {});
    expect(summary.subtotal).toBe(0);
  });

  it('calculates subtotal from items and products', () => {
    const items: CartItem[] = [
      { sku: 'A', quantity: 3 },
      { sku: 'B', quantity: 2 },
    ];
    const products = [
      makeProduct({ sku: 'A', rawPrice: 1000 }),
      makeProduct({ sku: 'B', rawPrice: 500 }),
    ];
    const summary = getSummary(items, products, wholesaleRules, {});
    expect(summary.subtotal).toBe(4000);
  });

  it('ignores items not in products', () => {
    const items: CartItem[] = [{ sku: 'UNKNOWN', quantity: 5 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, {});
    expect(summary.subtotal).toBe(0);
  });

  it('returns null shipping when no shipping config', () => {
    const summary = getSummary([], [], wholesaleRules, {});
    expect(summary.shipping).toBeNull();
  });

  it('returns free shipping when subtotal meets threshold', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 10 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, {
      shippingFlat: 5.99,
      shippingFreeThreshold: 100,
    });
    expect(summary.shipping).toEqual({ type: 'free' });
  });

  it('returns flat shipping when below threshold', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, {
      shippingFlat: 5.99,
      shippingFreeThreshold: 100,
    });
    expect(summary.shipping).toEqual({ type: 'remaining', amount: 5.99, threshold: 10000 });
  });

  it('returns flat shipping when no free threshold', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, {
      shippingFlat: 5.99,
    });
    expect(summary.shipping).toEqual({ type: 'flat', amount: 5.99 });
  });

  it('returns null distanceToMinimum when no minCartSize', () => {
    const summary = getSummary([], [], wholesaleRules, {});
    expect(summary.distanceToMinimum).toBeNull();
  });

  it('returns distance to minimum when below threshold', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 1 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, { minCartSize: 50 });
    expect(summary.distanceToMinimum).toBe(4000);
  });

  it('returns null distanceToMinimum when minimum is met', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 5 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000 })];
    const summary = getSummary(items, products, wholesaleRules, { minCartSize: 50 });
    expect(summary.distanceToMinimum).toBeNull();
  });

  it('includes validation result from rules', () => {
    const items: CartItem[] = [{ sku: 'A', quantity: 3 }];
    const products = [makeProduct({ sku: 'A', rawPrice: 1000, moq: 6 })];
    const summary = getSummary(items, products, wholesaleRules, {});
    expect(summary.validation.valid).toBe(false);
    expect(summary.validation.errors).toContainEqual(
      expect.objectContaining({ type: 'moq' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart/summary.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement cart summary**

```typescript
// src/lib/cart/summary.ts

import type { CartItem, CartRules, CartSummary, ShippingStatus } from './types.js';
import type { ValidationItem } from '../validation/types.js';
import { calculateLineTotal } from '../validation/totals.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';

interface ShippingConfig {
  shippingFlat?: number;
  shippingFreeThreshold?: number;
  minCartSize?: number;
}

function calculateCartSubtotal(items: CartItem[], products: ValidationItem[]): number {
  return items.reduce((sum, item) => {
    const product = products.find((p) => p.sku === item.sku);
    if (!product) return sum;
    return sum + calculateLineTotal(product.rawPrice, item.quantity);
  }, 0);
}

function resolveShipping(subtotal: number, config: ShippingConfig): ShippingStatus | null {
  if (config.shippingFlat == null) return null;

  if (config.shippingFreeThreshold != null) {
    const thresholdRaw = decimalToRawPrice(config.shippingFreeThreshold, DEFAULT_CURRENCY);
    if (subtotal >= thresholdRaw) {
      return { type: 'free' };
    }
    return { type: 'remaining', amount: config.shippingFlat, threshold: thresholdRaw };
  }

  return { type: 'flat', amount: config.shippingFlat };
}

function resolveDistanceToMinimum(subtotal: number, config: ShippingConfig): number | null {
  if (config.minCartSize == null) return null;
  const minRaw = decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY);
  const remaining = minRaw - subtotal;
  return remaining > 0 ? remaining : null;
}

export function getSummary(
  items: CartItem[],
  products: ValidationItem[],
  rules: CartRules,
  config: ShippingConfig,
): CartSummary {
  const subtotal = calculateCartSubtotal(items, products);
  return {
    subtotal,
    shipping: resolveShipping(subtotal, config),
    distanceToMinimum: resolveDistanceToMinimum(subtotal, config),
    validation: rules.validateCart(items, products),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cart/summary.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/summary.ts tests/unit/cart/summary.test.ts
git commit -m "feat(cart): add getSummary with shipping and minimum order status"
```

---

## Task 8: Cart barrel export

**Files:**
- Create: `src/lib/cart/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
// src/lib/cart/index.ts

export type { CartItem, Cart, CartMode, CartRules, CartSummary, ShippingStatus } from './types.js';
export { getCart, setItem, removeItem, clear, CART_STORAGE_KEY, CART_EVENT } from './store.js';
export { wholesaleRules, dtcRules } from './rules.js';
export { getSummary } from './summary.js';
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/cart/index.ts
git commit -m "feat(cart): add barrel export"
```

---

## Task 9: Checkout API endpoint

**Files:**
- Create: `src/pages/api/checkout.ts`
- Create: `tests/unit/cart/checkout.test.ts`

The checkout endpoint is an Astro API route. It receives `{items: [{sku, quantity}]}`, validates server-side, applies wholesale margin, creates a Stripe Checkout Session, and returns `{url}`.

- [ ] **Step 1: Write failing tests for checkout request validation**

The endpoint has two concerns: (1) validating/parsing the request, and (2) creating the Stripe session. We test the validation logic as a pure function. The Stripe integration is tested separately.

```typescript
// tests/unit/cart/checkout.test.ts

import { describe, it, expect } from 'vitest';
import { parseCheckoutRequest, buildLineItems } from '../../../src/lib/cart/checkout.js';
import type { CatalogProduct } from '../../../src/lib/catalog/types.js';

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    price: 25.00,
    category: null,
    status: null,
    storefront: true,
    orderSheet: true,
    description: null,
    paymentLink: null,
    moq: null,
    ...overrides,
  };
}

describe('parseCheckoutRequest', () => {
  it('parses valid request body', () => {
    const body = { items: [{ sku: 'A', quantity: 6 }] };
    const result = parseCheckoutRequest(body);
    expect(result).toEqual({ ok: true, items: [{ sku: 'A', quantity: 6 }] });
  });

  it('rejects missing items array', () => {
    const result = parseCheckoutRequest({});
    expect(result.ok).toBe(false);
  });

  it('rejects non-array items', () => {
    const result = parseCheckoutRequest({ items: 'not-array' });
    expect(result.ok).toBe(false);
  });

  it('rejects empty items array', () => {
    const result = parseCheckoutRequest({ items: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects items with missing sku', () => {
    const result = parseCheckoutRequest({ items: [{ quantity: 6 }] });
    expect(result.ok).toBe(false);
  });

  it('rejects items with non-positive quantity', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 0 }] });
    expect(result.ok).toBe(false);
  });

  it('rejects items with non-integer quantity', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 2.5 }] });
    expect(result.ok).toBe(false);
  });
});

describe('buildLineItems', () => {
  it('builds Stripe line items with wholesale margin applied', () => {
    const items = [{ sku: 'A', quantity: 6 }];
    const catalog = [makeProduct({ sku: 'A', name: 'Sticker A', price: 10.00 })];
    const result = buildLineItems(items, catalog, 0.5);
    expect(result).toEqual({
      ok: true,
      lineItems: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Sticker A' },
          unit_amount: 500,
        },
        quantity: 6,
      }],
    });
  });

  it('uses full price when no wholesale margin', () => {
    const items = [{ sku: 'A', quantity: 1 }];
    const catalog = [makeProduct({ sku: 'A', name: 'Sticker A', price: 10.00 })];
    const result = buildLineItems(items, catalog, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lineItems[0].price_data.unit_amount).toBe(1000);
    }
  });

  it('rejects unknown SKU', () => {
    const items = [{ sku: 'UNKNOWN', quantity: 1 }];
    const catalog = [makeProduct({ sku: 'A' })];
    const result = buildLineItems(items, catalog, 0.5);
    expect(result.ok).toBe(false);
  });

  it('rejects quantity below MOQ', () => {
    const items = [{ sku: 'A', quantity: 3 }];
    const catalog = [makeProduct({ sku: 'A', moq: 6 })];
    const result = buildLineItems(items, catalog, 0.5);
    expect(result.ok).toBe(false);
  });

  it('validates minimum cart size when provided', () => {
    const items = [{ sku: 'A', quantity: 1 }];
    const catalog = [makeProduct({ sku: 'A', price: 1.00 })];
    const result = buildLineItems(items, catalog, 0.5, 5000);
    expect(result.ok).toBe(false);
  });

  it('passes minimum cart size when met', () => {
    const items = [{ sku: 'A', quantity: 10 }];
    const catalog = [makeProduct({ sku: 'A', price: 10.00 })];
    const result = buildLineItems(items, catalog, 0.5, 5000);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement checkout logic (pure functions)**

```typescript
// src/lib/cart/checkout.ts

import type { CatalogProduct } from '../catalog/types.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';
import { validateQuantity } from '../validation/quantity.js';

export interface CheckoutItem {
  sku: string;
  quantity: number;
}

type ParseResult =
  | { ok: true; items: CheckoutItem[] }
  | { ok: false; error: string };

export function parseCheckoutRequest(body: unknown): ParseResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    return { ok: false, error: 'Items array is required and must not be empty' };
  }

  const items: CheckoutItem[] = [];
  for (const raw of obj.items) {
    if (raw === null || typeof raw !== 'object') {
      return { ok: false, error: 'Each item must be an object' };
    }
    const rec = raw as Record<string, unknown>;
    if (typeof rec.sku !== 'string' || !rec.sku) {
      return { ok: false, error: 'Each item must have a sku string' };
    }
    if (typeof rec.quantity !== 'number' || rec.quantity <= 0 || !Number.isInteger(rec.quantity)) {
      return { ok: false, error: 'Each item must have a positive integer quantity' };
    }
    items.push({ sku: rec.sku, quantity: rec.quantity });
  }

  return { ok: true, items };
}

interface StripeLineItem {
  price_data: {
    currency: string;
    product_data: { name: string };
    unit_amount: number;
  };
  quantity: number;
}

type BuildResult =
  | { ok: true; lineItems: StripeLineItem[] }
  | { ok: false; error: string };

export function buildLineItems(
  items: CheckoutItem[],
  catalog: CatalogProduct[],
  wholesaleMargin: number | undefined,
  minCartSizeRaw?: number,
): BuildResult {
  const lineItems: StripeLineItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = catalog.find((p) => p.sku === item.sku);
    if (!product) {
      return { ok: false, error: `Unknown SKU: ${item.sku}` };
    }

    if (!validateQuantity(item.quantity, product.moq)) {
      return { ok: false, error: `${item.sku}: minimum order quantity is ${product.moq}` };
    }

    const rawPrice = decimalToRawPrice(product.price, DEFAULT_CURRENCY);
    const unitAmount = wholesaleMargin != null
      ? Math.round(rawPrice * wholesaleMargin)
      : rawPrice;

    subtotal += unitAmount * item.quantity;

    lineItems.push({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: { name: product.name },
        unit_amount: unitAmount,
      },
      quantity: item.quantity,
    });
  }

  if (minCartSizeRaw != null && subtotal < minCartSizeRaw) {
    return { ok: false, error: 'Minimum order total not met' };
  }

  return { ok: true, lineItems };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cart/checkout.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart/checkout.ts tests/unit/cart/checkout.test.ts
git commit -m "feat(cart): add checkout request parsing and line item builder"
```

---

## Task 10: Stripe Checkout API route

**Files:**
- Create: `src/pages/api/checkout.ts`

This is the Astro API route that wires together the checkout logic with the actual Stripe API. It's a thin glue layer.

- [ ] **Step 1: Create the API route**

```typescript
// src/pages/api/checkout.ts

import type { APIRoute } from 'astro';
import { loadConfig } from '../../lib/storefront/config.js';
import { loadCatalog } from '../../lib/catalog/csv.js';
import { parseCheckoutRequest, buildLineItems } from '../../lib/cart/checkout.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../../lib/storefront/pricing.js';
import Stripe from 'stripe';

export const POST: APIRoute = async ({ request, url }) => {
  const config = await loadConfig();
  const catalog = await loadCatalog();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const parsed = parseCheckoutRequest(body);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
  }

  const minCartSizeRaw = config.minCartSize != null
    ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
    : undefined;

  const built = buildLineItems(parsed.items, catalog, config.wholesaleMargin, minCartSizeRaw);
  if (!built.ok) {
    return new Response(JSON.stringify({ error: built.error }), { status: 400 });
  }

  const stripeKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
  if (config.shippingFlat != null) {
    shippingOptions.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: decimalToRawPrice(config.shippingFlat, DEFAULT_CURRENCY),
          currency: DEFAULT_CURRENCY,
        },
        display_name: 'Standard Shipping',
      },
    });

    if (config.shippingFreeThreshold != null) {
      shippingOptions.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: DEFAULT_CURRENCY },
          display_name: 'Free Shipping',
        },
      });
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: built.lineItems,
      shipping_options: shippingOptions.length > 0 ? shippingOptions : undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: `${url.origin}/success`,
      cancel_url: `${url.origin}/cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
```

Note: Shipping options are offered to the buyer at Stripe Checkout. If the subtotal qualifies for free shipping, both options appear and the buyer selects. This is a known simplification. A more robust version would conditionally show only the qualifying option, but for MVP, letting Stripe present both and the buyer choose is acceptable.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors (may warn about missing STRIPE_SECRET_KEY at runtime, but that's expected)

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/checkout.ts
git commit -m "feat(cart): add Stripe Checkout API route"
```

---

## Task 11: Order sheet progressive enhancement

**Files:**
- Modify: `src/components/OrderSheet/OrderSheet.astro:38-184`
- Modify: `src/components/OrderSheet/order-sheet.ts`
- Modify: `src/pages/order-sheet.astro`

This task modifies the order sheet to progressively enhance with cart support. Base behavior (standalone PDF) remains untouched. Cart integration layers on top.

- [ ] **Step 1: Add checkout UI elements to OrderSheet.astro**

Add a `data-checkout-url` attribute to the root element (empty by default, set by page if checkout is available), and add checkout-related UI after the existing `cs-mailto-section`:

In `src/components/OrderSheet/OrderSheet.astro`, add `checkoutEnabled` to Props:

```typescript
interface Props {
  storeName: string;
  contact: string;
  logo?: string;
  listings: Listing[];
  minCartSize?: number;
  minCartSizeRaw: number | null;
  currency: string;
  wholesaleMargin?: number;
  checkoutEnabled?: boolean;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
}
```

Add to the destructuring:

```typescript
const { storeName, contact, logo, listings, minCartSize, minCartSizeRaw, currency, wholesaleMargin, checkoutEnabled, shippingFlat, shippingFreeThreshold } = Astro.props;
```

Add data attributes to the root `<div>`:

```html
data-checkout-enabled={checkoutEnabled ? 'true' : ''}
data-shipping-flat={shippingFlat ?? ''}
data-shipping-free-threshold={shippingFreeThreshold ?? ''}
```

Add after `cs-mailto-section`:

```html
<div class="cs-checkout-error" hidden></div>
<div class="cs-checkout-fallback" hidden>
  <button type="button" class="cs-retry-btn">Try Again</button>
  <button type="button" class="cs-pdf-btn">Download PDF</button>
</div>
<div class="cs-cart-summary" hidden>
  <p class="cs-shipping-status"></p>
  <p class="cs-minimum-status"></p>
</div>
```

- [ ] **Step 2: Update order-sheet.ts with progressive cart enhancement**

Replace the submit handler and add cart integration. The full updated `order-sheet.ts`:

```typescript
// src/components/OrderSheet/order-sheet.ts

import {
  validateQuantity,
  snapToMoq,
  calculateLineTotal,
  calculateSubtotal,
  validateOrder,
} from '../../lib/validation/index.js';
import type { ValidationItem } from '../../lib/validation/types.js';
import { formatPrice } from '../../lib/storefront/pricing.js';

const root = document.querySelector('.cs-order-sheet') as HTMLElement;
if (root) init(root);

function init(root: HTMLElement) {
  const currency = root.dataset.currency ?? 'usd';
  const minCartSizeRaw = root.dataset.minCartSizeRaw ? Number(root.dataset.minCartSizeRaw) : null;
  const contact = root.dataset.contact ?? '';
  const storeName = root.dataset.storeName ?? '';
  const checkoutEnabled = root.dataset.checkoutEnabled === 'true';

  const rows = root.querySelectorAll<HTMLElement>('.cs-order-row');
  const subtotalEl = root.querySelector('.cs-subtotal-value') as HTMLElement;
  const submitBtn = root.querySelector('.cs-submit-btn') as HTMLButtonElement;
  const errorsEl = root.querySelector('.cs-order-errors') as HTMLElement;
  const mailtoSection = root.querySelector('.cs-mailto-section') as HTMLElement;
  const mailtoLink = root.querySelector('.cs-mailto-link') as HTMLAnchorElement;
  const nameInput = root.querySelector('.cs-buyer-name') as HTMLInputElement;
  const emailInput = root.querySelector('.cs-buyer-email') as HTMLInputElement;
  const lightbox = root.querySelector('.cs-lightbox') as HTMLElement;
  const lightboxImg = root.querySelector('.cs-lightbox-img') as HTMLImageElement;
  const lightboxBackdrop = root.querySelector('.cs-lightbox-backdrop') as HTMLElement;
  const checkoutError = root.querySelector('.cs-checkout-error') as HTMLElement;
  const checkoutFallback = root.querySelector('.cs-checkout-fallback') as HTMLElement;
  const retryBtn = root.querySelector('.cs-retry-btn') as HTMLButtonElement;
  const pdfBtn = root.querySelector('.cs-pdf-btn') as HTMLButtonElement;
  const cartSummary = root.querySelector('.cs-cart-summary') as HTMLElement;
  const shippingStatus = root.querySelector('.cs-shipping-status') as HTMLElement;
  const minimumStatus = root.querySelector('.cs-minimum-status') as HTMLElement;

  // --- Cart integration (progressive enhancement) ---
  let cartModule: typeof import('../../lib/cart/index.js') | null = null;
  let cartAvailable = false;

  async function initCart() {
    try {
      cartModule = await import('../../lib/cart/index.js');
      cartAvailable = true;
      hydrateFromCart();
      window.addEventListener('storage', onStorageChange);
      window.addEventListener(cartModule.CART_EVENT, onCartUpdate);
    } catch {
      // Cart module failed to load. Base behavior continues.
    }
  }

  function hydrateFromCart() {
    if (!cartModule) return;
    const cart = cartModule.getCart('wholesale');
    for (const row of rows) {
      const sku = row.dataset.sku ?? '';
      const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
      const cartItem = cart.items.find((i) => i.sku === sku);
      input.value = String(cartItem?.quantity ?? 0);
      updateRow(row, currency);
    }
    updateTotals();
  }

  function syncToCart(sku: string, quantity: number) {
    if (!cartModule) return;
    cartModule.setItem(sku, quantity, 'wholesale');
  }

  function onStorageChange(e: StorageEvent) {
    if (cartModule && e.key === cartModule.CART_STORAGE_KEY) {
      hydrateFromCart();
    }
  }

  function onCartUpdate() {
    hydrateFromCart();
  }

  // Start cart initialization (non-blocking)
  initCart();

  // --- Quantity controls ---
  rows.forEach((row) => {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const downBtn = row.querySelector('.cs-qty-down') as HTMLButtonElement;
    const upBtn = row.querySelector('.cs-qty-up') as HTMLButtonElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const sku = row.dataset.sku ?? '';

    downBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'down');
      input.value = String(next);
      updateRow(row, currency);
      updateTotals();
      syncToCart(sku, next);
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'up');
      input.value = String(next);
      updateRow(row, currency);
      updateTotals();
      syncToCart(sku, next);
    });

    input.addEventListener('change', () => {
      const val = parseInt(input.value) || 0;
      const clamped = Math.max(0, val);
      input.value = String(clamped);
      updateRow(row, currency);
      updateTotals();
      syncToCart(sku, clamped);
    });

    removeBtn.addEventListener('click', () => {
      input.value = '0';
      updateRow(row, currency);
      updateTotals();
      syncToCart(sku, 0);
    });
  });

  // --- Lightbox ---
  root.querySelectorAll<HTMLButtonElement>('.cs-thumb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightboxImg.src = btn.dataset.fullSrc ?? '';
      lightboxImg.alt = btn.dataset.alt ?? '';
      lightbox.hidden = false;
    });
  });

  lightboxBackdrop.addEventListener('click', () => { lightbox.hidden = true; });
  lightboxImg.addEventListener('click', (e) => { e.stopPropagation(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) lightbox.hidden = true;
  });

  // --- Validation on input ---
  nameInput.addEventListener('input', updateTotals);
  emailInput.addEventListener('input', updateTotals);

  function updateRow(row: HTMLElement, currency: string) {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const rawPrice = Number(row.dataset.rawPrice);
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const qty = parseInt(input.value) || 0;

    lineTotalEl.textContent = formatPrice(calculateLineTotal(rawPrice, qty), currency);
    removeBtn.hidden = qty === 0;

    const isValid = validateQuantity(qty, moq);
    input.classList.toggle('cs-invalid', !isValid);
  }

  function getItems(): ValidationItem[] {
    return Array.from(rows).map((row) => {
      const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
      return {
        sku: row.dataset.sku ?? '',
        name: row.querySelector('strong')?.textContent ?? '',
        rawPrice: Number(row.dataset.rawPrice),
        moq: row.dataset.moq ? Number(row.dataset.moq) : null,
        quantity: parseInt(input.value) || 0,
      };
    });
  }

  function updateTotals() {
    const items = getItems();
    const subtotal = calculateSubtotal(items);
    subtotalEl.textContent = formatPrice(subtotal, currency);

    const result = validateOrder(items, minCartSizeRaw, nameInput.value, emailInput.value);

    if (result.errors.length > 0) {
      errorsEl.replaceChildren();
      const ul = document.createElement('ul');
      for (const e of result.errors) {
        const li = document.createElement('li');
        li.textContent = e.message;
        ul.appendChild(li);
      }
      errorsEl.appendChild(ul);
      errorsEl.hidden = false;
    } else {
      errorsEl.replaceChildren();
      errorsEl.hidden = true;
    }

    submitBtn.disabled = !result.valid;

    // Update cart summary display
    updateCartSummary(subtotal);
  }

  function updateCartSummary(subtotal: number) {
    if (!cartSummary) return;

    const shippingFlat = root.dataset.shippingFlat ? Number(root.dataset.shippingFlat) : null;
    const shippingFreeThreshold = root.dataset.shippingFreeThreshold ? Number(root.dataset.shippingFreeThreshold) : null;

    let hasContent = false;

    // Shipping status
    if (shippingFlat != null && shippingStatus) {
      if (shippingFreeThreshold != null && subtotal >= shippingFreeThreshold * 100) {
        shippingStatus.textContent = 'Free shipping';
      } else if (shippingFreeThreshold != null) {
        const remaining = (shippingFreeThreshold * 100) - subtotal;
        shippingStatus.textContent = `${formatPrice(remaining, currency)} more for free shipping`;
      } else {
        shippingStatus.textContent = `${formatPrice(shippingFlat * 100, currency)} shipping`;
      }
      shippingStatus.hidden = false;
      hasContent = true;
    } else if (shippingStatus) {
      shippingStatus.hidden = true;
    }

    // Minimum order status
    if (minCartSizeRaw != null && minimumStatus) {
      const remaining = minCartSizeRaw - subtotal;
      if (remaining > 0) {
        minimumStatus.textContent = `${formatPrice(remaining, currency)} away from minimum order`;
        minimumStatus.hidden = false;
        hasContent = true;
      } else {
        minimumStatus.hidden = true;
      }
    } else if (minimumStatus) {
      minimumStatus.hidden = true;
    }

    cartSummary.hidden = !hasContent;
  }

  // --- Submit handler ---
  submitBtn.addEventListener('click', async () => {
    if (checkoutEnabled) {
      await attemptCheckout();
    } else {
      await generatePdf();
    }
  });

  // Fallback buttons (shown after checkout failure)
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      checkoutFallback.hidden = true;
      checkoutError.hidden = true;
      await attemptCheckout();
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      await generatePdf();
    });
  }

  async function attemptCheckout() {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    checkoutError.hidden = true;
    checkoutFallback.hidden = true;

    const items = getItems()
      .filter((i) => i.quantity > 0)
      .map((i) => ({ sku: i.sku, quantity: i.quantity }));

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Checkout failed' }));
        throw new Error(data.error ?? 'Checkout failed');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      checkoutError.textContent = `Checkout unavailable: ${message}`;
      checkoutError.hidden = false;
      checkoutFallback.hidden = false;

      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    }
  }

  async function generatePdf() {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating PDF...';

    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const pdfContent = root.cloneNode(true) as HTMLElement;

      pdfContent.querySelectorAll(
        '.cs-order-actions, .cs-mailto-section, .cs-lightbox, .cs-order-errors, .cs-col-image, .cs-col-remove, .cs-qty-btn, .cs-remove-btn, .cs-min-cart-notice, .cs-checkout-error, .cs-checkout-fallback, .cs-cart-summary'
      ).forEach((el) => el.remove());

      pdfContent.querySelectorAll('.cs-order-row').forEach((row) => {
        const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
        if (parseInt(input.value) === 0) row.remove();
      });

      pdfContent.querySelectorAll('.cs-qty-input').forEach((input) => {
        const val = (input as HTMLInputElement).value;
        const span = document.createElement('span');
        span.textContent = val;
        span.style.textAlign = 'right';
        input.replaceWith(span);
      });

      pdfContent.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
        const span = document.createElement('span');
        span.textContent = el.value;
        el.replaceWith(span);
      });

      pdfContent.querySelectorAll('.cs-category-row').forEach((catRow) => {
        const next = catRow.nextElementSibling;
        if (!next || next.classList.contains('cs-category-row') || next.tagName === 'TFOOT') {
          catRow.remove();
        }
      });

      const date = new Date().toISOString().slice(0, 10);
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `order-${slug}-${date}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pdfContent)
        .save();

      const buyerName = nameInput.value.trim();
      const buyerEmail = emailInput.value.trim();
      const subject = encodeURIComponent(`Order from ${buyerName} - ${storeName}`);
      const body = encodeURIComponent(
        `Hi,\n\nPlease find my order attached.\n\nName: ${buyerName}\nEmail: ${buyerEmail}\n\nThank you`
      );
      mailtoLink.href = `mailto:${contact}?subject=${subject}&body=${body}`;
      mailtoLink.textContent = `Email your order to ${contact}`;
      mailtoSection.hidden = false;

      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    } catch (err) {
      console.error('[OrderSheet] PDF generation failed:', err);
      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    }
  }
}
```

- [ ] **Step 3: Update order-sheet.astro to pass new props**

```typescript
// src/pages/order-sheet.astro
---
import ContentPage from 'corner-store/layouts/ContentPage';
import { OrderSheet } from 'corner-store/components';
import { loadConfig, getOrderSheetListings, decimalToRawPrice, DEFAULT_CURRENCY } from 'corner-store';

const config = await loadConfig();
const listings = await getOrderSheetListings();
const minCartSizeRaw = config.minCartSize != null
  ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
  : null;
const checkoutEnabled = !!import.meta.env.STRIPE_SECRET_KEY;
---

<ContentPage title="Order Sheet" hasExplicitTitle>
  <OrderSheet
    storeName={config.name}
    contact={config.contact ?? ''}
    logo={config.logo}
    listings={listings}
    minCartSize={config.minCartSize}
    minCartSizeRaw={minCartSizeRaw}
    currency={DEFAULT_CURRENCY}
    wholesaleMargin={config.wholesaleMargin}
    checkoutEnabled={checkoutEnabled}
    shippingFlat={config.shippingFlat}
    shippingFreeThreshold={config.shippingFreeThreshold}
  />
</ContentPage>
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/OrderSheet/ src/pages/order-sheet.astro
git commit -m "feat(cart): progressive cart enhancement for order sheet with checkout and PDF fallback"
```

---

## Task 12: Manual integration test

This task verifies the full flow works end-to-end in the dev server.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test base behavior (no Stripe key)**

Without `STRIPE_SECRET_KEY` set:
1. Open order sheet page
2. Add quantities to products
3. Verify line totals and subtotal update
4. Verify MOQ validation works
5. Click "Submit Order" (should generate PDF since checkout is not enabled)
6. Verify PDF downloads and mailto link appears

- [ ] **Step 3: Test cart persistence**

1. Add quantities to products
2. Refresh the page
3. Verify quantities are restored from localStorage
4. Open a second tab to the same page
5. Change quantity in tab 1
6. Verify tab 2 updates

- [ ] **Step 4: Test checkout flow (with Stripe key)**

With `STRIPE_SECRET_KEY` set in `.env`:
1. Add quantities to products
2. Click "Submit Order"
3. Verify redirect to Stripe Checkout
4. Cancel at Stripe, verify return to `/cancel`

- [ ] **Step 5: Test fallback**

1. Stop the dev server briefly or set an invalid Stripe key
2. Click "Submit Order"
3. Verify error message appears with option to download PDF
4. Click "Download PDF" and verify it works
5. Click "Try Again" and verify it attempts checkout again

- [ ] **Step 6: Run CI suite**

Run: `npm run ci`
Expected: Typecheck, tests, and build all pass

---

## Task 13: Export cart module from package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add cart export to package.json**

Add to the `exports` field in `package.json`:

```json
"./cart": "./src/lib/cart/index.ts"
```

- [ ] **Step 2: Add validation export to package.json**

Add to the `exports` field in `package.json`:

```json
"./validation": "./src/lib/validation/index.ts"
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: export cart and validation modules from package"
```
