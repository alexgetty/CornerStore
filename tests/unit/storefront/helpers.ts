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

export async function getFsMock() {
  const fs = await import('node:fs/promises');
  return {
    readdirMock: vi.mocked(fs.readdir),
    readFileMock: vi.mocked(fs.readFile),
    copyFileMock: vi.mocked(fs.copyFile),
    mkdirMock: vi.mocked(fs.mkdir),
  };
}
