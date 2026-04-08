import { describe, it, expect } from 'vitest';
import { buildListing, buildBundleListing } from '../../../src/lib/storefront/listing-builders.js';
import type { StripeProductData, PaymentLink } from '../../../src/lib/storefront/types.js';

function makeProduct(overrides: Partial<StripeProductData> = {}): StripeProductData {
  return {
    name: 'Test Product',
    description: 'A test product',
    image: 'https://example.com/img.jpg',
    imageAlt: '',
    rawPrice: 1999,
    currency: 'usd',
    ...overrides,
  };
}

function makeLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'plink_abcd',
    url: 'https://buy.stripe.com/test',
    ...overrides,
  };
}

describe('buildListing', () => {
  it('returns SingleListing with correct fields', () => {
    const product = makeProduct();
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result).toEqual({
      kind: 'single',
      name: 'Test Product',
      description: 'A test product',
      image: 'https://example.com/img.jpg',
      imageAlt: '',
      price: '$19.99',
      rawPrice: 1999,
      currency: 'usd',
      paymentLink: 'https://buy.stripe.com/test',
    });
  });

  it('formats price using currency', () => {
    const product = makeProduct({ rawPrice: 1000, currency: 'gbp' });
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.price).toBe('£10.00');
  });

  it('passes through product imageAlt', () => {
    const product = makeProduct({ imageAlt: 'A lovely candle' });
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.imageAlt).toBe('A lovely candle');
  });

  it('uses link url as paymentLink', () => {
    const product = makeProduct();
    const link = makeLink({ url: 'https://buy.stripe.com/custom' });

    const result = buildListing(product, link);

    expect(result.paymentLink).toBe('https://buy.stripe.com/custom');
  });

  it('passes through null description', () => {
    const product = makeProduct({ description: null });
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.description).toBeNull();
  });

  it('passes through null image', () => {
    const product = makeProduct({ image: null });
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.image).toBeNull();
  });

  it('applies config title override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', title: 'Custom Name' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Custom Name');
  });

  it('applies config description override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', description: 'Custom description' };

    const result = buildListing(product, link, config);

    expect(result.description).toBe('Custom description');
  });

  it('applies config image override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image: '/listings/my-product/hero.jpg' };

    const result = buildListing(product, link, config);

    expect(result.image).toBe('/listings/my-product/hero.jpg');
  });

  it('applies config image_alt override', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image_alt: 'A beautiful product' };

    const result = buildListing(product, link, config);

    expect(result.imageAlt).toBe('A beautiful product');
  });

  it('uses Stripe data when config has no overrides', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Test Product');
    expect(result.description).toBe('A test product');
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.imageAlt).toBe('');
  });

  it('uses Stripe data when no config provided', () => {
    const product = makeProduct();
    const link = makeLink();

    const result = buildListing(product, link);

    expect(result.name).toBe('Test Product');
    expect(result.description).toBe('A test product');
  });

  it('partial config only overrides specified fields', () => {
    const product = makeProduct();
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', title: 'Custom Name' };

    const result = buildListing(product, link, config);

    expect(result.name).toBe('Custom Name');
    expect(result.description).toBe('A test product');
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.imageAlt).toBe('');
  });
});

describe('buildBundleListing', () => {
  it('auto-generates description listing products alphabetically', () => {
    const products = [
      makeProduct({ name: 'Zebra' }),
      makeProduct({ name: 'Alpha' }),
    ];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.description).toBe('This bundle includes: Alpha, Zebra');
  });

  it('uses image from alphabetically first product', () => {
    const products = [
      makeProduct({ name: 'Zebra', image: 'https://example.com/zebra.jpg' }),
      makeProduct({ name: 'Alpha', image: 'https://example.com/alpha.jpg' }),
    ];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.image).toBe('https://example.com/alpha.jpg');
  });

  it('falls back to next product image when alpha-first has none', () => {
    const products = [
      makeProduct({ name: 'Alpha', image: null }),
      makeProduct({ name: 'Beta', image: 'https://example.com/beta.jpg' }),
    ];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.image).toBe('https://example.com/beta.jpg');
  });

  it('returns null image when no products have images', () => {
    const products = [
      makeProduct({ name: 'A', image: null }),
      makeProduct({ name: 'B', image: null }),
    ];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.image).toBeNull();
  });

  it('uses suffix from last 4 chars of link ID', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink({ id: 'plink_xyzw' });

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.suffix).toBe('xyzw');
  });

  it('sets imageAlt from config', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image_alt: 'Bundle image' };

    const { bundle } = buildBundleListing(products, link, config);

    expect(bundle.imageAlt).toBe('Bundle image');
  });

  it('sets empty imageAlt when no config', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.imageAlt).toBe('');
  });

  it('sets empty imageAlt when config has no image_alt', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', title: 'My Bundle' };

    const { bundle } = buildBundleListing(products, link, config);

    expect(bundle.imageAlt).toBe('');
  });

  it('sums prices when all same currency', () => {
    const products = [
      makeProduct({ rawPrice: 1000, currency: 'usd' }),
      makeProduct({ name: 'B', rawPrice: 500, currency: 'usd' }),
    ];
    const link = makeLink();

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.price).toBe('$15.00');
    expect(bundle.rawPrice).toBe(1500);
    expect(bundle.currency).toBe('usd');
  });

  it('returns null price with warning when mixed currencies', () => {
    const products = [
      makeProduct({ rawPrice: 1000, currency: 'usd' }),
      makeProduct({ name: 'B', rawPrice: 500, currency: 'gbp' }),
    ];
    const link = makeLink({ url: 'https://buy.stripe.com/mix' });

    const { bundle, warnings } = buildBundleListing(products, link, undefined);

    expect(bundle.price).toBeNull();
    expect(bundle.rawPrice).toBeNull();
    expect(bundle.currency).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toContain('mixed currencies');
    expect(warnings[0]!.linkUrl).toBe('https://buy.stripe.com/mix');
  });

  it('returns empty warnings when no issues', () => {
    const products = [
      makeProduct({ rawPrice: 1000 }),
      makeProduct({ name: 'B', rawPrice: 500 }),
    ];
    const link = makeLink();

    const { warnings } = buildBundleListing(products, link, undefined);

    expect(warnings).toHaveLength(0);
  });

  it('uses config description when provided', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', description: 'Custom description' };

    const { bundle } = buildBundleListing(products, link, config);

    expect(bundle.description).toBe('Custom description');
  });

  it('uses config image when provided', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink();
    const config = { link: 'https://buy.stripe.com/test', image: '/listings/custom.jpg' };

    const { bundle } = buildBundleListing(products, link, config);

    expect(bundle.image).toBe('/listings/custom.jpg');
  });

  it('stores config and linkId on PendingBundle', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink({ id: 'plink_test123' });
    const config = { link: 'https://buy.stripe.com/test' };

    const { bundle } = buildBundleListing(products, link, config);

    expect(bundle.config).toBe(config);
    expect(bundle.linkId).toBe('plink_test123');
  });

  it('uses link url as paymentLink', () => {
    const products = [makeProduct(), makeProduct({ name: 'B' })];
    const link = makeLink({ url: 'https://buy.stripe.com/custom' });

    const { bundle } = buildBundleListing(products, link, undefined);

    expect(bundle.paymentLink).toBe('https://buy.stripe.com/custom');
  });
});
