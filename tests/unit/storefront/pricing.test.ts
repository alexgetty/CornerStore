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

describe('decimalToRawPrice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('converts dollars to cents for USD', async () => {
    const { decimalToRawPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(decimalToRawPrice(19.99, 'usd')).toBe(1999);
  });

  it('converts whole dollar amount', async () => {
    const { decimalToRawPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(decimalToRawPrice(5, 'usd')).toBe(500);
  });

  it('handles zero-decimal currencies like JPY', async () => {
    const { decimalToRawPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(decimalToRawPrice(1000, 'jpy')).toBe(1000);
  });

  it('rounds to avoid floating point issues', async () => {
    const { decimalToRawPrice } = await import(
      '../../../src/lib/storefront/pricing.js'
    );
    expect(decimalToRawPrice(19.999, 'usd')).toBe(2000);
  });
});

