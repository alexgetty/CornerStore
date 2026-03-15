import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

vi.mock('stripe', () => {
  const MockStripe = vi.fn();
  return { default: MockStripe };
});

function makeAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function makeThrowingAsyncIterable(error: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      throw error;
    },
  };
}

function makeStripeError(type: string, message: string): Error & { type: string } {
  const err = new Error(message) as Error & { type: string };
  err.type = type;
  return err;
}

async function getStripeMock() {
  const StripeConstructor = vi.mocked((await import('stripe')).default);
  const paymentLinksListMock = vi.fn();
  const listLineItemsMock = vi.fn();
  StripeConstructor.mockImplementation(
    () =>
      ({
        paymentLinks: {
          list: paymentLinksListMock,
          listLineItems: listLineItemsMock,
        },
      }) as unknown as InstanceType<typeof StripeConstructor>
  );
  return { StripeConstructor, paymentLinksListMock, listLineItemsMock };
}

describe('listActivePaymentLinks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns all active payment links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        { id: 'plink_1', url: 'https://buy.stripe.com/1' },
        { id: 'plink_2', url: 'https://buy.stripe.com/2' },
      ])
    );

    const { listActivePaymentLinks } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();
    const links = await listActivePaymentLinks(stripe);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ id: 'plink_1', url: 'https://buy.stripe.com/1' });
    expect(links[1]).toEqual({ id: 'plink_2', url: 'https://buy.stripe.com/2' });
  });

  it('passes active: true to paymentLinks.list', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable([]));

    const { listActivePaymentLinks } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();
    await listActivePaymentLinks(stripe);

    expect(mocks.paymentLinksListMock).toHaveBeenCalledWith({ active: true });
  });

  it('returns empty array when no links exist', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable([]));

    const { listActivePaymentLinks } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();
    const links = await listActivePaymentLinks(stripe);

    expect(links).toEqual([]);
  });

  it('wraps StripeAuthenticationError into StripeSetupError', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const stripeErr = makeStripeError('StripeAuthenticationError', 'bad key');
    mocks.paymentLinksListMock.mockReturnValue(makeThrowingAsyncIterable(stripeErr));

    const { listActivePaymentLinks } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const { StripeSetupError } = await import('../../../src/lib/stripe/errors.js');
    const stripe = getStripeClient();

    try {
      await listActivePaymentLinks(stripe);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(StripeSetupError);
      const setupErr = err as InstanceType<typeof StripeSetupError>;
      expect(setupErr.message).toContain('Invalid API key');
      expect(setupErr.cause).toBe(stripeErr);
    }
  });

  it('passes through non-Stripe errors unwrapped', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const genericErr = new Error('network exploded');
    mocks.paymentLinksListMock.mockReturnValue(makeThrowingAsyncIterable(genericErr));

    const { listActivePaymentLinks } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();

    try {
      await listActivePaymentLinks(stripe);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBe(genericErr);
    }
  });
});

describe('listLinkLineItems', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns line items response', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const mockResponse = {
      data: [{ id: 'li_1' }, { id: 'li_2' }],
      has_more: false,
    };
    mocks.listLineItemsMock.mockResolvedValue(mockResponse);

    const { listLinkLineItems } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();
    const response = await listLinkLineItems(stripe, 'plink_123');

    expect(response).toBe(mockResponse);
  });

  it('passes correct params: expand and limit', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.listLineItemsMock.mockResolvedValue({ data: [], has_more: false });

    const { listLinkLineItems } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();
    await listLinkLineItems(stripe, 'plink_abc');

    expect(mocks.listLineItemsMock).toHaveBeenCalledWith('plink_abc', {
      expand: ['data.price.product'],
      limit: 100,
    });
  });

  it('lets errors propagate to the caller', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const err = new Error('line items exploded');
    mocks.listLineItemsMock.mockRejectedValue(err);

    const { listLinkLineItems } = await import('../../../src/lib/stripe/api.js');
    const { getStripeClient } = await import('../../../src/lib/stripe/client.js');
    const stripe = getStripeClient();

    try {
      await listLinkLineItems(stripe, 'plink_123');
      expect.unreachable('should have thrown');
    } catch (caught: unknown) {
      expect(caught).toBe(err);
    }
  });
});
