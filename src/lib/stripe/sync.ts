import type Stripe from 'stripe';
import type { CatalogProduct } from '../catalog/types.js';
import { decimalToRawPrice } from '../storefront/pricing.js';
import { withRetry } from './retry.js';

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

export interface DiffEntry {
  sku: string;
  product: CatalogProduct;
}

export interface UpdateEntry {
  sku: string;
  product: CatalogProduct;
  existing: StripeProductState;
  changes: string[];
}

export interface OrphanEntry {
  sku: string;
  state: StripeProductState;
}

export interface SyncResult {
  links: Map<string, string>;
  errors: { sku: string; error: unknown }[];
}

export interface CatalogDiffResult {
  toAdd: DiffEntry[];
  toUpdate: UpdateEntry[];
  orphaned: OrphanEntry[];
}

export interface ReadStripeResult {
  state: StripeState;
  incompleteSkus: Map<string, string>;
}

export async function readStripeState(stripe: Stripe): Promise<ReadStripeResult> {
  return withRetry(async () => {
    const state: StripeState = new Map();
    const incompleteSkus = new Map<string, string>();

    for await (const product of stripe.products.list({ active: true, expand: ['data.default_price'] })) {
      const sku = product.metadata?.sku;
      if (!sku) continue;

      const defaultPrice = product.default_price as Stripe.Price | null;
      if (!defaultPrice || typeof defaultPrice === 'string') {
        incompleteSkus.set(sku, product.id);
        continue;
      }

      state.set(sku, {
        productId: product.id,
        name: product.name,
        description: product.description || null,
        priceId: defaultPrice.id,
        unitAmount: defaultPrice.unit_amount ?? 0,
        currency: defaultPrice.currency,
        paymentLinkId: product.metadata?.payment_link_id ?? null,
        paymentLinkUrl: product.metadata?.payment_link_url ?? null,
      });
    }

    return { state, incompleteSkus };
  });
}

export function catalogDiff(
  catalog: CatalogProduct[],
  stripeState: StripeState,
  currency: string,
): CatalogDiffResult {
  const toAdd: DiffEntry[] = [];
  const toUpdate: UpdateEntry[] = [];

  const catalogSkus = new Set(catalog.map((p) => p.sku));

  for (const product of catalog) {
    const existing = stripeState.get(product.sku);
    if (!existing) {
      toAdd.push({ sku: product.sku, product });
      continue;
    }

    const changes: string[] = [];
    if (existing.name !== product.name) changes.push('name');
    if (existing.description !== (product.description ?? null)) changes.push('description');
    if (existing.currency !== currency) changes.push('currency');
    const expectedAmount = decimalToRawPrice(product.price, currency);
    if (existing.unitAmount !== expectedAmount) changes.push('price');
    if (changes.length > 0) {
      toUpdate.push({ sku: product.sku, product, existing, changes });
    }
  }

  const orphaned: OrphanEntry[] = [];
  for (const [sku, state] of stripeState) {
    if (!catalogSkus.has(sku)) {
      orphaned.push({ sku, state });
    }
  }

  return { toAdd, toUpdate, orphaned };
}

export async function catalogAdd(
  stripe: Stripe,
  toAdd: DiffEntry[],
  currency: string,
  incompleteSkus: Map<string, string> = new Map(),
): Promise<SyncResult> {
  const newLinks = new Map<string, string>();
  const errors: { sku: string; error: unknown }[] = [];

  for (const entry of toAdd) {
    try {
      let productId: string;

      if (incompleteSkus.has(entry.sku)) {
        productId = incompleteSkus.get(entry.sku)!;
        console.log(`[Sync] Resuming incomplete product: ${entry.sku}`);
      } else {
        const product = await withRetry(() => stripe.products.create({
          name: entry.product.name,
          description: entry.product.description ?? undefined,
          metadata: { sku: entry.sku },
        }));
        productId = product.id;
      }

      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const price = await withRetry(() => stripe.prices.create({
        product: productId,
        unit_amount: rawPrice,
        currency,
      }));

      const link = await withRetry(() => stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
      }));

      const updatePayload: Record<string, unknown> = {
        default_price: price.id,
        'metadata[sku]': entry.sku,
        'metadata[payment_link_id]': link.id,
        'metadata[payment_link_url]': link.url,
      };
      newLinks.set(entry.sku, link.url);

      await withRetry(() => stripe.products.update(productId, updatePayload));

      console.log(`[Sync] Created: ${entry.sku} — ${entry.product.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Sync] Failed to create ${entry.sku}: ${message}`);
      errors.push({ sku: entry.sku, error: err });
      continue;
    }
  }

  return { links: newLinks, errors };
}

export async function catalogUpdate(
  stripe: Stripe,
  toUpdate: UpdateEntry[],
  currency: string,
): Promise<SyncResult> {
  const updatedLinks = new Map<string, string>();
  const errors: { sku: string; error: unknown }[] = [];

  for (const entry of toUpdate) {
    try {
      const productUpdate: Record<string, unknown> = {};

      if (entry.changes.includes('name')) productUpdate.name = entry.product.name;
      if (entry.changes.includes('description')) productUpdate.description = entry.product.description ?? '';

      const priceChanged = entry.changes.includes('price');

      if (priceChanged) {
        const rawPrice = decimalToRawPrice(entry.product.price, currency);
        const newPrice = await withRetry(() => stripe.prices.create({
          product: entry.existing.productId,
          unit_amount: rawPrice,
          currency,
        }));
        await withRetry(() => stripe.prices.update(entry.existing.priceId, { active: false }));
        productUpdate.default_price = newPrice.id;

        if (entry.existing.paymentLinkId) {
          await withRetry(() => stripe.paymentLinks.update(entry.existing.paymentLinkId!, { active: false }));
        }

        const newLink = await withRetry(() => stripe.paymentLinks.create({
          line_items: [{ price: newPrice.id, quantity: 1 }],
        }));

        productUpdate['metadata[sku]'] = entry.sku;
        productUpdate['metadata[payment_link_id]'] = newLink.id;
        productUpdate['metadata[payment_link_url]'] = newLink.url;

        updatedLinks.set(entry.sku, newLink.url);
        console.log(`[Sync] Updated: ${entry.sku} — price changed, new Payment Link created`);
      } else {
        console.log(`[Sync] Updated: ${entry.sku} — ${entry.changes.join(', ')}`);
      }

      if (Object.keys(productUpdate).length > 0) {
        await withRetry(() => stripe.products.update(entry.existing.productId, productUpdate));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Sync] Failed to update ${entry.sku}: ${message}`);
      errors.push({ sku: entry.sku, error: err });
      continue;
    }
  }

  return { links: updatedLinks, errors };
}

