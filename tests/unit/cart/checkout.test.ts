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
    const body = { items: [{ sku: 'ABC-001', quantity: 2 }] };
    const result = parseCheckoutRequest(body);
    expect(result).toEqual({
      ok: true,
      items: [{ sku: 'ABC-001', quantity: 2 }],
    });
  });

  it('rejects missing items array', () => {
    const result = parseCheckoutRequest({});
    expect(result).toEqual({
      ok: false,
      error: 'Items array is required and must not be empty',
    });
  });

  it('rejects non-array items', () => {
    const result = parseCheckoutRequest({ items: 'not-an-array' });
    expect(result).toEqual({
      ok: false,
      error: 'Items array is required and must not be empty',
    });
  });

  it('rejects empty items array', () => {
    const result = parseCheckoutRequest({ items: [] });
    expect(result).toEqual({
      ok: false,
      error: 'Items array is required and must not be empty',
    });
  });

  it('rejects items with missing sku', () => {
    const result = parseCheckoutRequest({ items: [{ quantity: 1 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must have a sku string',
    });
  });

  it('rejects items with non-positive quantity', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 0 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must have a positive integer quantity',
    });
  });

  it('rejects items with non-integer quantity', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1.5 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must have a positive integer quantity',
    });
  });

  it('rejects null body', () => {
    const result = parseCheckoutRequest(null);
    expect(result).toEqual({
      ok: false,
      error: 'Invalid request body',
    });
  });

  it('rejects non-object body', () => {
    const result = parseCheckoutRequest('string');
    expect(result).toEqual({
      ok: false,
      error: 'Invalid request body',
    });
  });

  it('rejects item that is not an object', () => {
    const result = parseCheckoutRequest({ items: ['not-an-object'] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must be an object',
    });
  });

  it('rejects item with empty sku string', () => {
    const result = parseCheckoutRequest({ items: [{ sku: '', quantity: 1 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must have a sku string',
    });
  });

  it('rejects item with negative quantity', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: -1 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Each item must have a positive integer quantity',
    });
  });
});

describe('buildLineItems', () => {
  it('builds Stripe line items with wholesale margin applied', () => {
    const catalog = [makeProduct({ sku: 'W-001', name: 'Widget', price: 10.00 })];
    const items = [{ sku: 'W-001', quantity: 3 }];
    const result = buildLineItems(items, catalog, 0.5);

    expect(result).toEqual({
      ok: true,
      lineItems: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Widget' },
            unit_amount: 500,
          },
          quantity: 3,
        },
      ],
    });
  });

  it('uses full price when no wholesale margin', () => {
    const catalog = [makeProduct({ sku: 'W-001', name: 'Widget', price: 10.00 })];
    const items = [{ sku: 'W-001', quantity: 2 }];
    const result = buildLineItems(items, catalog, undefined);

    expect(result).toEqual({
      ok: true,
      lineItems: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Widget' },
            unit_amount: 1000,
          },
          quantity: 2,
        },
      ],
    });
  });

  it('rejects unknown SKU', () => {
    const catalog = [makeProduct({ sku: 'KNOWN' })];
    const items = [{ sku: 'UNKNOWN', quantity: 1 }];
    const result = buildLineItems(items, catalog, undefined);

    expect(result).toEqual({
      ok: false,
      error: 'Unknown SKU: UNKNOWN',
    });
  });

  it('rejects quantity below MOQ', () => {
    const catalog = [makeProduct({ sku: 'MOQ-001', moq: 6 })];
    const items = [{ sku: 'MOQ-001', quantity: 3 }];
    const result = buildLineItems(items, catalog, undefined);

    expect(result).toEqual({
      ok: false,
      error: 'MOQ-001: minimum order quantity is 6',
    });
  });

  it('validates minimum cart size when provided and too low', () => {
    const catalog = [makeProduct({ sku: 'W-001', price: 10.00 })];
    const items = [{ sku: 'W-001', quantity: 1 }];
    // subtotal = 1000 (10.00 * 100 cents), minCartSizeRaw = 5000
    const result = buildLineItems(items, catalog, undefined, 5000);

    expect(result).toEqual({
      ok: false,
      error: 'Minimum order total not met',
    });
  });

  it('passes minimum cart size when met', () => {
    const catalog = [makeProduct({ sku: 'W-001', name: 'Widget', price: 10.00 })];
    const items = [{ sku: 'W-001', quantity: 5 }];
    // subtotal = 5000 (10.00 * 100 * 5), minCartSizeRaw = 5000
    const result = buildLineItems(items, catalog, undefined, 5000);

    expect(result).toEqual({
      ok: true,
      lineItems: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Widget' },
            unit_amount: 1000,
          },
          quantity: 5,
        },
      ],
    });
  });

  it('builds multiple line items', () => {
    const catalog = [
      makeProduct({ sku: 'A', name: 'Alpha', price: 5.00 }),
      makeProduct({ sku: 'B', name: 'Beta', price: 15.00 }),
    ];
    const items = [
      { sku: 'A', quantity: 2 },
      { sku: 'B', quantity: 1 },
    ];
    const result = buildLineItems(items, catalog, undefined);

    expect(result).toEqual({
      ok: true,
      lineItems: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Alpha' },
            unit_amount: 500,
          },
          quantity: 2,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Beta' },
            unit_amount: 1500,
          },
          quantity: 1,
        },
      ],
    });
  });
});
