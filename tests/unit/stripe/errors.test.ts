import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('StripeSetupError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('extends Error', async () => {
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const err = new StripeSetupError('test message', 'test-guidance');
    expect(err).toBeInstanceOf(Error);
  });

  it('has guidance property', async () => {
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const err = new StripeSetupError('test message', '#some-section');
    expect(err.guidance).toBe('#some-section');
  });

  it('formats message with [Storefront] prefix and SETUP.md reference', async () => {
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const err = new StripeSetupError('Something broke', '#fix-it');
    expect(err.message).toContain('[Storefront]');
    expect(err.message).toContain('Something broke');
    expect(err.message).toContain('SETUP.md#fix-it');
  });

  it('preserves cause when provided', async () => {
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const original = new Error('original');
    const err = new StripeSetupError('wrapped', '#section', original);
    expect(err.cause).toBe(original);
  });

  it('has undefined cause when not provided', async () => {
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const err = new StripeSetupError('no cause', '#section');
    expect(err.cause).toBeUndefined();
  });
});

describe('wrapStripeError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each([
    ['StripeAuthenticationError', 'Invalid API key', '#invalid-api-key'],
    ['StripePermissionError', 'API key lacks required permissions', '#insufficient-permissions'],
    ['StripeConnectionError', 'Cannot reach Stripe API', '#connection-error'],
    ['StripeRateLimitError', 'Too many requests — try again shortly', '#rate-limit'],
    ['StripeInvalidRequestError', 'Invalid API request — possible SDK version mismatch', '#invalid-request'],
    ['StripeAPIError', 'Stripe internal error — try again, contact Stripe support if persistent', '#stripe-api-error'],
  ])('wraps %s into StripeSetupError with correct message and guidance', async (type, expectedMessage, expectedGuidance) => {
    const { wrapStripeError, StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const original = Object.assign(new Error(`Original: ${type}`), { type });

    try {
      wrapStripeError(original);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(StripeSetupError);
      const setupErr = err as InstanceType<typeof StripeSetupError>;
      expect(setupErr.message).toContain(expectedMessage);
      expect(setupErr.guidance).toBe(expectedGuidance);
      expect(setupErr.cause).toBe(original);
    }
  });

  it('re-throws Error with unmapped type string', async () => {
    const { wrapStripeError, StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const original = Object.assign(new Error('unknown stripe error'), { type: 'StripeUnknownError' });

    try {
      wrapStripeError(original);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe(original);
    }
  });

  it('re-throws Error without type property', async () => {
    const { wrapStripeError, StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const original = new Error('plain error');

    try {
      wrapStripeError(original);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe(original);
    }
  });

  it('re-throws Error with non-string type property', async () => {
    const { wrapStripeError, StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const original = Object.assign(new Error('numeric type'), { type: 42 });

    try {
      wrapStripeError(original);
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe(original);
    }
  });

  it('re-throws non-Error values unchanged', async () => {
    const { wrapStripeError, StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      wrapStripeError('string error');
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).not.toBeInstanceOf(StripeSetupError);
      expect(err).toBe('string error');
    }
  });
});
