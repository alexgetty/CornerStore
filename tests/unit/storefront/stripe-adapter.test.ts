import { describe, it, expect } from 'vitest';
import { toProductData, toPaymentLink } from '../../../src/lib/storefront/stripe-adapter.js';
import type Stripe from 'stripe';

describe('toProductData', () => {
  it('returns StripeProductData for valid line item', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test Product',
          description: 'A test product',
          images: ['https://example.com/img.jpg'],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)).toEqual({
      name: 'Test Product',
      description: 'A test product',
      image: 'https://example.com/img.jpg',
      imageAlt: '',
      rawPrice: 1999,
      currency: 'usd',
    });
  });

  it('returns null when price is null', () => {
    const item = { price: null } as unknown as Stripe.LineItem;
    expect(toProductData(item)).toBeNull();
  });

  it('returns null when product is a string ID', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: 'prod_abc123',
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)).toBeNull();
  });

  it('returns null when product is null', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: null,
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)).toBeNull();
  });

  it('uses metadata.image_alt for imageAlt', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Candle',
          description: null,
          images: ['https://example.com/candle.jpg'],
          metadata: { image_alt: 'A hand-poured soy candle' },
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.imageAlt).toBe('A hand-poured soy candle');
  });

  it('uses empty imageAlt when metadata.image_alt is missing', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test',
          description: null,
          images: [],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.imageAlt).toBe('');
  });

  it('uses empty imageAlt when metadata.image_alt is empty string', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test',
          description: null,
          images: [],
          metadata: { image_alt: '' },
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.imageAlt).toBe('');
  });

  it('uses first image from product images array', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test',
          description: null,
          images: ['https://example.com/first.jpg', 'https://example.com/second.jpg'],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.image).toBe('https://example.com/first.jpg');
  });

  it('returns null image when product has no images', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test',
          description: null,
          images: [],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.image).toBeNull();
  });

  it('returns null description when product description is null', () => {
    const item = {
      price: {
        unit_amount: 1999,
        currency: 'usd',
        product: {
          name: 'Test',
          description: null,
          images: [],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.description).toBeNull();
  });

  it('treats null unit_amount as zero', () => {
    const item = {
      price: {
        unit_amount: null,
        currency: 'usd',
        product: {
          name: 'Free',
          description: null,
          images: [],
          metadata: {},
        },
      },
    } as unknown as Stripe.LineItem;

    expect(toProductData(item)!.rawPrice).toBe(0);
  });
});

describe('toPaymentLink', () => {
  it('extracts id and url', () => {
    const link = {
      id: 'plink_123',
      url: 'https://buy.stripe.com/test',
    } as unknown as Stripe.PaymentLink;

    expect(toPaymentLink(link)).toEqual({
      id: 'plink_123',
      url: 'https://buy.stripe.com/test',
    });
  });
});
