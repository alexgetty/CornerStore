import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCatalogProduct } from '../catalog/helpers.js';

vi.mock('stripe', () => {
  const MockStripe = vi.fn();
  return { default: MockStripe };
});

// Helper to create async iterable (for Stripe auto-pagination)
function makeAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('readStripeState', () => {
  let readStripeState: typeof import('../../../src/lib/stripe/sync.js').readStripeState;
  let productsListMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsListMock = vi.fn();
    Stripe.mockImplementation(() => ({
      products: { list: productsListMock },
    }) as unknown as InstanceType<typeof Stripe>);
    ({ readStripeState } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('returns empty map when no products have sku metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{ id: 'prod_1', name: 'No SKU', metadata: {}, default_price: null }])
    );
    const { state } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('maps products by SKU from metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: 'A widget',
        metadata: { sku: 'WIDGET-001', payment_link_id: 'plink_1', payment_link_url: 'https://buy.stripe.com/test' },
        default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
      }])
    );
    const { state } = await readStripeState(stripe as any);
    expect(state.size).toBe(1);
    expect(state.get('WIDGET-001')).toEqual({
      productId: 'prod_1',
      name: 'Widget',
      description: 'A widget',
      priceId: 'price_1',
      unitAmount: 1999,
      currency: 'usd',
      paymentLinkId: 'plink_1',
      paymentLinkUrl: 'https://buy.stripe.com/test',
    });
  });

  it('skips products without a default price (tracked as incomplete)', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: null,
      }])
    );
    const { state, incompleteSkus } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
    expect(incompleteSkus.get('W')).toBe('prod_1');
  });

  it('skips products where default_price is a string (tracked as incomplete)', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: 'price_123',
      }])
    );
    const { state, incompleteSkus } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
    expect(incompleteSkus.get('W')).toBe('prod_1');
  });

  it('handles missing payment link metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: 500, currency: 'usd' },
      }])
    );
    const { state } = await readStripeState(stripe as any);
    const entry = state.get('W')!;
    expect(entry.paymentLinkId).toBeNull();
    expect(entry.paymentLinkUrl).toBeNull();
  });

  it('defaults unitAmount to 0 when unit_amount is null', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: null, currency: 'usd' },
      }])
    );
    const { state } = await readStripeState(stripe as any);
    const entry = state.get('W')!;
    expect(entry.unitAmount).toBe(0);
  });

  it('returns empty map when Stripe has no active products', async () => {
    productsListMock.mockReturnValue(makeAsyncIterable([]));
    const { state } = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('normalizes empty description to null', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1',
        name: 'Widget',
        description: '',
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
      }])
    );
    const { state } = await readStripeState(stripe as any);
    expect(state.get('W')!.description).toBeNull();
  });

  it('tracks products with SKU but no default_price as incomplete', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([
        {
          id: 'prod_orphan', name: 'Incomplete', description: null,
          metadata: { sku: 'BROKEN-001' }, default_price: null,
        },
        {
          id: 'prod_ok', name: 'Complete', description: null,
          metadata: { sku: 'OK-001' },
          default_price: { id: 'price_1', unit_amount: 1999, currency: 'usd' },
        },
      ])
    );
    const result = await readStripeState(stripe as any);
    expect(result.state.size).toBe(1);
    expect(result.state.has('OK-001')).toBe(true);
    expect(result.incompleteSkus.size).toBe(1);
    expect(result.incompleteSkus.get('BROKEN-001')).toBe('prod_orphan');
  });

  it('retries on transient error during product listing', async () => {
    vi.useFakeTimers();

    productsListMock
      .mockImplementationOnce(() => { throw new Error('network blip'); })
      .mockReturnValueOnce(
        makeAsyncIterable([{
          id: 'prod_1',
          name: 'Widget',
          description: null,
          metadata: { sku: 'W' },
          default_price: { id: 'price_1', unit_amount: 999, currency: 'usd' },
        }])
      );

    const promise = readStripeState(stripe as any);
    await vi.advanceTimersByTimeAsync(500);
    const { state } = await promise;

    expect(productsListMock).toHaveBeenCalledTimes(2);
    expect(state.size).toBe(1);
    expect(state.get('W')).toEqual({
      productId: 'prod_1',
      name: 'Widget',
      description: null,
      priceId: 'price_1',
      unitAmount: 999,
      currency: 'usd',
      paymentLinkId: null,
      paymentLinkUrl: null,
    });

    vi.useRealTimers();
  });
});

describe('catalogDiff', () => {
  let catalogDiff: typeof import('../../../src/lib/stripe/sync.js').catalogDiff;

  beforeEach(async () => {
    vi.resetModules();
    ({ catalogDiff } = await import('../../../src/lib/stripe/sync.js'));
  });

  it('identifies new products not in Stripe', () => {
    const catalog = [makeCatalogProduct({ sku: 'NEW-001' })];
    const stripeState = new Map();
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]!.sku).toBe('NEW-001');
    expect(result.toUpdate).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  it('identifies products needing name update', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', name: 'New Name' })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Old Name',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('name');
    expect(result.toAdd).toHaveLength(0);
  });

  it('identifies products needing price update', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', price: 29.99 })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('price');
  });

  it('identifies orphaned Stripe products', () => {
    const catalog: ReturnType<typeof makeCatalogProduct>[] = [];
    const orphanState = {
      productId: 'prod_old',
      name: 'Discontinued',
      description: null,
      priceId: 'price_old',
      unitAmount: 500,
      currency: 'usd',
      paymentLinkId: null,
      paymentLinkUrl: null,
    };
    const stripeState = new Map([['OLD-001', orphanState]]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]!.sku).toBe('OLD-001');
    expect(result.orphaned[0]!.state).toBe(orphanState);
  });

  it('reports no changes when in sync', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: 'plink_1',
        paymentLinkUrl: 'https://buy.stripe.com/test',
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  it('identifies products needing description update', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', description: 'New desc' })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: 'Old desc',
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('description');
  });

  it('detects storefront-added when product is storefront but has no payment link', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', storefront: true, name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('storefront-added');
  });

  it('detects storefront-removed when product is not storefront but has payment link', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', storefront: false, name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: 'plink_1',
        paymentLinkUrl: 'https://buy.stripe.com/test',
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('storefront-removed');
  });

  it('does not flag storefront change when storefront product already has payment link', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', storefront: true, name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: 'plink_1',
        paymentLinkUrl: 'https://buy.stripe.com/test',
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(0);
  });

  it('does not flag storefront change when non-storefront product has no payment link', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', storefront: false, name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(0);
  });

  it('detects currency mismatch between Stripe and sync currency', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'gbp',
        paymentLinkId: null,
        paymentLinkUrl: null,
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.changes).toContain('currency');
  });

  it('does not flag currency when Stripe currency matches sync currency', () => {
    const catalog = [makeCatalogProduct({ sku: 'TEST-001', name: 'Test Product', price: 19.99, description: null })];
    const stripeState = new Map([
      ['TEST-001', {
        productId: 'prod_1',
        name: 'Test Product',
        description: null,
        priceId: 'price_1',
        unitAmount: 1999,
        currency: 'usd',
        paymentLinkId: 'plink_1',
        paymentLinkUrl: 'https://buy.stripe.com/test',
      }],
    ]);
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toUpdate).toHaveLength(0);
  });

  it('includes non-storefront products in diff', () => {
    const catalog = [
      makeCatalogProduct({ sku: 'STORE-001', storefront: true }),
      makeCatalogProduct({ sku: 'WHOLESALE-001', storefront: false }),
    ];
    const stripeState = new Map();
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(2);
    expect(result.toAdd.map((e) => e.sku)).toContain('STORE-001');
    expect(result.toAdd.map((e) => e.sku)).toContain('WHOLESALE-001');
  });
});

describe('catalogAdd', () => {
  let catalogAdd: typeof import('../../../src/lib/stripe/sync.js').catalogAdd;
  let productsCreateMock: ReturnType<typeof vi.fn>;
  let productsUpdateMock: ReturnType<typeof vi.fn>;
  let pricesCreateMock: ReturnType<typeof vi.fn>;
  let paymentLinksCreateMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsCreateMock = vi.fn();
    productsUpdateMock = vi.fn();
    pricesCreateMock = vi.fn();
    paymentLinksCreateMock = vi.fn();
    Stripe.mockImplementation(() => ({
      products: { create: productsCreateMock, update: productsUpdateMock },
      prices: { create: pricesCreateMock },
      paymentLinks: { create: paymentLinksCreateMock },
    }) as unknown as InstanceType<typeof Stripe>);
    ({ catalogAdd } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('creates Product, Price, and Payment Link for new products', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'NEW-001', product: makeCatalogProduct({ sku: 'NEW-001' }) }];
    const result = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsCreateMock).toHaveBeenCalledTimes(1);
    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(result.links.get('NEW-001')).toBe('https://buy.stripe.com/test');
    expect(result.errors).toHaveLength(0);
  });

  it('stores payment link metadata as partial keys on product update', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'NEW-001', product: makeCatalogProduct({ sku: 'NEW-001' }) }];
    await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({
      'metadata[sku]': 'NEW-001',
      'metadata[payment_link_id]': 'plink_1',
      'metadata[payment_link_url]': 'https://buy.stripe.com/test',
      default_price: 'price_1',
    }));
    // Must NOT have a nested metadata object
    const callArgs = productsUpdateMock.mock.calls[0]![1];
    expect(callArgs).not.toHaveProperty('metadata');
  });

  it('returns empty links and no errors when nothing to add', async () => {
    const result = await catalogAdd(stripe as any, [], 'usd');
    expect(result.links.size).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(productsCreateMock).not.toHaveBeenCalled();
  });

  it('skips Payment Link creation for non-storefront products', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{
      sku: 'BULK-001',
      product: makeCatalogProduct({ sku: 'BULK-001', storefront: false }),
    }];
    const result = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsCreateMock).toHaveBeenCalledTimes(1);
    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(result.links.size).toBe(0);
  });

  it('reuses existing incomplete product instead of creating new one', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'RESUME-001', product: makeCatalogProduct({ sku: 'RESUME-001' }) }];
    const incompleteSkus = new Map([['RESUME-001', 'prod_existing']]);

    const result = await catalogAdd(stripe as any, toAdd, 'usd', incompleteSkus);

    expect(productsCreateMock).not.toHaveBeenCalled();
    expect(pricesCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      product: 'prod_existing',
    }));
    expect(result.links.get('RESUME-001')).toBe('https://buy.stripe.com/test');
  });

  it('logs error context with SKU and collects error when creation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    productsCreateMock.mockRejectedValueOnce(new Error('Stripe API down'));

    const toAdd = [{ sku: 'FAIL-001', product: makeCatalogProduct({ sku: 'FAIL-001' }) }];

    // Override withRetry to be pass-through (no delays) so the rejection propagates cleanly
    vi.doMock('../../../src/lib/stripe/retry.js', () => ({
      withRetry: (fn: () => Promise<unknown>) => fn(),
    }));
    vi.resetModules();
    const { catalogAdd: fastCatalogAdd } = await import('../../../src/lib/stripe/sync.js');

    const result = await fastCatalogAdd(stripe as any, toAdd, 'usd');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sku).toBe('FAIL-001');
    expect(result.errors[0]!.error).toBeInstanceOf(Error);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL-001'));

    consoleSpy.mockRestore();
  });

  it('logs non-Error throwables as string and collects error when creation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    productsCreateMock.mockRejectedValueOnce('plain string error');

    const toAdd = [{ sku: 'FAIL-002', product: makeCatalogProduct({ sku: 'FAIL-002' }) }];

    vi.doMock('../../../src/lib/stripe/retry.js', () => ({
      withRetry: (fn: () => Promise<unknown>) => fn(),
    }));
    vi.resetModules();
    const { catalogAdd: fastCatalogAdd } = await import('../../../src/lib/stripe/sync.js');

    const result = await fastCatalogAdd(stripe as any, toAdd, 'usd');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sku).toBe('FAIL-002');
    expect(result.errors[0]!.error).toBe('plain string error');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FAIL-002'));

    consoleSpy.mockRestore();
  });

  it('continues processing remaining entries after one fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // First entry succeeds
    productsCreateMock
      .mockResolvedValueOnce({ id: 'prod_1' })
      // Second entry fails
      .mockRejectedValueOnce(new Error('boom'))
      // Third entry succeeds
      .mockResolvedValueOnce({ id: 'prod_3' });
    pricesCreateMock
      .mockResolvedValueOnce({ id: 'price_1' })
      .mockResolvedValueOnce({ id: 'price_3' });
    paymentLinksCreateMock
      .mockResolvedValueOnce({ id: 'plink_1', url: 'https://buy.stripe.com/1' })
      .mockResolvedValueOnce({ id: 'plink_3', url: 'https://buy.stripe.com/3' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [
      { sku: 'OK-001', product: makeCatalogProduct({ sku: 'OK-001' }) },
      { sku: 'FAIL-002', product: makeCatalogProduct({ sku: 'FAIL-002' }) },
      { sku: 'OK-003', product: makeCatalogProduct({ sku: 'OK-003' }) },
    ];

    const result = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(result.links.get('OK-001')).toBe('https://buy.stripe.com/1');
    expect(result.links.get('OK-003')).toBe('https://buy.stripe.com/3');
    expect(result.links.size).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sku).toBe('FAIL-002');
    // Third entry was still attempted
    expect(productsCreateMock).toHaveBeenCalledTimes(3);

    consoleSpy.mockRestore();
  });

  it('uses partial metadata keys instead of nested metadata object', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'META-001', product: makeCatalogProduct({ sku: 'META-001' }) }];
    await catalogAdd(stripe as any, toAdd, 'usd');

    const updateCall = productsUpdateMock.mock.calls[0]![1];
    expect(updateCall['metadata[sku]']).toBe('META-001');
    expect(updateCall).not.toHaveProperty('metadata');
  });

  it('uses partial metadata keys for non-storefront products too', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'BULK-002', product: makeCatalogProduct({ sku: 'BULK-002', storefront: false }) }];
    await catalogAdd(stripe as any, toAdd, 'usd');

    const updateCall = productsUpdateMock.mock.calls[0]![1];
    expect(updateCall['metadata[sku]']).toBe('BULK-002');
    expect(updateCall).not.toHaveProperty('metadata');
    expect(updateCall).not.toHaveProperty('metadata[payment_link_id]');
    expect(updateCall).not.toHaveProperty('metadata[payment_link_url]');
  });
});

describe('catalogUpdate', () => {
  let catalogUpdate: typeof import('../../../src/lib/stripe/sync.js').catalogUpdate;
  let productsUpdateMock: ReturnType<typeof vi.fn>;
  let pricesCreateMock: ReturnType<typeof vi.fn>;
  let pricesUpdateMock: ReturnType<typeof vi.fn>;
  let paymentLinksCreateMock: ReturnType<typeof vi.fn>;
  let paymentLinksUpdateMock: ReturnType<typeof vi.fn>;
  let stripe: unknown;

  function makeExistingState(overrides: Partial<import('../../../src/lib/stripe/sync.js').StripeProductState> = {}): import('../../../src/lib/stripe/sync.js').StripeProductState {
    return {
      productId: 'prod_1',
      name: 'Old Name',
      description: null,
      priceId: 'price_1',
      unitAmount: 1999,
      currency: 'usd',
      paymentLinkId: 'plink_1',
      paymentLinkUrl: 'https://buy.stripe.com/old',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    const Stripe = vi.mocked((await import('stripe')).default);
    productsUpdateMock = vi.fn().mockResolvedValue({});
    pricesCreateMock = vi.fn();
    pricesUpdateMock = vi.fn().mockResolvedValue({});
    paymentLinksCreateMock = vi.fn();
    paymentLinksUpdateMock = vi.fn().mockResolvedValue({});
    Stripe.mockImplementation(() => ({
      products: { update: productsUpdateMock },
      prices: { create: pricesCreateMock, update: pricesUpdateMock },
      paymentLinks: { create: paymentLinksCreateMock, update: paymentLinksUpdateMock },
    }) as unknown as InstanceType<typeof Stripe>);
    ({ catalogUpdate } = await import('../../../src/lib/stripe/sync.js'));
    stripe = new Stripe('sk_test');
  });

  it('updates product name without touching Payment Link', async () => {
    const existing = makeExistingState({ name: 'Old Name' });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ name: 'New Name', price: 19.99 }),
      existing,
      changes: ['name'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({ name: 'New Name' }));
    expect(pricesCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(result.links.size).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('recreates Price and Payment Link on price change', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });

    const existing = makeExistingState({ paymentLinkId: 'plink_old' });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksUpdateMock).toHaveBeenCalledWith('plink_old', { active: false });
    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(result.links.get('TEST-001')).toBe('https://buy.stripe.com/new');
  });

  it('handles price change when no existing Payment Link', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });

    const existing = makeExistingState({ paymentLinkId: null, paymentLinkUrl: null });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
  });

  it('updates description with empty string when product description is null', async () => {
    const existing = makeExistingState({ description: 'Old description' });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ description: null }),
      existing,
      changes: ['description'],
    }];

    await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({
      description: '',
    }));
  });

  it('deactivates old price when price changes', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });

    const existing = makeExistingState({ priceId: 'price_old' });
    const toUpdate = [{
      sku: 'TEST-001',
      product: makeCatalogProduct({ price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesUpdateMock).toHaveBeenCalledWith('price_old', { active: false });
  });

  it('returns empty links and no errors when nothing to update', async () => {
    const result = await catalogUpdate(stripe as any, [], 'usd');
    expect(result.links.size).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(productsUpdateMock).not.toHaveBeenCalled();
  });

  it('skips Payment Link recreation for non-storefront product on price change', async () => {
    pricesCreateMock.mockResolvedValue({ id: 'price_new' });

    const existing = makeExistingState({ paymentLinkId: null, paymentLinkUrl: null });
    const toUpdate = [{
      sku: 'BULK-001',
      product: makeCatalogProduct({ sku: 'BULK-001', storefront: false, price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(result.links.size).toBe(0);
  });

  it('continues processing remaining entries after one fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // First entry: price change, prices.create fails
    pricesCreateMock
      .mockRejectedValueOnce(new Error('rate limit'))
      // Second entry: price change, succeeds
      .mockResolvedValueOnce({ id: 'price_new_2' });
    paymentLinksCreateMock.mockResolvedValueOnce({ id: 'plink_new_2', url: 'https://buy.stripe.com/new2' });

    const toUpdate = [
      {
        sku: 'FAIL-001',
        product: makeCatalogProduct({ sku: 'FAIL-001', price: 29.99 }),
        existing: makeExistingState({ productId: 'prod_1', priceId: 'price_1' }),
        changes: ['price'],
      },
      {
        sku: 'OK-002',
        product: makeCatalogProduct({ sku: 'OK-002', price: 39.99 }),
        existing: makeExistingState({ productId: 'prod_2', priceId: 'price_2', paymentLinkId: 'plink_old_2' }),
        changes: ['price'],
      },
    ];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.sku).toBe('FAIL-001');
    expect(result.links.get('OK-002')).toBe('https://buy.stripe.com/new2');

    consoleSpy.mockRestore();
  });

  it('returns empty errors when all items succeed', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    productsUpdateMock.mockResolvedValue({});
    const toUpdate = [
      {
        sku: 'OK-001',
        product: makeCatalogProduct({ sku: 'OK-001', name: 'New Name' }),
        existing: makeExistingState({ productId: 'prod_1' }),
        changes: ['name'],
      },
    ];

    const result = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(result.errors).toHaveLength(0);
  });

  it('uses partial metadata keys on price change with storefront product', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    pricesCreateMock.mockResolvedValue({ id: 'price_new' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_new', url: 'https://buy.stripe.com/new' });

    const existing = makeExistingState({ paymentLinkId: 'plink_old' });
    const toUpdate = [{
      sku: 'META-001',
      product: makeCatalogProduct({ price: 29.99 }),
      existing,
      changes: ['price'],
    }];

    await catalogUpdate(stripe as any, toUpdate, 'usd');

    // The final products.update call should use partial metadata keys
    const lastUpdateCall = productsUpdateMock.mock.calls[productsUpdateMock.mock.calls.length - 1]!;
    const payload = lastUpdateCall[1];
    expect(payload['metadata[payment_link_id]']).toBe('plink_new');
    expect(payload['metadata[payment_link_url]']).toBe('https://buy.stripe.com/new');
    expect(payload['metadata[sku]']).toBe('META-001');
    expect(payload).not.toHaveProperty('metadata');
  });
});
