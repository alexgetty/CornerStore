import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from '../catalog/helpers.js';

vi.mock('../../../src/lib/catalog/csv.js', () => ({ loadCatalog: vi.fn() }));
vi.mock('../../../src/lib/catalog/csv-writer.js', () => ({ updateCatalogPaymentLinks: vi.fn() }));
vi.mock('../../../src/lib/stripe/client.js', () => ({ getStripeClient: vi.fn() }));
vi.mock('../../../src/lib/stripe/sync.js', () => ({
  readStripeState: vi.fn(),
  catalogDiff: vi.fn(),
  catalogAdd: vi.fn(),
  catalogUpdate: vi.fn(),
}));

describe('runCatalogSync', () => {
  let runCatalogSync: typeof import('../../../src/lib/stripe/catalog-cli.js').runCatalogSync;
  let loadCatalog: ReturnType<typeof vi.fn>;
  let getStripeClient: ReturnType<typeof vi.fn>;
  let readStripeState: ReturnType<typeof vi.fn>;
  let catalogDiff: ReturnType<typeof vi.fn>;
  let catalogAdd: ReturnType<typeof vi.fn>;
  let catalogUpdate: ReturnType<typeof vi.fn>;
  let updateCatalogPaymentLinks: ReturnType<typeof vi.fn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const fakeStripe = {};
  const fakeCatalog = [makeCatalogProduct()];
  const fakeIncompleteSkus = new Map<string, string>();

  const emptyDiff = { toAdd: [], toUpdate: [], orphaned: [] };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    ({ runCatalogSync } = await import('../../../src/lib/stripe/catalog-cli.js'));
    ({ loadCatalog } = await import('../../../src/lib/catalog/csv.js') as any);
    ({ getStripeClient } = await import('../../../src/lib/stripe/client.js') as any);
    ({ readStripeState, catalogDiff, catalogAdd, catalogUpdate } = await import('../../../src/lib/stripe/sync.js') as any);
    ({ updateCatalogPaymentLinks } = await import('../../../src/lib/catalog/csv-writer.js') as any);

    loadCatalog.mockResolvedValue(fakeCatalog);
    getStripeClient.mockReturnValue(fakeStripe);
    readStripeState.mockResolvedValue({ state: new Map(), incompleteSkus: fakeIncompleteSkus });
    catalogDiff.mockReturnValue(emptyDiff);
    catalogAdd.mockResolvedValue(new Map());
    catalogUpdate.mockResolvedValue(new Map());
    updateCatalogPaymentLinks.mockResolvedValue(undefined);

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ─── diff mode ───────────────────────────────────────────────────────────────

  describe('diff mode', () => {
    it('logs "Everything is in sync." when nothing differs', async () => {
      catalogDiff.mockReturnValue(emptyDiff);

      await runCatalogSync('diff');

      expect(consoleSpy).toHaveBeenCalledWith('\nEverything is in sync.');
    });

    it('logs new products with storefront type label', async () => {
      const product = makeCatalogProduct({ sku: 'NEW-001', name: 'Widget', price: 19.99, storefront: true });
      catalogDiff.mockReturnValue({ toAdd: [{ sku: 'NEW-001', product }], toUpdate: [], orphaned: [] });

      await runCatalogSync('diff');

      expect(consoleSpy).toHaveBeenCalledWith('\nNew products (1):');
      expect(consoleSpy).toHaveBeenCalledWith(`  + NEW-001: Widget — $19.99 (storefront)`);
    });

    it('logs new products with order sheet type label for non-storefront products', async () => {
      const product = makeCatalogProduct({ sku: 'BULK-001', name: 'Bulk Widget', price: 9.99, storefront: false });
      catalogDiff.mockReturnValue({ toAdd: [{ sku: 'BULK-001', product }], toUpdate: [], orphaned: [] });

      await runCatalogSync('diff');

      expect(consoleSpy).toHaveBeenCalledWith(`  + BULK-001: Bulk Widget — $9.99 (order sheet)`);
    });

    it('logs products to update with changes list', async () => {
      catalogDiff.mockReturnValue({
        toAdd: [],
        toUpdate: [{ sku: 'UPD-001', changes: ['name', 'price'] }],
        orphaned: [],
      });

      await runCatalogSync('diff');

      expect(consoleSpy).toHaveBeenCalledWith('\nProducts to update (1):');
      expect(consoleSpy).toHaveBeenCalledWith('  ~ UPD-001: name, price');
    });

    it('logs orphaned Stripe products', async () => {
      catalogDiff.mockReturnValue({
        toAdd: [],
        toUpdate: [],
        orphaned: [{ sku: 'OLD-001', state: { name: 'Discontinued' } }],
      });

      await runCatalogSync('diff');

      expect(consoleSpy).toHaveBeenCalledWith('\nOrphaned in Stripe (1):');
      expect(consoleSpy).toHaveBeenCalledWith('  ? OLD-001: Discontinued');
    });

    it('does not call catalogAdd or catalogUpdate in diff mode', async () => {
      catalogDiff.mockReturnValue({
        toAdd: [{ sku: 'X', product: makeCatalogProduct() }],
        toUpdate: [{ sku: 'Y', changes: ['name'], existing: {} }],
        orphaned: [],
      });

      await runCatalogSync('diff');

      expect(catalogAdd).not.toHaveBeenCalled();
      expect(catalogUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── add mode ────────────────────────────────────────────────────────────────

  describe('add mode', () => {
    it('calls catalogAdd with diff.toAdd and incompleteSkus when there are new products', async () => {
      const product = makeCatalogProduct({ sku: 'ADD-001' });
      const toAdd = [{ sku: 'ADD-001', product }];
      const incompleteSkus = new Map([['RESUME-001', 'prod_existing']]);
      readStripeState.mockResolvedValue({ state: new Map(), incompleteSkus });
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });
      catalogAdd.mockResolvedValue(new Map([['ADD-001', 'https://buy.stripe.com/add']]));

      await runCatalogSync('add');

      expect(catalogAdd).toHaveBeenCalledWith(fakeStripe, toAdd, 'usd', incompleteSkus);
      expect(catalogUpdate).not.toHaveBeenCalled();
    });

    it('writes payment links when catalogAdd returns links', async () => {
      const toAdd = [{ sku: 'ADD-001', product: makeCatalogProduct() }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });
      catalogAdd.mockResolvedValue(new Map([['ADD-001', 'https://buy.stripe.com/add']]));

      await runCatalogSync('add');

      expect(updateCatalogPaymentLinks).toHaveBeenCalledWith(new Map([['ADD-001', 'https://buy.stripe.com/add']]));
      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Wrote 1 Payment Link URL back to catalog.csv');
    });

    it('logs "No new products to add." when toAdd is empty', async () => {
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate: [], orphaned: [] });

      await runCatalogSync('add');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] No new products to add.');
      expect(catalogAdd).not.toHaveBeenCalled();
    });

    it('does not call catalogUpdate in add mode', async () => {
      const toUpdate = [{ sku: 'UPD-001', changes: ['name'], existing: {} }];
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate, orphaned: [] });

      await runCatalogSync('add');

      expect(catalogUpdate).not.toHaveBeenCalled();
    });

    it('does not write payment links when catalogAdd returns no links', async () => {
      const toAdd = [{ sku: 'ADD-001', product: makeCatalogProduct() }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });
      catalogAdd.mockResolvedValue(new Map());

      await runCatalogSync('add');

      expect(updateCatalogPaymentLinks).not.toHaveBeenCalled();
    });
  });

  // ─── update mode ─────────────────────────────────────────────────────────────

  describe('update mode', () => {
    it('calls catalogUpdate with diff.toUpdate when there are updates', async () => {
      const toUpdate = [{ sku: 'UPD-001', changes: ['price'], existing: {} }];
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate, orphaned: [] });
      catalogUpdate.mockResolvedValue(new Map([['UPD-001', 'https://buy.stripe.com/upd']]));

      await runCatalogSync('update');

      expect(catalogUpdate).toHaveBeenCalledWith(fakeStripe, toUpdate, 'usd');
      expect(catalogAdd).not.toHaveBeenCalled();
    });

    it('writes payment links when catalogUpdate returns links', async () => {
      const toUpdate = [{ sku: 'UPD-001', changes: ['price'], existing: {} }];
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate, orphaned: [] });
      catalogUpdate.mockResolvedValue(new Map([['UPD-001', 'https://buy.stripe.com/u1'], ['UPD-002', 'https://buy.stripe.com/u2']]));

      await runCatalogSync('update');

      expect(updateCatalogPaymentLinks).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Wrote 2 Payment Link URLs back to catalog.csv');
    });

    it('logs "No products to update." when toUpdate is empty', async () => {
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate: [], orphaned: [] });

      await runCatalogSync('update');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] No products to update.');
      expect(catalogUpdate).not.toHaveBeenCalled();
    });

    it('does not call catalogAdd in update mode', async () => {
      const toAdd = [{ sku: 'NEW-001', product: makeCatalogProduct() }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });

      await runCatalogSync('update');

      expect(catalogAdd).not.toHaveBeenCalled();
    });
  });

  // ─── sync mode ───────────────────────────────────────────────────────────────

  describe('sync mode', () => {
    it('calls both catalogAdd and catalogUpdate', async () => {
      const toAdd = [{ sku: 'ADD-001', product: makeCatalogProduct() }];
      const toUpdate = [{ sku: 'UPD-001', changes: ['name'], existing: {} }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate, orphaned: [] });
      catalogAdd.mockResolvedValue(new Map());
      catalogUpdate.mockResolvedValue(new Map());

      await runCatalogSync('sync');

      expect(catalogAdd).toHaveBeenCalled();
      expect(catalogUpdate).toHaveBeenCalled();
    });

    it('merges links from catalogAdd and catalogUpdate into a single write', async () => {
      const toAdd = [{ sku: 'ADD-001', product: makeCatalogProduct() }];
      const toUpdate = [{ sku: 'UPD-001', changes: ['price'], existing: {} }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate, orphaned: [] });
      catalogAdd.mockResolvedValue(new Map([['ADD-001', 'https://buy.stripe.com/add']]));
      catalogUpdate.mockResolvedValue(new Map([['UPD-001', 'https://buy.stripe.com/upd']]));

      await runCatalogSync('sync');

      const expectedLinks = new Map([
        ['ADD-001', 'https://buy.stripe.com/add'],
        ['UPD-001', 'https://buy.stripe.com/upd'],
      ]);
      expect(updateCatalogPaymentLinks).toHaveBeenCalledWith(expectedLinks);
      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Wrote 2 Payment Link URLs back to catalog.csv');
    });

    it('logs "No new products to add." when toAdd is empty in sync mode', async () => {
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate: [], orphaned: [] });

      await runCatalogSync('sync');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] No new products to add.');
    });

    it('logs "No products to update." when toUpdate is empty in sync mode', async () => {
      catalogDiff.mockReturnValue({ toAdd: [], toUpdate: [], orphaned: [] });

      await runCatalogSync('sync');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] No products to update.');
    });
  });

  // ─── payment link write-back pluralization ────────────────────────────────────

  describe('payment link write-back pluralization', () => {
    it('uses singular "URL" for exactly 1 link', async () => {
      const toAdd = [{ sku: 'ADD-001', product: makeCatalogProduct() }];
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });
      catalogAdd.mockResolvedValue(new Map([['ADD-001', 'https://buy.stripe.com/one']]));

      await runCatalogSync('add');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Wrote 1 Payment Link URL back to catalog.csv');
    });

    it('uses plural "URLs" for 2+ links', async () => {
      const toAdd = [
        { sku: 'A1', product: makeCatalogProduct({ sku: 'A1' }) },
        { sku: 'A2', product: makeCatalogProduct({ sku: 'A2' }) },
      ];
      catalogDiff.mockReturnValue({ toAdd, toUpdate: [], orphaned: [] });
      catalogAdd.mockResolvedValue(new Map([
        ['A1', 'https://buy.stripe.com/a1'],
        ['A2', 'https://buy.stripe.com/a2'],
      ]));

      await runCatalogSync('add');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Wrote 2 Payment Link URLs back to catalog.csv');
    });
  });

  // ─── orphan warnings in non-diff modes ───────────────────────────────────────

  describe('orphan warnings in non-diff modes', () => {
    it('logs orphan warning with singular "product" for 1 orphan', async () => {
      catalogDiff.mockReturnValue({
        toAdd: [],
        toUpdate: [],
        orphaned: [{ sku: 'OLD-001', state: { name: 'Discontinued' } }],
      });

      await runCatalogSync('add');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Warning: 1 Stripe product not in catalog:');
      expect(consoleSpy).toHaveBeenCalledWith('  ? OLD-001: Discontinued');
    });

    it('logs orphan warning with plural "products" for 2+ orphans', async () => {
      catalogDiff.mockReturnValue({
        toAdd: [],
        toUpdate: [],
        orphaned: [
          { sku: 'OLD-001', state: { name: 'Discontinued A' } },
          { sku: 'OLD-002', state: { name: 'Discontinued B' } },
        ],
      });

      await runCatalogSync('update');

      expect(consoleSpy).toHaveBeenCalledWith('[Sync] Warning: 2 Stripe products not in catalog:');
      expect(consoleSpy).toHaveBeenCalledWith('  ? OLD-001: Discontinued A');
      expect(consoleSpy).toHaveBeenCalledWith('  ? OLD-002: Discontinued B');
    });
  });
});
