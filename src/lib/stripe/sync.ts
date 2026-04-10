import type Stripe from 'stripe';
import type { CatalogProduct } from '../catalog/types.js';
import { decimalToRawPrice } from '../storefront/pricing.js';
import { loadCatalog } from '../catalog/csv.js';
import { updateCatalogPaymentLinks } from '../catalog/csv-writer.js';
import { getStripeClient } from './client.js';

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

export interface CatalogDiffResult {
  toAdd: DiffEntry[];
  toUpdate: UpdateEntry[];
  orphaned: OrphanEntry[];
}

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

export function catalogDiff(
  catalog: CatalogProduct[],
  stripeState: StripeState,
  currency: string,
): CatalogDiffResult {
  const toAdd: DiffEntry[] = [];
  const toUpdate: UpdateEntry[] = [];

  const storefrontProducts = catalog.filter((p) => p.storefront);
  const catalogSkus = new Set(storefrontProducts.map((p) => p.sku));

  for (const product of storefrontProducts) {
    const existing = stripeState.get(product.sku);
    if (!existing) {
      toAdd.push({ sku: product.sku, product });
      continue;
    }

    const changes: string[] = [];
    if (existing.name !== product.name) changes.push('name');
    if (existing.description !== (product.description ?? null)) changes.push('description');
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
): Promise<Map<string, string>> {
  const newLinks = new Map<string, string>();

  for (const entry of toAdd) {
    const product = await stripe.products.create({
      name: entry.product.name,
      description: entry.product.description ?? undefined,
      metadata: { sku: entry.sku },
    });

    const rawPrice = decimalToRawPrice(entry.product.price, currency);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: rawPrice,
      currency,
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });

    await stripe.products.update(product.id, {
      metadata: { sku: entry.sku, payment_link_id: link.id, payment_link_url: link.url },
      default_price: price.id,
    });

    newLinks.set(entry.sku, link.url);
    console.log(`[Sync] Created: ${entry.sku} — ${entry.product.name}`);
  }

  return newLinks;
}

export async function catalogUpdate(
  stripe: Stripe,
  toUpdate: UpdateEntry[],
  currency: string,
): Promise<Map<string, string>> {
  const updatedLinks = new Map<string, string>();

  for (const entry of toUpdate) {
    const productUpdate: Record<string, unknown> = {};

    if (entry.changes.includes('name')) productUpdate.name = entry.product.name;
    if (entry.changes.includes('description')) productUpdate.description = entry.product.description ?? '';

    const priceChanged = entry.changes.includes('price');

    if (priceChanged) {
      const rawPrice = decimalToRawPrice(entry.product.price, currency);
      const newPrice = await stripe.prices.create({
        product: entry.existing.productId,
        unit_amount: rawPrice,
        currency,
      });
      productUpdate.default_price = newPrice.id;

      if (entry.existing.paymentLinkId) {
        await stripe.paymentLinks.update(entry.existing.paymentLinkId, { active: false });
      }

      const newLink = await stripe.paymentLinks.create({
        line_items: [{ price: newPrice.id, quantity: 1 }],
      });

      productUpdate.metadata = {
        sku: entry.sku,
        payment_link_id: newLink.id,
        payment_link_url: newLink.url,
      };

      updatedLinks.set(entry.sku, newLink.url);
      console.log(`[Sync] Updated: ${entry.sku} — price changed, new Payment Link created`);
    } else {
      console.log(`[Sync] Updated: ${entry.sku} — ${entry.changes.join(', ')}`);
    }

    if (Object.keys(productUpdate).length > 0) {
      await stripe.products.update(entry.existing.productId, productUpdate);
    }
  }

  return updatedLinks;
}

export async function runCatalogSync(mode: 'diff' | 'add' | 'update' | 'sync'): Promise<void> {
  const catalog = await loadCatalog();
  const stripe = getStripeClient();
  const currency = 'usd';

  const state = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);

  if (mode === 'diff') {
    if (diff.toAdd.length > 0) {
      console.log(`\nNew products (${diff.toAdd.length}):`);
      for (const entry of diff.toAdd) {
        console.log(`  + ${entry.sku}: ${entry.product.name} — $${entry.product.price}`);
      }
    }
    if (diff.toUpdate.length > 0) {
      console.log(`\nProducts to update (${diff.toUpdate.length}):`);
      for (const entry of diff.toUpdate) {
        console.log(`  ~ ${entry.sku}: ${entry.changes.join(', ')}`);
      }
    }
    if (diff.orphaned.length > 0) {
      console.log(`\nOrphaned in Stripe (${diff.orphaned.length}):`);
      for (const entry of diff.orphaned) {
        console.log(`  ? ${entry.sku}: ${entry.state.name}`);
      }
    }
    if (diff.toAdd.length === 0 && diff.toUpdate.length === 0 && diff.orphaned.length === 0) {
      console.log('\nEverything is in sync.');
    }
    return;
  }

  const allUpdatedLinks = new Map<string, string>();

  if (mode === 'add' || mode === 'sync') {
    if (diff.toAdd.length > 0) {
      const newLinks = await catalogAdd(stripe, diff.toAdd, currency);
      for (const [sku, url] of newLinks) allUpdatedLinks.set(sku, url);
    } else {
      console.log('[Sync] No new products to add.');
    }
  }

  if (mode === 'update' || mode === 'sync') {
    if (diff.toUpdate.length > 0) {
      const updatedLinks = await catalogUpdate(stripe, diff.toUpdate, currency);
      for (const [sku, url] of updatedLinks) allUpdatedLinks.set(sku, url);
    } else {
      console.log('[Sync] No products to update.');
    }
  }

  if (allUpdatedLinks.size > 0) {
    await updateCatalogPaymentLinks(allUpdatedLinks);
    console.log(`[Sync] Wrote ${allUpdatedLinks.size} Payment Link URL${allUpdatedLinks.size === 1 ? '' : 's'} back to catalog.csv`);
  }

  if (diff.orphaned.length > 0) {
    console.log(`[Sync] Warning: ${diff.orphaned.length} Stripe product${diff.orphaned.length === 1 ? '' : 's'} not in catalog:`);
    for (const entry of diff.orphaned) {
      console.log(`  ? ${entry.sku}: ${entry.state.name}`);
    }
  }
}
