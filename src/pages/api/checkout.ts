import type { APIRoute } from 'astro';
import { loadConfig } from '../../lib/storefront/config.js';
import { loadCatalog } from '../../lib/catalog/csv.js';
import { parseCheckoutRequest, buildLineItems } from '../../lib/cart/checkout.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../../lib/storefront/pricing.js';
import Stripe from 'stripe';

export const POST: APIRoute = async ({ request, url }) => {
  const config = await loadConfig();
  const catalog = await loadCatalog();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const parsed = parseCheckoutRequest(body);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
  }

  const minCartSizeRaw = config.minCartSize != null
    ? decimalToRawPrice(config.minCartSize, DEFAULT_CURRENCY)
    : undefined;

  const built = buildLineItems(parsed.items, catalog, config.wholesaleMargin, minCartSizeRaw);
  if (!built.ok) {
    return new Response(JSON.stringify({ error: built.error }), { status: 400 });
  }

  const stripeKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
  if (config.shippingFlat != null) {
    const freeThresholdRaw = config.shippingFreeThreshold != null
      ? decimalToRawPrice(config.shippingFreeThreshold, DEFAULT_CURRENCY)
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
            amount: decimalToRawPrice(config.shippingFlat, DEFAULT_CURRENCY),
            currency: DEFAULT_CURRENCY,
          },
          display_name: 'Standard Shipping',
        },
      });
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: built.lineItems,
      shipping_options: shippingOptions.length > 0 ? shippingOptions : undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: `${url.origin}/success`,
      cancel_url: `${url.origin}/cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
