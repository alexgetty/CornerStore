import type { CatalogProduct } from '../catalog/types.js';
import { loadCatalog } from '../catalog/csv.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';
import { loadConfig } from '../storefront/config.js';
import { validateQuantity } from '../validation/quantity.js';
import Stripe from 'stripe';

export interface CheckoutItem {
  sku: string;
  quantity: number;
}

type ParseResult =
  | { ok: true; items: CheckoutItem[] }
  | { ok: false; error: string };

export function parseCheckoutRequest(body: unknown): ParseResult {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    return { ok: false, error: 'Items array is required and must not be empty' };
  }

  const items: CheckoutItem[] = [];
  for (const raw of obj.items) {
    if (raw === null || typeof raw !== 'object') {
      return { ok: false, error: 'Each item must be an object' };
    }
    const rec = raw as Record<string, unknown>;
    if (typeof rec.sku !== 'string' || !rec.sku) {
      return { ok: false, error: 'Each item must have a sku string' };
    }
    if (typeof rec.quantity !== 'number' || rec.quantity <= 0 || !Number.isInteger(rec.quantity)) {
      return { ok: false, error: 'Each item must have a positive integer quantity' };
    }
    items.push({ sku: rec.sku, quantity: rec.quantity });
  }

  return { ok: true, items };
}

interface StripeLineItem {
  price_data: {
    currency: string;
    product_data: { name: string };
    unit_amount: number;
  };
  quantity: number;
}

type BuildResult =
  | { ok: true; lineItems: StripeLineItem[]; subtotal: number }
  | { ok: false; error: string };

export function buildLineItems(
  items: CheckoutItem[],
  catalog: CatalogProduct[],
  wholesaleMargin: number | undefined,
  minCartSizeRaw?: number,
): BuildResult {
  const lineItems: StripeLineItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = catalog.find((p) => p.sku === item.sku);
    if (!product) {
      return { ok: false, error: `Unknown SKU: ${item.sku}` };
    }

    if (!validateQuantity(item.quantity, product.moq)) {
      return { ok: false, error: `${item.sku}: minimum order quantity is ${product.moq}` };
    }

    const rawPrice = decimalToRawPrice(product.price, DEFAULT_CURRENCY);
    const unitAmount = wholesaleMargin != null
      ? Math.round(rawPrice * wholesaleMargin)
      : rawPrice;

    subtotal += unitAmount * item.quantity;

    lineItems.push({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: { name: product.name },
        unit_amount: unitAmount,
      },
      quantity: item.quantity,
    });
  }

  if (minCartSizeRaw != null && subtotal < minCartSizeRaw) {
    return { ok: false, error: 'Minimum order total not met' };
  }

  return { ok: true, lineItems, subtotal };
}

export function createCheckoutHandler(stripeKey: string) {
  return async (body: unknown, origin: string): Promise<Response> => {
    const config = await loadConfig();
    const catalog = await loadCatalog();

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
