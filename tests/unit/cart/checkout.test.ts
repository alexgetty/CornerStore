import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCheckoutRequest, buildLineItems, createCheckoutHandler } from '../../../src/lib/cart/checkout.js';
import type { CatalogProduct } from '../../../src/lib/catalog/types.js';

vi.mock('stripe', () => {
  const mockCreate = vi.fn();
  const MockStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockCreate } },
  }));
  (MockStripe as any).__mockCreate = mockCreate;
  return { default: MockStripe };
});

vi.mock('../../../src/lib/storefront/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/csv.js', () => ({
  loadCatalog: vi.fn(),
}));

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
      subtotal: 1500,
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
      subtotal: 2000,
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
      subtotal: 5000,
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
      subtotal: 2500,
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

describe('createCheckoutHandler', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockLoadConfig: ReturnType<typeof vi.fn>;
  let mockLoadCatalog: ReturnType<typeof vi.fn>;

  const defaultCatalog: CatalogProduct[] = [
    {
      sku: 'WIDGET-001',
      name: 'Widget',
      price: 20.00,
      category: null,
      status: null,
      storefront: true,
      orderSheet: true,
      description: null,
      paymentLink: null,
      moq: null,
    },
  ];

  const defaultConfig = {
    name: 'Test Store',
    home: 'home',
    nav: [],
    footerNav: [],
    wholesaleMargin: 0.5,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const Stripe = await import('stripe');
    mockCreate = (Stripe.default as any).__mockCreate;

    const configMod = await import('../../../src/lib/storefront/config.js');
    mockLoadConfig = configMod.loadConfig as ReturnType<typeof vi.fn>;

    const catalogMod = await import('../../../src/lib/catalog/csv.js');
    mockLoadCatalog = catalogMod.loadCatalog as ReturnType<typeof vi.fn>;

    mockLoadConfig.mockResolvedValue(defaultConfig);
    mockLoadCatalog.mockResolvedValue(defaultCatalog);
    mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });
  });

  it('returns checkout URL on success', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 2 }] },
      'https://mystore.com',
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ url: 'https://checkout.stripe.com/session_abc' });
  });

  it('returns 400 for invalid request body', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const response = await handler(null, 'https://mystore.com');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 for unknown SKU', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    const response = await handler(
      { items: [{ sku: 'NOPE', quantity: 1 }] },
      'https://mystore.com',
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unknown SKU: NOPE' });
  });

  it('passes wholesale margin to line items', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
      'https://mystore.com',
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    // price = 20.00 = 2000 raw, margin 0.5 => unit_amount = 1000
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(1000);
  });

  it('sets success and cancel URLs from origin', async () => {
    const handler = createCheckoutHandler('sk_test_123');
    await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
      'https://example.com',
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.success_url).toBe('https://example.com/success');
    expect(callArgs.cancel_url).toBe('https://example.com/cancel');
  });

  it('returns 500 when Stripe throws', async () => {
    mockCreate.mockRejectedValue(new Error('Stripe is down'));

    const handler = createCheckoutHandler('sk_test_123');
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
      'https://mystore.com',
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Stripe is down' });
  });
});
