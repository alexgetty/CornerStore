import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tests that exercise timer-based backoff use fake timers.
describe('withRetry (fake timers)', () => {
  let withRetry: typeof import('../../../src/lib/stripe/retry.js').withRetry;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ withRetry } = await import('../../../src/lib/stripe/retry.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff (500ms, 1000ms)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);

    await promise;
  });
});

// Tests that don't require timer-dependent backoff use real timers with 0ms delay.
describe('withRetry (real timers, 0ms delay)', () => {
  let withRetry: typeof import('../../../src/lib/stripe/retry.js').withRetry;

  beforeEach(async () => {
    vi.resetModules();
    ({ withRetry } = await import('../../../src/lib/stripe/retry.js'));
  });

  it('throws last error after max attempts exhausted', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('permanent'))
      .mockRejectedValueOnce(new Error('permanent'))
      .mockRejectedValueOnce(new Error('permanent'));

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail'));

    await expect(withRetry(fn, 1, 0)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not delay after final failed attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'));

    const start = Date.now();
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('fail');
    // With 0ms base delay the whole thing completes near-instantly —
    // confirms no extra delay is inserted after the final attempt.
    expect(Date.now() - start).toBeLessThan(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws meaningful error when maxAttempts < 1', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    let thrown: unknown;
    try {
      await withRetry(fn, 0, 0);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('maxAttempts must be >= 1');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not retry StripeAuthenticationError', async () => {
    const err = new Error('auth failed');
    (err as unknown as { type: string }).type = 'StripeAuthenticationError';
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('auth failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry StripeInvalidRequestError', async () => {
    const err = new Error('invalid request');
    (err as unknown as { type: string }).type = 'StripeInvalidRequestError';
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('invalid request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry StripePermissionError', async () => {
    const err = new Error('no permission');
    (err as unknown as { type: string }).type = 'StripePermissionError';
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('no permission');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries StripeConnectionError then succeeds', async () => {
    const err = new Error('connection lost');
    (err as unknown as { type: string }).type = 'StripeConnectionError';
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries StripeRateLimitError then succeeds', async () => {
    const err = new Error('rate limited');
    (err as unknown as { type: string }).type = 'StripeRateLimitError';
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries StripeAPIError then succeeds', async () => {
    const err = new Error('stripe internal');
    (err as unknown as { type: string }).type = 'StripeAPIError';
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries generic error without type property then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
