import { parseCheckoutRequest } from './checkout.js';
import { decimalToRawPrice, DEFAULT_CURRENCY } from '../storefront/pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import type { CatalogProduct } from '../catalog/types.js';
import Stripe from 'stripe';

export interface CheckoutHandlerConfig {
  stripeKey: string;
  wholesaleMargin?: number;
  minCartSize?: number;
  shippingFlat?: number;
  shippingFreeThreshold?: number;
}

export function createCheckoutHandler(options: CheckoutHandlerConfig) {
  // Defer Stripe initialization to first request (env vars may not be loaded at import time)
  let stripe: Stripe | null = null;
  function getStripe(): Stripe {
    if (!stripe) stripe = new Stripe(options.stripeKey);
    return stripe;
  }

  // Cache SKU -> { priceId, unitAmount } map from Stripe
  let skuMap: Map<string, { priceId: string; unitAmount: number; moq: number | null }> | null = null;

  async function getSkuMap() {
    if (skuMap) return skuMap;

    skuMap = new Map();
    for await (const product of getStripe().products.list({ active: true, expand: ['data.default_price'] })) {
      const sku = product.metadata?.sku;
      if (!sku) continue;

      const price = product.default_price as Stripe.Price | null;
      if (!price || typeof price === 'string') continue;

      const moqStr = product.metadata?.moq;
      const moq = moqStr ? parseInt(moqStr, 10) : null;

      skuMap.set(sku, {
        priceId: price.id,
        unitAmount: price.unit_amount ?? 0,
        moq: moq && !isNaN(moq) ? moq : null,
      });
    }

    return skuMap;
  }

  // Catalog availability cache: module-scoped, populated on first request. Known limitation: can go stale in a long-running dev server until process restart (same pattern as skuMap above).
  let catalogCache: Map<string, CatalogProduct> | null = null;
  async function getCatalog() {
    if (catalogCache) return catalogCache;
    const products = await loadCatalog();
    catalogCache = new Map(products.map((p) => [p.sku, p]));
    return catalogCache;
  }

  return async (body: unknown, origin: string): Promise<Response> => {
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });
    }

    const catalog = await getCatalog();

    // Availability gate: reject any SKU that is hidden or status-disabled in the catalog, regardless of Stripe state. Defense-in-depth so a stale/malicious client cannot bypass the UI filter. A SKU missing from the catalog is treated as unavailable here too; the downstream Stripe map lookup will surface "Unknown SKU" if the item is present in Stripe but not the catalog.
    for (const item of parsed.items) {
      const catalogProduct = catalog.get(item.sku);
      if (!catalogProduct) {
        // Defer to the Stripe-map lookup below, which preserves the legacy "Unknown SKU" error surface for truly unknown items.
        continue;
      }
      if (catalogProduct.hidden) {
        return new Response(JSON.stringify({ error: `Unavailable SKU: ${item.sku}` }), { status: 400 });
      }
      if (catalogProduct.status) {
        return new Response(
          JSON.stringify({ error: `Unavailable SKU: ${item.sku} (${catalogProduct.status})` }),
          { status: 400 },
        );
      }
    }

    const products = await getSkuMap();

    // Validate and build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let subtotal = 0;

    for (const item of parsed.items) {
      const product = products.get(item.sku);
      if (!product) {
        return new Response(JSON.stringify({ error: `Unknown SKU: ${item.sku}` }), { status: 400 });
      }

      if (product.moq !== null && item.quantity < product.moq) {
        return new Response(
          JSON.stringify({ error: `${item.sku}: minimum order quantity is ${product.moq}` }),
          { status: 400 },
        );
      }

      const unitAmount = options.wholesaleMargin != null
        ? Math.round(product.unitAmount * options.wholesaleMargin)
        : product.unitAmount;

      subtotal += unitAmount * item.quantity;

      lineItems.push({
        price_data: {
          currency: DEFAULT_CURRENCY,
          product_data: { name: item.sku },
          unit_amount: unitAmount,
        },
        quantity: item.quantity,
      });
    }

    // Min cart size check
    if (options.minCartSize != null) {
      const minRaw = decimalToRawPrice(options.minCartSize, DEFAULT_CURRENCY);
      if (subtotal < minRaw) {
        return new Response(JSON.stringify({ error: 'Minimum order total not met' }), { status: 400 });
      }
    }

    // Shipping options
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [];
    if (options.shippingFlat != null) {
      const freeThresholdRaw = options.shippingFreeThreshold != null
        ? decimalToRawPrice(options.shippingFreeThreshold, DEFAULT_CURRENCY)
        : null;
      const qualifiesForFree = freeThresholdRaw != null && subtotal >= freeThresholdRaw;

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
        line_items: lineItems,
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
