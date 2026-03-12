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
