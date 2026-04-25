import { parseCheckoutRequest, buildLineItems } from './checkout.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import Stripe from 'stripe';

export interface CheckoutHandlerConfig {
  stripeKey: string;
  wholesaleMargin?: number;
  minCartSize?: number;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
}

export function createCheckoutHandler(options: CheckoutHandlerConfig) {
  // Defer Stripe initialization to first request (env vars may not be loaded at import time).
  let stripe: Stripe | null = null;
  function getStripe(): Stripe {
    if (!stripe) stripe = new Stripe(options.stripeKey);
    return stripe;
  }

  return async (body: unknown, origin: string): Promise<Response> => {
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
    }

    // Read the catalog fresh on every request. The CSV is the source of truth at checkout time;
    // a hidden SKU, price change, or new product takes effect on the next request with no
    // process restart, no cache flush, no IPC handshake with the sync CLI.
    const catalog = await loadCatalog();

    const minCartSizeRaw = options.minCartSize != null
      ? decimalToRawPrice(options.minCartSize, DEFAULT_CURRENCY)
      : undefined;

    const built = buildLineItems(parsed.items, catalog, options.wholesaleMargin, minCartSizeRaw);
    if (!built.ok) {
      return new Response(JSON.stringify({ error: built.error }), { status: 400 });
    }

    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
    if (options.shippingFlat != null) {
      const freeThresholdRaw = options.shippingFreeThreshold != null
        ? decimalToRawPrice(options.shippingFreeThreshold, DEFAULT_CURRENCY)
        : null;
      const qualifiesForFree = freeThresholdRaw != null && built.subtotal >= freeThresholdRaw;

      if (qualifiesForFree) {
        shippingOptions.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: DEFAULT_CURRENCY },
            display_name: 'Free Shipping',
          },
        });
      } else {
        shippingOptions.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: decimalToRawPrice(options.shippingFlat, DEFAULT_CURRENCY),
              currency: DEFAULT_CURRENCY,
            },
            display_name: 'Standard Shipping',
          },
        });
      }
    }

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        line_items: built.lineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
        shipping_options: shippingOptions.length > 0 ? shippingOptions : undefined,
        shipping_address_collection: { allowed_countries: ['US'] },
        success_url: `${origin}/success`,
        cancel_url: `${origin}/cancel`,
      });

      return new Response(JSON.stringify({ url: session.url }), { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout session creation failed';
      return new Response(JSON.stringify({ error: message }), { status: 500 });
    }
  };
}
