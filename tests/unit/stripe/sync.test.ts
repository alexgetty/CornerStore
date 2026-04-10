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
    const state = await readStripeState(stripe as any);
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
    const state = await readStripeState(stripe as any);
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

  it('skips products without a default price', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: null,
      }])
    );
    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('skips products where default_price is a string (not expanded)', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' }, default_price: 'price_123',
      }])
    );
    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });

  it('handles missing payment link metadata', async () => {
    productsListMock.mockReturnValue(
      makeAsyncIterable([{
        id: 'prod_1', name: 'Widget', description: null,
        metadata: { sku: 'W' },
        default_price: { id: 'price_1', unit_amount: 500, currency: 'usd' },
      }])
    );
    const state = await readStripeState(stripe as any);
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
    const state = await readStripeState(stripe as any);
    const entry = state.get('W')!;
    expect(entry.unitAmount).toBe(0);
  });

  it('returns empty map when Stripe has no active products', async () => {
    productsListMock.mockReturnValue(makeAsyncIterable([]));
    const state = await readStripeState(stripe as any);
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
    const state = await readStripeState(stripe as any);
    expect(state.get('W')!.description).toBeNull();
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
        paymentLinkId: null,
        paymentLinkUrl: null,
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

  it('only diffs storefront products (storefront: false skipped)', () => {
    const catalog = [
      makeCatalogProduct({ sku: 'STORE-001', storefront: true }),
      makeCatalogProduct({ sku: 'WHOLESALE-001', storefront: false }),
    ];
    const stripeState = new Map();
    const result = catalogDiff(catalog, stripeState, 'usd');
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]!.sku).toBe('STORE-001');
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
    const links = await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsCreateMock).toHaveBeenCalledTimes(1);
    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(links.get('NEW-001')).toBe('https://buy.stripe.com/test');
  });

  it('stores payment link ID and URL in product metadata', async () => {
    productsCreateMock.mockResolvedValue({ id: 'prod_1' });
    pricesCreateMock.mockResolvedValue({ id: 'price_1' });
    paymentLinksCreateMock.mockResolvedValue({ id: 'plink_1', url: 'https://buy.stripe.com/test' });
    productsUpdateMock.mockResolvedValue({});

    const toAdd = [{ sku: 'NEW-001', product: makeCatalogProduct({ sku: 'NEW-001' }) }];
    await catalogAdd(stripe as any, toAdd, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({
      metadata: expect.objectContaining({
        sku: 'NEW-001',
        payment_link_id: 'plink_1',
        payment_link_url: 'https://buy.stripe.com/test',
      }),
      default_price: 'price_1',
    }));
  });

  it('returns empty map when nothing to add', async () => {
    const links = await catalogAdd(stripe as any, [], 'usd');
    expect(links.size).toBe(0);
    expect(productsCreateMock).not.toHaveBeenCalled();
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

    const links = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(productsUpdateMock).toHaveBeenCalledWith('prod_1', expect.objectContaining({ name: 'New Name' }));
    expect(pricesCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksCreateMock).not.toHaveBeenCalled();
    expect(paymentLinksUpdateMock).not.toHaveBeenCalled();
    expect(links.size).toBe(0);
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

    const links = await catalogUpdate(stripe as any, toUpdate, 'usd');

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentLinksUpdateMock).toHaveBeenCalledWith('plink_old', { active: false });
    expect(paymentLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(links.get('TEST-001')).toBe('https://buy.stripe.com/new');
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

  it('returns empty map when nothing to update', async () => {
    const links = await catalogUpdate(stripe as any, [], 'usd');
    expect(links.size).toBe(0);
    expect(productsUpdateMock).not.toHaveBeenCalled();
  });
});
