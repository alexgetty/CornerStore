import { loadCatalog } from '../catalog/csv.js';
import { updateCatalogPaymentLinks } from '../catalog/csv-writer.js';
import { getStripeClient } from './client.js';
import { readStripeState, catalogDiff, catalogAdd, catalogUpdate } from './sync.js';
import { DEFAULT_CURRENCY, formatPrice, decimalToRawPrice } from '../storefront/pricing.js';

export async function runCatalogSync(mode: 'diff' | 'add' | 'update' | 'sync'): Promise<void> {
  const catalog = await loadCatalog();
  const stripe = getStripeClient();
  const currency = DEFAULT_CURRENCY;

  const { state, incompleteSkus } = await readStripeState(stripe);
  const diff = catalogDiff(catalog, state, currency);

  if (mode === 'diff') {
    if (diff.toAdd.length > 0) {
      console.log(`\nNew products (${diff.toAdd.length}):`);
      for (const entry of diff.toAdd) {
        const type = entry.product.storefront ? 'storefront' : 'order sheet';
        console.log(`  + ${entry.sku}: ${entry.product.name} — ${formatPrice(decimalToRawPrice(entry.product.price, currency), currency)} (${type})`);
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
  const allErrors: { sku: string; error: unknown }[] = [];

  if (mode === 'add' || mode === 'sync') {
    if (diff.toAdd.length > 0) {
      const result = await catalogAdd(stripe, diff.toAdd, currency, incompleteSkus);
      for (const [sku, url] of result.links) allUpdatedLinks.set(sku, url);
      allErrors.push(...result.errors);
    } else {
      console.log('[Sync] No new products to add.');
    }
  }

  if (mode === 'update' || mode === 'sync') {
    if (diff.toUpdate.length > 0) {
      const result = await catalogUpdate(stripe, diff.toUpdate, currency);
      for (const [sku, url] of result.links) allUpdatedLinks.set(sku, url);
      allErrors.push(...result.errors);
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

  if (allErrors.length > 0) {
    const skus = allErrors.map((e) => e.sku);
    for (const e of allErrors) {
      const message = e.error instanceof Error ? e.error.message : String(e.error);
      console.error(`[Sync] Error: ${e.sku}: ${message}`);
    }
    throw new Error(`[Sync] ${allErrors.length} SKUs failed: ${skus.join(', ')}`);
  }
}
