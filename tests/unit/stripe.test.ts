import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the stripe module — default export is a class constructor
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

async function getStripeMock() {
  const Stripe = vi.mocked((await import('stripe')).default);
  const productsListMock = vi.fn();
  const paymentLinksListMock = vi.fn();
  const listLineItemsMock = vi.fn();
  Stripe.mockImplementation(
    () =>
      ({
        products: { list: productsListMock },
        paymentLinks: {
          list: paymentLinksListMock,
          listLineItems: listLineItemsMock,
        },
      }) as unknown as InstanceType<typeof Stripe>
  );
  return { Stripe, productsListMock, paymentLinksListMock, listLineItemsMock };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Product',
    description: 'A test product',
    images: ['https://example.com/img.jpg'],
    metadata: {},
    default_price: {
      id: 'price_123',
      unit_amount: 1999,
    },
    ...overrides,
  };
}

function makePaymentLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plink_123',
    url: 'https://buy.stripe.com/test_abc',
    ...overrides,
  };
}

function makeLineItem(priceId: string) {
  return {
    price: { id: priceId },
  };
}

/**
 * Sets up mocks with a standard product + matching payment link.
 * Returns the mocks for further customization.
 */
async function setupDefaultMocks() {
  const mocks = await getStripeMock();
  mocks.productsListMock.mockReturnValue(makeAsyncIterable([makeProduct()]));
  mocks.paymentLinksListMock.mockReturnValue(
    makeAsyncIterable([makePaymentLink()])
  );
  mocks.listLineItemsMock.mockResolvedValue({
    data: [makeLineItem('price_123')],
  });
  return mocks;
}

describe('getProducts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  // --- Env validation ---

  it('throws when STRIPE_SECRET_KEY is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getProducts } = await import('../../src/lib/stripe.js');

    await expect(getProducts()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  it('throws when STRIPE_SECRET_KEY is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { getProducts } = await import('../../src/lib/stripe.js');

    await expect(getProducts()).rejects.toThrow('STRIPE_SECRET_KEY');
  });

  // --- Happy path ---

  it('returns transformed products with matched payment links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    await setupDefaultMocks();

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([
      {
        name: 'Test Product',
        description: 'A test product',
        image: 'https://example.com/img.jpg',
        imageAlt: 'Test Product',
        price: '$19.99',
        paymentLink: 'https://buy.stripe.com/test_abc',
      },
    ]);
  });

  it('formats price correctly (1999 -> "$19.99")', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({ default_price: { id: 'price_123', unit_amount: 1999 } }),
      ])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.price).toBe('$19.99');
  });

  it('handles zero-cent prices (0 -> "$0.00")', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({ default_price: { id: 'price_123', unit_amount: 0 } }),
      ])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.price).toBe('$0.00');
  });

  it('treats null unit_amount as "$0.00"', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({ default_price: { id: 'price_123', unit_amount: null } }),
      ])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.price).toBe('$0.00');
  });

  it('returns null image when product has no images', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct({ images: [] })])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.image).toBeNull();
  });

  it('returns first image when product has multiple', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({
          images: [
            'https://example.com/first.jpg',
            'https://example.com/second.jpg',
          ],
        }),
      ])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.image).toBe('https://example.com/first.jpg');
  });

  it('returns null description when product has none', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct({ description: null })])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.description).toBeNull();
  });

  // --- imageAlt ---

  it('uses metadata.image_alt for imageAlt when present', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({ metadata: { image_alt: 'A hand-poured soy candle in amber glass' } }),
      ])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.imageAlt).toBe('A hand-poured soy candle in amber glass');
  });

  it('falls back to product name when metadata.image_alt is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct({ metadata: {} })])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.imageAlt).toBe('Test Product');
  });

  it('falls back to product name when metadata.image_alt is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct({ metadata: { image_alt: '' } })])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products[0]!.imageAlt).toBe('Test Product');
  });

  // --- Payment link matching ---

  it('matches payment link to product via price ID', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();

    const productA = makeProduct({
      name: 'Product A',
      default_price: { id: 'price_aaa', unit_amount: 500 },
    });
    const productB = makeProduct({
      name: 'Product B',
      default_price: { id: 'price_bbb', unit_amount: 1000 },
    });

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([productA, productB])
    );
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([
        makePaymentLink({ id: 'plink_a', url: 'https://buy.stripe.com/aaa' }),
        makePaymentLink({ id: 'plink_b', url: 'https://buy.stripe.com/bbb' }),
      ])
    );
    mocks.listLineItemsMock.mockImplementation((linkId: string) => {
      if (linkId === 'plink_a')
        return Promise.resolve({ data: [makeLineItem('price_aaa')] });
      if (linkId === 'plink_b')
        return Promise.resolve({ data: [makeLineItem('price_bbb')] });
      return Promise.resolve({ data: [] });
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toHaveLength(2);
    expect(products[0]!.paymentLink).toBe('https://buy.stripe.com/aaa');
    expect(products[1]!.paymentLink).toBe('https://buy.stripe.com/bbb');
  });

  it('skips products with no matching payment link and warns', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({
          name: 'Orphan Product',
          default_price: { id: 'price_orphan', unit_amount: 999 },
        }),
      ])
    );
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem('price_unrelated')],
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Orphan Product')
    );
    warnSpy.mockRestore();
  });

  it('returns [] when no products have matching payment links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([
        makeProduct({
          name: 'No Link A',
          default_price: { id: 'price_a', unit_amount: 100 },
        }),
        makeProduct({
          name: 'No Link B',
          default_price: { id: 'price_b', unit_amount: 200 },
        }),
      ])
    );
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem('price_zzz')],
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  // --- Empty / edge cases ---

  it('returns [] when Stripe has no products', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    mocks.productsListMock.mockReturnValue(makeAsyncIterable([]));
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [makeLineItem('price_123')],
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([]);
  });

  it('returns [] when Stripe has no payment links', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct()])
    );
    mocks.paymentLinksListMock.mockReturnValue(makeAsyncIterable([]));

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips products where default_price is an unexpanded string ID', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct({ default_price: 'price_abc123' })])
    );

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toEqual([]);
  });

  it('handles line items where price is an unexpanded string ID', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct()])
    );
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    // Return price as a raw string instead of an object
    mocks.listLineItemsMock.mockResolvedValue({
      data: [{ price: 'price_123' }],
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toHaveLength(1);
    expect(products[0]!.paymentLink).toBe('https://buy.stripe.com/test_abc');
  });

  it('skips line items with null price', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await getStripeMock();

    mocks.productsListMock.mockReturnValue(
      makeAsyncIterable([makeProduct()])
    );
    mocks.paymentLinksListMock.mockReturnValue(
      makeAsyncIterable([makePaymentLink()])
    );
    mocks.listLineItemsMock.mockResolvedValue({
      data: [{ price: null }, makeLineItem('price_123')],
    });

    const { getProducts } = await import('../../src/lib/stripe.js');
    const products = await getProducts();

    expect(products).toHaveLength(1);
    expect(products[0]!.paymentLink).toBe('https://buy.stripe.com/test_abc');
  });

  // --- API contracts ---

  it('passes correct params to products.list', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(makeAsyncIterable([]));

    const { getProducts } = await import('../../src/lib/stripe.js');
    await getProducts();

    expect(mocks.productsListMock).toHaveBeenCalledWith({
      active: true,
      expand: ['data.default_price'],
    });
  });

  it('passes correct params to paymentLinks.list', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    const mocks = await setupDefaultMocks();
    mocks.productsListMock.mockReturnValue(makeAsyncIterable([]));

    const { getProducts } = await import('../../src/lib/stripe.js');
    await getProducts();

    expect(mocks.paymentLinksListMock).toHaveBeenCalledWith({
      active: true,
    });
  });
});
