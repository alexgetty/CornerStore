import { describe, it, expect } from 'vitest';
import { generateAttemptId } from '../../../src/components/Cart/attempt-id.js';

describe('generateAttemptId', () => {
  it('uses crypto.randomUUID when available', () => {
    const fakeCrypto = {
      randomUUID: () => 'uuid-from-randomUUID',
    } as unknown as Crypto;

    const id = generateAttemptId(fakeCrypto);
    expect(id).toBe('uuid-from-randomUUID');
  });

  it('falls back to crypto.getRandomValues when randomUUID is missing', () => {
    const fakeCrypto = {
      getRandomValues: <T extends ArrayBufferView>(buf: T): T => {
        const view = buf as unknown as Uint8Array;
        for (let i = 0; i < view.length; i++) view[i] = i + 1;
        return buf;
      },
    } as unknown as Crypto;

    const id = generateAttemptId(fakeCrypto);
    // 16 bytes encoded as 2-char hex each = 32 chars.
    expect(id).toBe('0102030405060708090a0b0c0d0e0f10');
  });

  it('falls back to crypto.getRandomValues when randomUUID throws', () => {
    const fakeCrypto = {
      randomUUID: () => {
        throw new Error('not a secure context');
      },
      getRandomValues: <T extends ArrayBufferView>(buf: T): T => {
        const view = buf as unknown as Uint8Array;
        view.fill(0xab);
        return buf;
      },
    } as unknown as Crypto;

    const id = generateAttemptId(fakeCrypto);
    expect(id).toBe('ab'.repeat(16));
  });

  it('falls back to Math.random when crypto is fully unavailable', () => {
    const id = generateAttemptId(undefined);
    // Last-resort path produces a non-empty string with at least one separator
    // and stays under the server-side 128-char cap.
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(128);
  });

  it('falls back to Math.random when crypto has neither randomUUID nor getRandomValues', () => {
    const fakeCrypto = {} as unknown as Crypto;

    const id = generateAttemptId(fakeCrypto);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces distinct IDs across calls in the Math.random fallback', () => {
    // Two consecutive calls must not collide. The fallback mixes Date.now and
    // multiple Math.random outputs, so collision probability is vanishingly
    // small; this test pins that we are not returning a constant.
    const a = generateAttemptId(undefined);
    const b = generateAttemptId(undefined);
    expect(a).not.toBe(b);
  });
});
