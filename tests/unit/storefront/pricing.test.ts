import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('formatPrice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('formats USD cents to dollars', async () => {
    const { formatPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(formatPrice(1999, 'usd')).toBe('$19.99');
  });

  it('formats GBP cents to pounds', async () => {
    const { formatPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(formatPrice(1999, 'gbp')).toBe('£19.99');
  });

  it('formats JPY as zero-decimal currency', async () => {
    const { formatPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(formatPrice(1999, 'jpy')).toBe('¥1,999');
  });

  it('formats zero amount', async () => {
    const { formatPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(formatPrice(0, 'usd')).toBe('$0.00');
  });

  it('treats null amount as zero', async () => {
    const { formatPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(formatPrice(null, 'usd')).toBe('$0.00');
  });
});

describe('rawPriceToDecimal', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('converts USD cents to decimal dollars', async () => {
    const { rawPriceToDecimal } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(rawPriceToDecimal(1999, 'usd')).toBe(19.99);
  });

  it('returns raw value for JPY (zero-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(rawPriceToDecimal(1999, 'jpy')).toBe(1999);
  });

  it('returns raw value for VND (zero-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(rawPriceToDecimal(50000, 'vnd')).toBe(50000);
  });

  it('divides by 1000 for BHD (three-decimal currency)', async () => {
    const { rawPriceToDecimal } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(rawPriceToDecimal(1500, 'bhd')).toBe(1.5);
  });

  it('returns 0 for zero amount', async () => {
    const { rawPriceToDecimal } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(rawPriceToDecimal(0, 'usd')).toBe(0);
  });
});

describe('listingHasPrice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true for SingleListing', async () => {
    const { listingHasPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
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
    const { listingHasPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
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
    const { listingHasPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
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
