import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('stripe', () => {
  const MockStripe = vi.fn(() => ({ mock: true }));
  return { default: MockStripe };
});

describe('getStripeClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('passes STRIPE_SECRET_KEY to Stripe constructor', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc123');
    const Stripe = vi.mocked((await import('stripe')).default);

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );
    getStripeClient();

    expect(Stripe).toHaveBeenCalledWith('sk_test_abc123');
  });

  it('returns a Stripe instance', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_abc123');

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const client = getStripeClient();

    expect(client).toBeDefined();
  });

  it('throws StripeSetupError when key is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    expect(() => getStripeClient()).toThrow(StripeSetupError);
    expect(() => getStripeClient()).toThrow('STRIPE_SECRET_KEY');
  });

  it('throws StripeSetupError when key is empty string', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    expect(() => getStripeClient()).toThrow(StripeSetupError);
  });

  it('throws StripeSetupError when key does not start with sk_', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'pk_test_abc123');

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );
    const { StripeSetupError } = await import(
      '../../../src/lib/stripe/index.js'
    );

    expect(() => getStripeClient()).toThrow(StripeSetupError);
    expect(() => getStripeClient()).toThrow(/sk_/);
  });

  it('includes guidance for missing key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined as unknown as string);

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      getStripeClient();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const error = err as { guidance: string; message: string };
      expect(error.guidance).toBe('#missing-api-key');
      expect(error.message).toContain('SETUP.md');
    }
  });

  it('includes guidance for invalid key format', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'pk_test_abc123');

    const { getStripeClient } = await import(
      '../../../src/lib/stripe/index.js'
    );

    try {
      getStripeClient();
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const error = err as { guidance: string; message: string };
      expect(error.guidance).toBe('#invalid-key-format');
      expect(error.message).toContain('SETUP.md');
    }
  });
});
