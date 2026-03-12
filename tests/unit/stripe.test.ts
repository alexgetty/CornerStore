import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  const original = await importOriginal<typeof import('gray-matter')>();
  return { default: vi.fn(original.default) };
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

async function getStripeMock() {
  const Stripe = vi.mocked((await import('stripe')).default);
  const paymentLinksListMock = vi.fn();
  const listLineItemsMock = vi.fn();
  Stripe.mockImplementation(
    () =>
      ({
        paymentLinks: {
          list: paymentLinksListMock,
          listLineItems: listLineItemsMock,
        },
      }) as unknown as InstanceType<typeof Stripe>
  );
  return { Stripe, paymentLinksListMock, listLineItemsMock };
}

function makePaymentLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plink_123',
    url: 'https://buy.stripe.com/test_abc',
    ...overrides,
  };
}

function makeLineItem(overrides: Record<string, unknown> = {}) {
  return {
    price: {
      id: 'price_123',
      unit_amount: 1999,
      currency: 'usd',
      product: {
        name: 'Test Product',
        description: 'A test product',
        images: ['https://example.com/img.jpg'],
        metadata: {},
      },
    },
    ...overrides,
  };
}

/**
 * Creates a mock error object that mimics Stripe SDK errors.
 * Stripe errors have a `type` string property — we check type, not instanceof.
 */
function makeStripeError(type: string, message: string): Error & { type: string } {
  const err = new Error(message) as Error & { type: string };
  err.type = type;
  return err;
}

/**
 * Creates an async iterable that throws on iteration.
 * Simulates Stripe SDK errors during auto-pagination.
 */
function makeThrowingAsyncIterable(error: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      throw error;
    },
  };
}

/**
 * Sets up mocks with a standard single-product payment link.
 * Returns the mocks for further customization.
 */
async function setupDefaultMocks() {
  const mocks = await getStripeMock();
  mocks.paymentLinksListMock.mockReturnValue(
    makeAsyncIterable([makePaymentLink()])
  );
  mocks.listLineItemsMock.mockResolvedValue({
    data: [makeLineItem()],
  });
  // Default: no bundle config directory
  const { readdirMock } = await getFsMock();
  readdirMock.mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  );
  return mocks;
}

async function getFsMock() {
  const fs = await import('node:fs/promises');
  return {
    readdirMock: vi.mocked(fs.readdir),
    readFileMock: vi.mocked(fs.readFile),
    copyFileMock: vi.mocked(fs.copyFile),
    mkdirMock: vi.mocked(fs.mkdir),
  };
}

function makeDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir };
}

async function getMatterMock() {
  const matterModule = await import('gray-matter');
  return vi.mocked(matterModule.default);
}

describe('getCatalog', () => {
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

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    await expect(getCatalog()).rejects.toThrow(StripeSetupError);
    await expect(getCatalog()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('throws StripeSetupError when STRIPE_SECRET_KEY is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    await expect(getCatalog()).rejects.toThrow(StripeSetupError);
    await expect(getCatalog()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('throws StripeSetupError when STRIPE_SECRET_KEY does not start with sk_', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'pk_test_abc123');

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    const assertion = expect(getCatalog()).rejects;
    await assertion.toThrow(StripeSetupError);
    await assertion.toThrow(/sk_/);
  });

  it('includes guidance in StripeSetupError for missing key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getCatalog } = await import('../../src/lib/stripe.js');

    try {
      await getCatalog();
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

    const { getCatalog } = await import('../../src/lib/stripe.js');

    try {
      await getCatalog();
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

    expect(listings[0]!.imageAlt).toBe(
      'A hand-poured soy candle in amber glass'
    );

  });

  it('falls back to product name when metadata.image_alt is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

    expect(listings).toHaveLength(1);
    expect(listings[0]!.name).toBe('Test Product');

  });

  // --- Stripe API errors during payment link fetch ---

  it('throws #no-payment-links when zero active links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable([]));

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    try {
      await getCatalog();
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

        const { getCatalog, StripeSetupError } = await import(
          '../../src/lib/stripe.js'
        );

        try {
          await getCatalog();
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

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    try {
      await getCatalog();
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

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    try {
      await getCatalog();
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

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    try {
      await getCatalog();
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog, StripeSetupError } = await import(
      '../../src/lib/stripe.js'
    );

    try {
      await getCatalog();
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');

    await expect(getCatalog()).rejects.toThrow();
    expect(mocks.listLineItemsMock).not.toHaveBeenCalled();
  });

  // --- API contracts ---

  it('passes correct params to paymentLinks.list', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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
    }) as typeof readdirMock);
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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
    }) as typeof readdirMock);
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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
    }) as typeof readdirMock);
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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
    }) as typeof readdirMock);
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    const listings = await getCatalog();

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
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/nonexistent\ntitle: Ghost Bundle\n---\n'
    );

    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem()],
    });

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

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
    }) as typeof readdirMock);
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

    const { getCatalog } = await import('../../src/lib/stripe.js');
    await getCatalog();

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('Bundle cards: 2');
    expect(allLogCalls).toContain('1 configured');
    expect(allLogCalls).toContain('1 default');

  });
});

describe('StripeSetupError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('extends Error', async () => {
    const { StripeSetupError } = await import('../../src/lib/stripe.js');
    const err = new StripeSetupError('test message', 'test-guidance');
    expect(err).toBeInstanceOf(Error);
  });

  it('has guidance property', async () => {
    const { StripeSetupError } = await import('../../src/lib/stripe.js');
    const err = new StripeSetupError('test message', '#some-section');
    expect(err.guidance).toBe('#some-section');
  });

  it('formats message with [Storefront] prefix and SETUP.md reference', async () => {
    const { StripeSetupError } = await import('../../src/lib/stripe.js');
    const err = new StripeSetupError('Something broke', '#fix-it');
    expect(err.message).toContain('[Storefront]');
    expect(err.message).toContain('Something broke');
    expect(err.message).toContain('SETUP.md#fix-it');
  });

  it('preserves cause when provided', async () => {
    const { StripeSetupError } = await import('../../src/lib/stripe.js');
    const original = new Error('original');
    const err = new StripeSetupError('wrapped', '#section', original);
    expect(err.cause).toBe(original);
  });

  it('has undefined cause when not provided', async () => {
    const { StripeSetupError } = await import('../../src/lib/stripe.js');
    const err = new StripeSetupError('no cause', '#section');
    expect(err.cause).toBeUndefined();
  });
});

describe('loadBundleConfigs', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('re-throws non-ENOENT errors from readdir', async () => {
    const { readdirMock } = await getFsMock();
    const permErr = new Error('EACCES: permission denied');
    readdirMock.mockRejectedValue(permErr);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');

    await expect(loadBundleConfigs()).rejects.toBe(permErr);
  });

  it('returns empty map when directory does not exist', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
  });

  it('parses frontmatter from subdirectory and returns config keyed by link URL', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('holiday-set', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/abc\ntitle: Holiday Set\ndescription: A cozy set\nimage_alt: Cozy holiday bundle\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.has('https://buy.stripe.com/abc')).toBe(true);
    const config = result.get('https://buy.stripe.com/abc')!;
    expect(config.title).toBe('Holiday Set');
    expect(config.description).toBe('A cozy set');
    expect(config.image).toBe('/bundles/holiday-set/photo.jpg');
    expect(config.image_alt).toBe('Cozy holiday bundle');
  });

  it('skips subdirectory with no .md files', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('images-only', true)]);
      }
      return Promise.resolve(['photo1.jpg', 'photo2.png']);
    }) as typeof readdirMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
  });

  it('skips non-directory entries in bundles dir', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('real-bundle', true),
          makeDirent('stray-file.md', false),
        ]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
  });

  it('uses first .md file alphabetically when multiple exist and warns', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['notes.md', 'config.md', 'hero.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Config Title\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('multiple .md files');
    expect(allLogCalls).toContain('config.md');
    expect(allLogCalls).toContain('notes.md');
  });

  it('uses first image alphabetically as cover when no cover field', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'zebra.jpg', 'alpha.png']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/alpha.png');
  });

  it('uses cover frontmatter field to select cover image', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'alpha.jpg', 'hero.png']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ncover: hero.png\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/hero.png');
  });

  it('warns and falls back when cover references non-existent file', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'actual.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ncover: missing.png\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/actual.jpg');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('cover "missing.png" not found');
  });

  it('returns undefined image when no images in directory', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('text-only', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Text Only\n---\n'
    );

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBeUndefined();
  });

  it('copies images to public/bundles/<dirname>/', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('holiday-set', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo1.jpg', 'photo2.png']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    await loadBundleConfigs();

    expect(mkdirMock).toHaveBeenCalledWith(
      expect.stringContaining('public/bundles/holiday-set'),
      { recursive: true }
    );
    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('bundles/holiday-set/photo1.jpg'),
      expect.stringContaining('public/bundles/holiday-set/photo1.jpg')
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('bundles/holiday-set/photo2.png'),
      expect.stringContaining('public/bundles/holiday-set/photo2.png')
    );
  });

  it('warns and continues when image copy fails', async () => {
    const { readdirMock, readFileMock, mkdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('broken-imgs', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockRejectedValue(new Error('EACCES: permission denied'));

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('failed to copy images');
  });

  it('warns and skips when .md file has no link field', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-bundle', true)]);
      }
      return Promise.resolve(['config.md']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue('---\ntitle: No Link\n---\n');

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('config.md');
    expect(allLogCalls).toContain('missing required "link"');
  });

  it('warns and skips when link field is not a string', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('numeric-link', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue('---\nlink: 42\ntitle: Bad Link\n---\n');

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('bundle.md');
    expect(allLogCalls).toContain('"link"');
  });

  it('returns partial config when only some fields specified', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('partial', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Just a Title\n---\n'
    );

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.title).toBe('Just a Title');
    expect(config.description).toBeUndefined();
    expect(config.image).toBeUndefined();
    expect(config.image_alt).toBeUndefined();
  });

  it('warns and skips when readFile throws', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('broken', true),
          makeDirent('valid', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('broken')) {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/valid\ntitle: Valid Bundle\n---\n'
      );
    }) as typeof readFileMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/valid')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/broken/bundle.md:');
  });

  it('warns and skips when readFile throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('weird', true),
          makeDirent('ok', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('weird')) {
        return Promise.reject('string error, not Error instance');
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/ok\ntitle: OK Bundle\n---\n'
      );
    }) as typeof readFileMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/ok')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/weird/bundle.md:');
    expect(allLogCalls).toContain('string error, not Error instance');
  });

  it('warns and skips when frontmatter is malformed', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('malformed', true),
          makeDirent('good', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('malformed')) {
        return Promise.resolve('---\n: invalid: yaml:\n---\n');
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/good\ntitle: Good Bundle\n---\n'
      );
    }) as typeof readFileMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/good')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/malformed/bundle.md:');
  });

  it('warns and skips when frontmatter parser throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const matterMock = await getMatterMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('cursed', true),
          makeDirent('fine', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/fine\ntitle: Fine\n---\n'
    );
    const realMatter = ((await vi.importActual('gray-matter')) as typeof import('gray-matter')).default;
    let callCount = 0;
    matterMock.mockImplementation((...args: Parameters<typeof matterMock>) => {
      callCount++;
      if (callCount === 1) {
        throw 42;
      }
      return realMatter(...args);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/fine')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/cursed/bundle.md:');
    expect(allLogCalls).toContain('42');
  });

  it('uses first directory alphabetically when duplicate links found', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('beta-bundle', true),
          makeDirent('alpha-bundle', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as typeof readdirMock);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('alpha-bundle')) {
        return Promise.resolve(
          '---\nlink: https://buy.stripe.com/test\ntitle: Alpha Title\n---\n'
        );
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/test\ntitle: Beta Title\n---\n'
      );
    }) as typeof readFileMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.title).toBe('Alpha Title');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('duplicate');
  });

  it('warns and skips when subdirectory readdir fails', async () => {
    const { readdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-dir', true)]);
      }
      return Promise.reject(new Error('EACCES: permission denied'));
    }) as typeof readdirMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('bundles/bad-dir');
    expect(allLogCalls).toContain('failed to read');
  });

  it('warns with stringified value when subdirectory readdir throws non-Error', async () => {
    const { readdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-dir', true)]);
      }
      return Promise.reject('non-error string');
    }) as typeof readdirMock);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('non-error string');
  });

  it('warns with stringified value when image copy throws non-Error', async () => {
    const { readdirMock, readFileMock, mkdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-copy', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as typeof readdirMock);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockRejectedValue(99);

    const { loadBundleConfigs } = await import('../../src/lib/stripe.js');
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('failed to copy images');
    expect(allLogCalls).toContain('99');
  });
});

describe('formatPrice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('formats USD cents to dollars', async () => {
    const { formatPrice } = await import('../../src/lib/stripe.js');
    expect(formatPrice(1999, 'usd')).toBe('$19.99');
  });

  it('formats GBP cents to pounds', async () => {
    const { formatPrice } = await import('../../src/lib/stripe.js');
    expect(formatPrice(1999, 'gbp')).toBe('£19.99');
  });

  it('formats JPY as zero-decimal currency', async () => {
    const { formatPrice } = await import('../../src/lib/stripe.js');
    expect(formatPrice(1999, 'jpy')).toBe('¥1,999');
  });

  it('formats zero amount', async () => {
    const { formatPrice } = await import('../../src/lib/stripe.js');
    expect(formatPrice(0, 'usd')).toBe('$0.00');
  });

  it('treats null amount as zero', async () => {
    const { formatPrice } = await import('../../src/lib/stripe.js');
    expect(formatPrice(null, 'usd')).toBe('$0.00');
  });
});

describe('rawPriceToDecimal', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('converts USD cents to decimal dollars', async () => {
    const { rawPriceToDecimal } = await import('../../src/lib/stripe.js');
    expect(rawPriceToDecimal(1999, 'usd')).toBe(19.99);
  });

  it('returns raw value for JPY (zero-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import('../../src/lib/stripe.js');
    expect(rawPriceToDecimal(1999, 'jpy')).toBe(1999);
  });

  it('returns raw value for VND (zero-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import('../../src/lib/stripe.js');
    expect(rawPriceToDecimal(50000, 'vnd')).toBe(50000);
  });

  it('divides by 1000 for BHD (three-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import('../../src/lib/stripe.js');
    expect(rawPriceToDecimal(1500, 'bhd')).toBe(1.5);
  });

  it('returns 0 for zero amount', async () => {
    const { rawPriceToDecimal } = await import('../../src/lib/stripe.js');
    expect(rawPriceToDecimal(0, 'usd')).toBe(0);
  });
});

describe('listingHasPrice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true for SingleListing', async () => {
    const { listingHasPrice } = await import('../../src/lib/stripe.js');
    expect(listingHasPrice({
      kind: 'single',
      name: 'Test',
      description: null,
      image: null,
      imageAlt: 'Test',
      price: '$19.99',
      rawPrice: 1999,
      currency: 'usd',
      paymentLink: 'https://buy.stripe.com/test',
    })).toBe(true);
  });

  it('returns true for BundleListing with price', async () => {
    const { listingHasPrice } = await import('../../src/lib/stripe.js');
    expect(listingHasPrice({
      kind: 'bundle',
      name: 'Bundle',
      description: null,
      image: null,
      imageAlt: 'Bundle',
      price: '$15.00',
      rawPrice: 1500,
      currency: 'usd',
      paymentLink: 'https://buy.stripe.com/test',
    })).toBe(true);
  });

  it('returns false for BundleListing with null price fields', async () => {
    const { listingHasPrice } = await import('../../src/lib/stripe.js');
    expect(listingHasPrice({
      kind: 'bundle',
      name: 'Bundle',
      description: null,
      image: null,
      imageAlt: 'Bundle',
      price: null,
      rawPrice: null,
      currency: null,
      paymentLink: 'https://buy.stripe.com/test',
    })).toBe(false);
  });
});
