import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  makeAsyncIterable,
  getStripeMock,
  makePaymentLink,
  makeLineItem,
  makeStripeError,
  makeThrowingAsyncIterable,
  getFsMock,
  makeDirent,
  setupDefaultMocks,
} from './helpers.js';

// Mock the stripe module — default export is a class constructor
vi.mock('stripe', () => {
  const MockStripe = vi.fn();
  return { default: MockStripe };
});

// Mock node:fs/promises for bundle config tests
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock gray-matter — passthrough by default, overridable per test
vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});

describe('getListings', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    // Default: no bundle config directory
    const { readdirMock } = await getFsMock();
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
  });

  afterEach(() => vi.restoreAllMocks());

  // --- Env validation ---

  it('throws StripeSetupError when STRIPE_SECRET_KEY is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    await expect(getListings()).rejects.toThrow(StripeSetupError);
    await expect(getListings()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('throws StripeSetupError when STRIPE_SECRET_KEY is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    await expect(getListings()).rejects.toThrow(StripeSetupError);
    await expect(getListings()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('throws StripeSetupError when STRIPE_SECRET_KEY does not start with sk_', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'pk_test_abc123');

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    const assertion = expect(getListings()).rejects;
    await assertion.toThrow(StripeSetupError);
    await assertion.toThrow(/sk_/);
  });

  it('includes guidance in StripeSetupError for missing key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const error = err as { guidance: string; message: string };
      expect(error.guidance).toBeDefined();
      expect(error.message).toContain('[Storefront]');
      expect(error.message).toContain('SETUP.md');
    }
  });

  it('includes guidance in StripeSetupError for sk_ prefix check', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'pk_test_abc123');

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const error = err as { guidance: string; message: string };
      expect(error.guidance).toBeDefined();
      expect(error.message).toContain('[Storefront]');
      expect(error.message).toContain('SETUP.md');
    }
  });

  // --- Happy path: single-product link ---

  it('returns SingleListing for a single-product payment link', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toEqual([
      {
        kind: 'single',
        name: 'Test Product',
        description: 'A test product',
        image: 'https://example.com/img.jpg',
        imageAlt: 'Test Product',
        price: '$19.99',
        rawPrice: 1999,
        currency: 'usd',
        paymentLink: 'https://buy.stripe.com/test_abc',
      },
    ]);
  });

  it('calls listLineItems with expand for product data', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    expect(mocks.listLineItemsMock).toHaveBeenCalledWith('plink_123', {
      expand: ['data.price.product'],
      limit: 100,
    });
  });

  it('uses metadata.image_alt for imageAlt when present', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: 1999,
            currency: 'usd',
            product: {
              name: 'Soy Candle',
              description: null,
              images: ['https://example.com/candle.jpg'],
              metadata: { image_alt: 'A hand-poured soy candle in amber glass' },
            },
          },
        }),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.imageAlt).toBe(
      'A hand-poured soy candle in amber glass'
    );
  });

  it('falls back to product name when metadata.image_alt is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.imageAlt).toBe('Test Product');
  });

  it('falls back to product name when metadata.image_alt is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: 1999,
            currency: 'usd',
            product: {
              name: 'Test Product',
              description: null,
              images: [],
              metadata: { image_alt: '' },
            },
          },
        }),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.imageAlt).toBe('Test Product');
  });

  it('returns null image when product has no images', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: 1999,
            currency: 'usd',
            product: {
              name: 'Test Product',
              description: null,
              images: [],
              metadata: {},
            },
          },
        }),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.image).toBeNull();
  });

  it('returns null description when product has none', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: 1999,
            currency: 'usd',
            product: {
              name: 'Test Product',
              description: null,
              images: [],
              metadata: {},
            },
          },
        }),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.description).toBeNull();
  });

  // --- Line item edge cases ---

  it('skips line items with null price', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [{ price: null }, makeLineItem()],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.name).toBe('Test Product');
  });

  it('treats null unit_amount as zero', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: null,
            currency: 'usd',
            product: {
              name: 'Free Product',
              description: null,
              images: [],
              metadata: {},
            },
          },
        }),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.price).toBe('$0.00');
    expect(listings[0]!.rawPrice).toBe(0);
  });

  it('skips line items where product is an unexpanded string ID', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_123',
            unit_amount: 1999,
            currency: 'usd',
            product: 'prod_abc123',
          },
        }),
        makeLineItem(),
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.name).toBe('Test Product');
  });

  // --- Stripe API errors during payment link fetch ---

  it('throws #no-payment-links when zero active links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable([]));

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(StripeSetupError);
      const setupErr = err as InstanceType<typeof StripeSetupError>;
      expect(setupErr.guidance).toBe('#no-payment-links');
    }
  });

  describe('wraps Stripe errors from payment link fetch', () => {
    const stripeErrorCases = [
      {
        type: 'StripeAuthenticationError',
        expectedMessage: 'Invalid API key',
        expectedGuidance: '#invalid-api-key',
      },
      {
        type: 'StripePermissionError',
        expectedMessage: 'API key lacks required permissions',
        expectedGuidance: '#insufficient-permissions',
      },
      {
        type: 'StripeConnectionError',
        expectedMessage: 'Cannot reach Stripe API',
        expectedGuidance: '#connection-error',
      },
      {
        type: 'StripeRateLimitError',
        expectedMessage: 'Too many requests',
        expectedGuidance: '#rate-limit',
      },
      {
        type: 'StripeInvalidRequestError',
        expectedMessage: 'Invalid API request',
        expectedGuidance: '#invalid-request',
      },
      {
        type: 'StripeAPIError',
        expectedMessage: 'Stripe internal error',
        expectedGuidance: '#stripe-api-error',
      },
    ];

    for (const { type, expectedMessage, expectedGuidance } of stripeErrorCases) {
      it(`catches ${type} and throws StripeSetupError`, async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
        const mocks = await getStripeMock();
        const stripeErr = makeStripeError(type, `Original: ${type}`);
        mocks.paymentLinksListMock.mockReturnValue(
          makeThrowingAsyncIterable(stripeErr)
        );

        const { getListings } = await import(
          '../../../src/lib/storefront/index.js'
        );
        const { StripeSetupError } = await import(
          '../../../src/lib/stripe/index.js'
        );

        try {
          await getListings();
          expect.unreachable('should have thrown');
        } catch (err: unknown) {
          expect(err).toBeInstanceOf(StripeSetupError);
          const setupErr = err as InstanceType<typeof StripeSetupError>;
          expect(setupErr.message).toContain(expectedMessage);
          expect(setupErr.guidance).toBe(expectedGuidance);
          expect(setupErr.cause).toBe(stripeErr);
        }
      });
    }
  });

  it('passes through unknown Stripe error type unwrapped', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const stripeErr = makeStripeError('StripeUnknownFutureError', 'some message');
    mocks.paymentLinksListMock.mockReturnValue(
      makeThrowingAsyncIterable(stripeErr)
    );

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe(stripeErr);
    }
  });

  it('passes through error with non-string type property unwrapped', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const err = new Error('weird error') as Error & { type: number };
    err.type = 42;
    mocks.paymentLinksListMock.mockReturnValue(
      makeThrowingAsyncIterable(err)
    );

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (caught: unknown) {
      expect(caught).not.toBeInstanceOf(StripeSetupError);
      expect(caught).toBe(err);
    }
  });

  it('passes through non-Stripe errors from payment link fetch unwrapped', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const genericErr = new Error('network exploded');
    mocks.paymentLinksListMock.mockReturnValue(
      makeThrowingAsyncIterable(genericErr)
    );

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe(genericErr);
    }
  });

  // --- Per-link error handling ---

  it('warns and skips link when listLineItems fails', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_good', url: 'https://buy.stripe.com/good' }),
        makePaymentLink({ id: 'plink_bad', url: 'https://buy.stripe.com/bad' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_good') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.reject(new Error('line items exploded'));
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.paymentLink).toBe('https://buy.stripe.com/good');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/bad');
    expect(allLogCalls).toContain('line items exploded');
  });

  it('includes stringified value when listLineItems throws non-Error', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_good', url: 'https://buy.stripe.com/good' }),
        makePaymentLink({ id: 'plink_bad', url: 'https://buy.stripe.com/bad' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_good') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.reject('string rejection');
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('string rejection');
  });

  it('warns and skips link when line items are empty', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_good', url: 'https://buy.stripe.com/good' }),
        makePaymentLink({ id: 'plink_empty', url: 'https://buy.stripe.com/empty' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_good') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.resolve({ data: [] });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.paymentLink).toBe('https://buy.stripe.com/good');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/empty');
  });

  it('warns and skips link when all line items have null price', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_bad', url: 'https://buy.stripe.com/bad' }),
        makePaymentLink({ id: 'plink_good', url: 'https://buy.stripe.com/good' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_bad') {
        return Promise.resolve({
          data: [{ price: null }, { price: null }],
        });
      }
      return Promise.resolve({ data: [makeLineItem()] });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    // Bad link skipped, good link kept
    expect(listings).toHaveLength(1);
    expect(listings[0]!.paymentLink).toBe('https://buy.stripe.com/good');

    // Warning logged with the link URL and reason
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/bad');
    expect(allLogCalls).toContain('no valid line items');
  });

  it('warns when line items exceed pagination limit', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
      has_more: true,
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    // Listing still created from the returned items
    expect(listings).toHaveLength(1);
    expect(listings[0]!.name).toBe('Test Product');

    // Warning logged about exceeding 100 items
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/test_abc');
    expect(allLogCalls).toContain('more than 100 line items');
  });

  // --- Empty validation ---

  it('throws #no-cards when all links are skipped', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockRejectedValue(new Error('failed'));

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      await getListings();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(StripeSetupError);
      const setupErr = err as InstanceType<typeof StripeSetupError>;
      expect(setupErr.guidance).toBe('#no-cards');
    }
  });

  // --- Build summary ---

  it('logs build summary with single-product counts', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Build complete:');
    expect(allLogCalls).toContain('Payment links found: 1');
    expect(allLogCalls).toContain('Single-product cards: 1');
  });

  it('logs warnings before build summary', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_good', url: 'https://buy.stripe.com/good' }),
        makePaymentLink({ id: 'plink_bad', url: 'https://buy.stripe.com/bad' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_good') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.reject(new Error('failed'));
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Build complete:');
    expect(allLogCalls).toContain('Links skipped: 1');
  });

  // --- Pipeline order ---

  it('does not fetch line items if payment link list fails', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const stripeErr = makeStripeError('StripeAuthenticationError', 'bad key');
    mocks.paymentLinksListMock.mockReturnValue(
      makeThrowingAsyncIterable(stripeErr)
    );

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );

    await expect(getListings()).rejects.toThrow();
    expect(mocks.listLineItemsMock).not.toHaveBeenCalled();
  });

  // --- API contracts ---

  it('passes correct params to paymentLinks.list', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    expect(mocks.paymentLinksListMock).toHaveBeenCalledWith({
      active: true,
    });
  });

  // --- Bundle auto-generation (multi-product links) ---

  it('returns BundleListing for multi-product payment link', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_b3f9', url: 'https://buy.stripe.com/b3f9' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: {
            id: 'price_a',
            unit_amount: 1000,
            currency: 'usd',
            product: { name: 'Candle', description: 'Soy candle', images: ['https://example.com/candle.jpg'], metadata: {} },
          },
        }),
        makeLineItem({
          price: {
            id: 'price_b',
            unit_amount: 500,
            currency: 'usd',
            product: { name: 'Matches', description: 'Wooden matches', images: ['https://example.com/matches.jpg'], metadata: {} },
          },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.kind).toBe('bundle');
  });

  it('auto-generates bundle title from last 4 chars of link ID', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_a3f9', url: 'https://buy.stripe.com/a3f9' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.name).toBe('Bundle a3f9');
  });

  it('auto-generates bundle description listing product names alphabetically', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_c', unit_amount: 300, currency: 'usd', product: { name: 'Matchbox', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Candle Holder', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Soy Candle', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.description).toBe(
      'This bundle includes: Candle Holder, Matchbox, Soy Candle'
    );
  });

  it('uses image from alphabetically first product', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Zebra Candle', description: null, images: ['https://example.com/zebra.jpg'], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Alpha Candle', description: null, images: ['https://example.com/alpha.jpg'], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.image).toBe('https://example.com/alpha.jpg');
  });

  it('falls back to next product image when first-alpha has none', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Alpha', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Beta', description: null, images: ['https://example.com/beta.jpg'], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.image).toBe('https://example.com/beta.jpg');
  });

  it('returns null image when no products in bundle have images', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Alpha', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Beta', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.image).toBeNull();
  });

  it('uses auto-generated title as imageAlt for bundles', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_x1y2', url: 'https://buy.stripe.com/x1y2' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.imageAlt).toBe('Bundle x1y2');
  });

  it('sums line item amounts when all same currency', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.price).toBe('$15.00');
    expect(listings[0]!.rawPrice).toBe(1500);
    expect(listings[0]!.currency).toBe('usd');
  });

  it('returns null price when mixed currencies and warns', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'gbp', product: { name: 'B', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.price).toBeNull();
    expect(listings[0]!.rawPrice).toBeNull();
    expect(listings[0]!.currency).toBeNull();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('mixed currencies');
  });

  it('disambiguates display name collisions with -a/-b suffixes', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Two links whose IDs end with the same 4 chars
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_xxxxa3f9', url: 'https://buy.stripe.com/xxxx' }),
        makePaymentLink({ id: 'plink_yyyya3f9', url: 'https://buy.stripe.com/yyyy' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_xxxxa3f9') {
        return Promise.resolve({
          data: [
            makeLineItem({ price: { id: 'price_a1', unit_amount: 100, currency: 'usd', product: { name: 'A1', description: null, images: [], metadata: {} } } }),
            makeLineItem({ price: { id: 'price_a2', unit_amount: 200, currency: 'usd', product: { name: 'A2', description: null, images: [], metadata: {} } } }),
          ],
        });
      }
      return Promise.resolve({
        data: [
          makeLineItem({ price: { id: 'price_b1', unit_amount: 300, currency: 'usd', product: { name: 'B1', description: null, images: [], metadata: {} } } }),
          makeLineItem({ price: { id: 'price_b2', unit_amount: 400, currency: 'usd', product: { name: 'B2', description: null, images: [], metadata: {} } } }),
        ],
      });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    const names = listings.map((l) => l.name);
    // Alphabetical by URL: /xxxx gets -1, /yyyy gets -2
    expect(names).toContain('Bundle a3f9-1');
    expect(names).toContain('Bundle a3f9-2');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('display name collision');
  });

  it('assigns deterministic numeric suffixes for colliding display names', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Two links whose IDs end with the same 4 chars — collision
    // URLs are alphabetically ordered to verify deterministic assignment
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_xxxxa3f9', url: 'https://buy.stripe.com/aaa' }),
        makePaymentLink({ id: 'plink_yyyya3f9', url: 'https://buy.stripe.com/bbb' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_xxxxa3f9') {
        return Promise.resolve({
          data: [
            makeLineItem({ price: { id: 'price_a1', unit_amount: 100, currency: 'usd', product: { name: 'A1', description: null, images: [], metadata: {} } } }),
            makeLineItem({ price: { id: 'price_a2', unit_amount: 200, currency: 'usd', product: { name: 'A2', description: null, images: [], metadata: {} } } }),
          ],
        });
      }
      return Promise.resolve({
        data: [
          makeLineItem({ price: { id: 'price_b1', unit_amount: 300, currency: 'usd', product: { name: 'B1', description: null, images: [], metadata: {} } } }),
          makeLineItem({ price: { id: 'price_b2', unit_amount: 400, currency: 'usd', product: { name: 'B2', description: null, images: [], metadata: {} } } }),
        ],
      });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    const names = listings.map((l) => l.name);
    // Alphabetical by link URL: /aaa gets -1, /bbb gets -2
    expect(names).toContain('Bundle a3f9-1');
    expect(names).toContain('Bundle a3f9-2');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('display name collision');
  });

  it('uses numeric suffix when more than 26 bundles share a display name', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const links = Array.from({ length: 27 }, (_, i) =>
      makePaymentLink({ id: `plink_${String(i).padStart(4, '0')}a3f9`, url: `https://buy.stripe.com/${String(i).padStart(4, '0')}` })
    );
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable(links));
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({ price: { id: 'price_a', unit_amount: 100, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } } }),
        makeLineItem({ price: { id: 'price_b', unit_amount: 200, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } } }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    const names = listings.map((l) => l.name);
    expect(names).toContain('Bundle a3f9-1');
    expect(names).toContain('Bundle a3f9-26');
    expect(names).toContain('Bundle a3f9-27');
  });

  it('warns about unconfigured bundles', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/test' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({
          price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } },
        }),
        makeLineItem({
          price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } },
        }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('no bundle config');
  });

  it('includes bundle counts in build summary', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_single', url: 'https://buy.stripe.com/single' }),
        makePaymentLink({ id: 'plink_bundle', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_single') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.resolve({
        data: [
          makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } } }),
          makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } } }),
        ],
      });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('Single-product cards: 1');
    expect(allLogCalls).toContain('Bundle cards: 1');
  });

  // --- Listing order ---

  it('returns bundles before singles', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_single', url: 'https://buy.stripe.com/single' }),
        makePaymentLink({ id: 'plink_bundle', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_single') {
        return Promise.resolve({ data: [makeLineItem()] });
      }
      return Promise.resolve({
        data: [
          makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } } }),
          makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } } }),
        ],
      });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(2);
    expect(listings[0]!.kind).toBe('bundle');
    expect(listings[1]!.kind).toBe('single');
  });

  // --- Bundle config integration ---

  it('warns and continues when loadBundleConfigs throws non-ENOENT error', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock } = await getFsMock();

    readdirMock.mockRejectedValue(new Error('EACCES: permission denied'));

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.kind).toBe('single');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('bundle config');
    expect(allLogCalls).toContain('EACCES');
  });

  it('warns with stringified value when loadBundleConfigs throws non-Error', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock } = await getFsMock();

    readdirMock.mockRejectedValue('weird string error');

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings).toHaveLength(1);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('weird string error');
  });

  it('applies bundle config overrides to auto-generated fields', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('holiday-set', true)]);
      }
      return Promise.resolve(['bundle.md', 'holiday.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/bundle\ntitle: Holiday Set\ndescription: Cozy night essentials\nimage_alt: A cozy holiday bundle\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_bundle', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Candle', description: null, images: [], metadata: {} } } }),
        makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Matches', description: null, images: [], metadata: {} } } }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.name).toBe('Holiday Set');
    expect(listings[0]!.description).toBe('Cozy night essentials');
    expect(listings[0]!.image).toBe('/bundles/holiday-set/holiday.jpg');
    expect(listings[0]!.imageAlt).toBe('A cozy holiday bundle');
  });

  it('partial config only overrides specified fields', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('partial', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/bundle\ntitle: Custom Name\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_abcd', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Alpha', description: null, images: ['https://example.com/alpha.jpg'], metadata: {} } } }),
        makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Beta', description: null, images: [], metadata: {} } } }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    // Title overridden by config
    expect(listings[0]!.name).toBe('Custom Name');
    // Description auto-generated (not in config)
    expect(listings[0]!.description).toBe('This bundle includes: Alpha, Beta');
    // Image auto-generated (no images in config dir)
    expect(listings[0]!.image).toBe('https://example.com/alpha.jpg');
    // imageAlt falls back to config title
    expect(listings[0]!.imageAlt).toBe('Custom Name');
  });

  it('image_alt falls back to title when not specified in config', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/bundle\ntitle: My Bundle\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_test', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } } }),
        makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } } }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    expect(listings[0]!.imageAlt).toBe('My Bundle');
  });

  it('uses config image_alt even when title is not provided', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('alt-only', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/bundle\nimage_alt: A lovely bundle photo\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_qrs7', url: 'https://buy.stripe.com/bundle' }),
      ])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [
        makeLineItem({ price: { id: 'price_a', unit_amount: 1000, currency: 'usd', product: { name: 'Alpha', description: null, images: [], metadata: {} } } }),
        makeLineItem({ price: { id: 'price_b', unit_amount: 500, currency: 'usd', product: { name: 'Beta', description: null, images: [], metadata: {} } } }),
      ],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    const listings = await getListings();

    // Name should be auto-generated (no title in config)
    expect(listings[0]!.name).toBe('Bundle qrs7');
    // imageAlt should come from config, not the auto-generated name
    expect(listings[0]!.imageAlt).toBe('A lovely bundle photo');
  });

  it('warns about orphaned configs with no matching active link', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('orphan', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/nonexistent\ntitle: Ghost Bundle\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('buy.stripe.com/nonexistent');
    expect(allLogCalls).toContain('no matching');
  });

  it('shows configured vs default counts in build summary', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { readdirMock, readFileMock } = await getFsMock();

    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('configured', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/configured\ntitle: Configured Bundle\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_configured', url: 'https://buy.stripe.com/configured' }),
        makePaymentLink({ id: 'plink_auto', url: 'https://buy.stripe.com/auto' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      return Promise.resolve({
        data: [
          makeLineItem({ price: { id: `price_${linkId}_a`, unit_amount: 1000, currency: 'usd', product: { name: 'A', description: null, images: [], metadata: {} } } }),
          makeLineItem({ price: { id: `price_${linkId}_b`, unit_amount: 500, currency: 'usd', product: { name: 'B', description: null, images: [], metadata: {} } } }),
        ],
      });
    });

    const { getListings } = await import(
      '../../../src/lib/storefront/index.js'
    );
    await getListings();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('Bundle cards: 2');
    expect(allLogCalls).toContain('1 configured');
    expect(allLogCalls).toContain('1 default');
  });
});
