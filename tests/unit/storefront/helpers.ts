import { vi } from 'vitest';

export function makeAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

export async function getStripeMock() {
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

export function makePaymentLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plink_123',
    url: 'https://buy.stripe.com/test_abc',
    ...overrides,
  };
}

export function makeLineItem(overrides: Record<string, unknown> = {}) {
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
export function makeStripeError(type: string, message: string): Error & { type: string } {
  const err = new Error(message) as Error & { type: string };
  err.type = type;
  return err;
}

/**
 * Creates an async iterable that throws on iteration.
 * Simulates Stripe SDK errors during auto-pagination.
 */
export function makeThrowingAsyncIterable(error: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      throw error;
    },
  };
}

export async function getFsMock() {
  const fs = await import('node:fs/promises');
  return {
    readdirMock: vi.mocked(fs.readdir),
    readFileMock: vi.mocked(fs.readFile),
    copyFileMock: vi.mocked(fs.copyFile),
    mkdirMock: vi.mocked(fs.mkdir),
  };
}

export function makeDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir };
}

export async function getMatterMock() {
  const matterModule = await import('gray-matter');
  return vi.mocked(matterModule.default);
}

/**
 * Sets up mocks with a standard single-product payment link.
 * Returns the mocks for further customization.
 */
export async function setupDefaultMocks() {
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
