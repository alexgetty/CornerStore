import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('returns empty map when Stripe has no active products', async () => {
    productsListMock.mockReturnValue(makeAsyncIterable([]));
    const state = await readStripeState(stripe as any);
    expect(state.size).toBe(0);
  });
});
