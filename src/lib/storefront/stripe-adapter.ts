import type Stripe from 'stripe';
import type { StripeProductData, PaymentLink } from './types.js';

export function toProductData(
  item: Stripe.LineItem
): StripeProductData | null {
  if (!item.price) return null;
  const price = item.price;
  const product = price.product;
  if (!product || typeof product === 'string') return null;
  const prod = product as Stripe.Product;
  const metadataAlt = prod.metadata?.image_alt;
  return {
    name: prod.name,
    description: prod.description ?? null,
    image: prod.images.length > 0 ? prod.images[0]! : null,
    imageAlt: metadataAlt || '',
    rawPrice: price.unit_amount ?? 0,
    currency: price.currency,
  };
}

export function toPaymentLink(link: Stripe.PaymentLink): PaymentLink {
  return { id: link.id, url: link.url };
}
