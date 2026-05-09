import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCheckoutRequest, buildLineItems } from '../../../src/lib/cart/checkout.js';
import { createCheckoutHandler } from '../../../src/lib/cart/handler.js';
import type { CatalogProduct } from '../../../src/lib/catalog/types.js';

vi.mock('stripe', () => {
  const mockCreate = vi.fn();
  const MockStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockCreate } },
  }));
  (MockStripe as any).__mockCreate = mockCreate;
  return { default: MockStripe };
});

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
    hidden: false,
    description: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
}

describe('parseCheckoutRequest', () => {
  it('parses valid request body', () => {
    const body = { items: [{ sku: 'ABC-001', quantity: 2 }], attemptId: 'attempt-abc-123' };
    const result = parseCheckoutRequest(body);
    expect(result).toEqual({
      ok: true,
      items: [{ sku: 'ABC-001', quantity: 2 }],
      attemptId: 'attempt-abc-123',
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

  it('accepts quantity equal to MAX_QUANTITY', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 10_000 }], attemptId: 'a1' });
    expect(result).toEqual({
      ok: true,
      items: [{ sku: 'A', quantity: 10_000 }],
      attemptId: 'a1',
    });
  });

  it('rejects missing attemptId', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1 }] });
    expect(result).toEqual({
      ok: false,
      error: 'attemptId is required',
    });
  });

  it('rejects non-string attemptId', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1 }], attemptId: 123 });
    expect(result).toEqual({
      ok: false,
      error: 'attemptId is required',
    });
  });

  it('rejects empty attemptId', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1 }], attemptId: '' });
    expect(result).toEqual({
      ok: false,
      error: 'attemptId is required',
    });
  });

  it('rejects attemptId longer than 128 characters', () => {
    const longId = 'x'.repeat(129);
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1 }], attemptId: longId });
    expect(result).toEqual({
      ok: false,
      error: 'attemptId exceeds maximum length',
    });
  });

  it('accepts attemptId at the 128-character boundary', () => {
    const id = 'x'.repeat(128);
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 1 }], attemptId: id });
    expect(result).toEqual({
      ok: true,
      items: [{ sku: 'A', quantity: 1 }],
      attemptId: id,
    });
  });

  it('rejects quantity above MAX_QUANTITY', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: 10_001 }] });
    expect(result).toEqual({
      ok: false,
      error: 'Quantity 10001 exceeds maximum of 10000',
    });
  });

  it('rejects extreme quantity values (Number.MAX_SAFE_INTEGER)', () => {
    const result = parseCheckoutRequest({ items: [{ sku: 'A', quantity: Number.MAX_SAFE_INTEGER }] });
    expect(result.ok).toBe(false);
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
      error: '$50.00 minimum, $40.00 to go',
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

  it('rejects SKU with hidden: true', () => {
    const catalog = [makeProduct({ sku: 'HIDDEN-001', hidden: true })];
    const items = [{ sku: 'HIDDEN-001', quantity: 1 }];
    const result = buildLineItems(items, catalog, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unavailable SKU/);
      expect(result.error).toContain('HIDDEN-001');
    }
  });

  it('rejects SKU with truthy status', () => {
    const catalog = [makeProduct({ sku: 'SOLD-001', status: 'sold out' })];
    const items = [{ sku: 'SOLD-001', quantity: 1 }];
    const result = buildLineItems(items, catalog, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unavailable SKU/);
      expect(result.error).toContain('SOLD-001');
      expect(result.error).toContain('sold out');
    }
  });

  it('hidden error names the SKU and status error names SKU plus status text', () => {
    const catalogHidden = [makeProduct({ sku: 'H-1', hidden: true })];
    const hiddenResult = buildLineItems([{ sku: 'H-1', quantity: 1 }], catalogHidden, undefined);
    expect(hiddenResult).toEqual({ ok: false, error: 'Unavailable SKU: H-1' });

    const catalogStatus = [makeProduct({ sku: 'S-1', status: 'discontinued' })];
    const statusResult = buildLineItems([{ sku: 'S-1', quantity: 1 }], catalogStatus, undefined);
    expect(statusResult).toEqual({ ok: false, error: 'Unavailable SKU: S-1 (discontinued)' });
  });

  it('mixed request rejects with the hidden SKU named, in iteration order', () => {
    const catalog = [
      makeProduct({ sku: 'GOOD-001', name: 'Good', price: 10.00 }),
      makeProduct({ sku: 'BAD-001', name: 'Bad', price: 10.00, hidden: true }),
    ];
    const items = [
      { sku: 'GOOD-001', quantity: 1 },
      { sku: 'BAD-001', quantity: 1 },
    ];
    const result = buildLineItems(items, catalog, undefined);

    expect(result).toEqual({ ok: false, error: 'Unavailable SKU: BAD-001' });
  });
});

describe('createCheckoutHandler', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  let mockLoadCatalog: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const Stripe = await import('stripe');
    mockCreate = (Stripe.default as any).__mockCreate;
    mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });

    (Stripe.default as any).mockImplementation(() => ({
      checkout: { sessions: { create: mockCreate } },
    }));

    const catalogCsv = await import('../../../src/lib/catalog/csv.js');
    mockLoadCatalog = catalogCsv.loadCatalog as ReturnType<typeof vi.fn>;
    // Default: the WIDGET-001 product is available in the catalog so existing tests still pass.
    mockLoadCatalog.mockResolvedValue([makeProduct({ sku: 'WIDGET-001', name: 'Widget', price: 20.00 })]);
  });

  it('returns checkout URL on success', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123', wholesaleMargin: 0.5 });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 2 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ url: 'https://checkout.stripe.com/session_abc' });
  });

  it('returns 400 for invalid request body', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(null, 'https://mystore.com');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 when attemptId is missing from the request body', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }] },
      'https://mystore.com',
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'attemptId is required' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown SKU', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'NOPE', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unknown SKU: NOPE' });
  });

  it('applies wholesale margin to unit amount', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123', wholesaleMargin: 0.5 });
    await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    // Stripe unitAmount = 2000, margin 0.5 => 1000
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(1000);
  });

  it('sets success and cancel URLs from origin', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://example.com',
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.success_url).toBe('https://example.com/success');
    expect(callArgs.cancel_url).toBe('https://example.com/cancel');
  });

  it('returns 500 when Stripe session creation throws', async () => {
    mockCreate.mockRejectedValue(new Error('Stripe is down'));

    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Stripe is down' });
  });

  it('rejects a SKU that is hidden in the catalog even if it exists in Stripe', async () => {
    mockLoadCatalog.mockResolvedValue([
      makeProduct({ sku: 'WIDGET-001', name: 'Widget', price: 20.00, hidden: true }),
    ]);

    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Unavailable SKU/);
    expect(body.error).toContain('WIDGET-001');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a SKU with a status even if it exists in Stripe', async () => {
    mockLoadCatalog.mockResolvedValue([
      makeProduct({ sku: 'WIDGET-001', name: 'Widget', price: 20.00, status: 'sold out' }),
    ]);

    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Unavailable SKU/);
    expect(body.error).toContain('WIDGET-001');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('uses the same idempotency key when the same attemptId is replayed (genuine retry)', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://mystore.com');
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://mystore.com');

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const firstKey = mockCreate.mock.calls[0][1].idempotencyKey;
    const secondKey = mockCreate.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it('uses different idempotency keys for two buyers with identical carts (different attemptIds)', async () => {
    // Regression test for the collision bug where the idempotency key was
    // derived from items + origin + a 60-second time bucket, so two real
    // buyers ordering the same items in the same minute shared a session.
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'buyer-1' }, 'https://mystore.com');
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'buyer-2' }, 'https://mystore.com');

    const firstKey = mockCreate.mock.calls[0][1].idempotencyKey;
    const secondKey = mockCreate.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
  });

  it('idempotency key does not depend on wall-clock time', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://mystore.com');
      dateSpy.mockReturnValue(1_700_000_300_000); // 5 minutes later
      await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://mystore.com');

      const firstKey = mockCreate.mock.calls[0][1].idempotencyKey;
      const secondKey = mockCreate.mock.calls[1][1].idempotencyKey;
      expect(secondKey).toBe(firstKey);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('idempotency key does not depend on origin', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://store-a.com');
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'attempt-A' }, 'https://store-b.com');

    const firstKey = mockCreate.mock.calls[0][1].idempotencyKey;
    const secondKey = mockCreate.mock.calls[1][1].idempotencyKey;
    expect(secondKey).toBe(firstKey);
  });

  it('reads the catalog from disk on every request (no caching)', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' }, 'https://mystore.com');
    await handler({ items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a2' }, 'https://mystore.com');

    expect(mockLoadCatalog).toHaveBeenCalledTimes(2);
  });

  it('reflects a catalog mutation between requests without restart', async () => {
    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });

    // First request: SKU is available, checkout succeeds.
    const first = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );
    expect(first.status).toBe(200);

    // Operator hides the SKU on disk (simulated by changing the next loadCatalog return).
    mockLoadCatalog.mockResolvedValueOnce([
      makeProduct({ sku: 'WIDGET-001', name: 'Widget', price: 20.00, hidden: true }),
    ]);

    // Second request to the SAME handler instance must reflect the change.
    const second = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a2' },
      'https://mystore.com',
    );
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toMatch(/Unavailable SKU/);
    expect(body.error).toContain('WIDGET-001');
  });

  it('returns 500 when loadCatalog throws (catalog validation failure)', async () => {
    mockLoadCatalog.mockRejectedValue(new Error('Catalog validation failed (1 issue): Row 2, SKU: required'));

    const handler = createCheckoutHandler({ stripeKey: 'sk_test_123' });
    const response = await handler(
      { items: [{ sku: 'WIDGET-001', quantity: 1 }], attemptId: 'a1' },
      'https://mystore.com',
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('Catalog validation failed');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
