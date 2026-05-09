import type { CatalogProduct } from '../catalog/types.js';
import { decimalToRawPrice, DEFAULT_CURRENCY, formatPrice } from '../storefront/pricing.js';
import { validateQuantity, MAX_QUANTITY } from '../validation/quantity.js';

export interface CheckoutItem {
  sku: string;
  quantity: number;
}

export const MAX_ATTEMPT_ID_LENGTH = 128;

type ParseResult =
  | { ok: true; items: CheckoutItem[]; attemptId: string }
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
    if (rec.quantity > MAX_QUANTITY) {
      return { ok: false, error: `Quantity ${rec.quantity} exceeds maximum of ${MAX_QUANTITY}` };
    }
    items.push({ sku: rec.sku, quantity: rec.quantity });
  }

  if (typeof obj.attemptId !== 'string' || obj.attemptId.length === 0) {
    return { ok: false, error: 'attemptId is required' };
  }
  if (obj.attemptId.length > MAX_ATTEMPT_ID_LENGTH) {
    return { ok: false, error: 'attemptId exceeds maximum length' };
  }

  return { ok: true, items, attemptId: obj.attemptId };
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

    if (product.hidden) {
      return { ok: false, error: `Unavailable SKU: ${item.sku}` };
    }
    if (product.status) {
      return { ok: false, error: `Unavailable SKU: ${item.sku} (${product.status})` };
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
    return {
      ok: false,
      error: `${formatPrice(minCartSizeRaw, DEFAULT_CURRENCY)} minimum, ${formatPrice(minCartSizeRaw - subtotal, DEFAULT_CURRENCY)} to go`,
    };
  }

  return { ok: true, lineItems, subtotal };
}
