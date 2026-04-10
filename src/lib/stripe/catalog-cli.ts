import { loadCatalog } from '../catalog/csv.js';
import { updateCatalogPaymentLinks } from '../catalog/csv-writer.js';
import { getStripeClient } from './client.js';
import { readStripeState, catalogDiff, catalogAdd, catalogUpdate } from './sync.js';

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
