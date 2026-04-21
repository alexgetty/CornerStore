import { vi } from 'vitest';
import type { Listing } from '../../../src/lib/storefront/types.js';

export function makeAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

export function makeStripeError(type: string, message: string): Error & { type: string } {
  const err = new Error(message) as Error & { type: string };
  err.type = type;
  return err;
}

export function makeThrowingAsyncIterable(error: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      throw error;
    },
  };
}

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    description: null,
    images: [],
    price: '$19.99',
    rawPrice: 1999,
    currency: 'usd',
    category: null,
    status: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
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
