import type Stripe from 'stripe';

export interface StripeProductState {
  productId: string;
  name: string;
  description: string | null;
  priceId: string;
  unitAmount: number;
  currency: string;
  paymentLinkId: string | null;
  paymentLinkUrl: string | null;
}

export type StripeState = Map<string, StripeProductState>;

export async function readStripeState(stripe: Stripe): Promise<StripeState> {
  const state: StripeState = new Map();

  for await (const product of stripe.products.list({ active: true, expand: ['data.default_price'] })) {
    const sku = product.metadata?.sku;
    if (!sku) continue;

    const defaultPrice = product.default_price as Stripe.Price | null;
    if (!defaultPrice || typeof defaultPrice === 'string') continue;

    state.set(sku, {
      productId: product.id,
      name: product.name,
      description: product.description ?? null,
      priceId: defaultPrice.id,
      unitAmount: defaultPrice.unit_amount ?? 0,
      currency: defaultPrice.currency,
      paymentLinkId: product.metadata?.payment_link_id ?? null,
      paymentLinkUrl: product.metadata?.payment_link_url ?? null,
    });
  }

  return state;
}
