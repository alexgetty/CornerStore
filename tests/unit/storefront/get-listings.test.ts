import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from '../catalog/helpers.js';

vi.mock('../../../src/lib/catalog/csv.js', () => ({
  loadCatalog: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/images.js', () => ({
  loadProductImages: vi.fn(),
}));

vi.mock('../../../src/lib/catalog/overrides.js', () => ({
  loadProductOverrides: vi.fn(),
}));

describe('getListings', () => {
  let getListings: typeof import('../../../src/lib/storefront/get-listings.js').getListings;
  let loadCatalogMock: ReturnType<typeof vi.fn>;
  let loadProductImagesMock: ReturnType<typeof vi.fn>;
  let loadProductOverridesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const csv = await import('../../../src/lib/catalog/csv.js');
    const images = await import('../../../src/lib/catalog/images.js');
    const overrides = await import('../../../src/lib/catalog/overrides.js');
    loadCatalogMock = vi.mocked(csv.loadCatalog);
    loadProductImagesMock = vi.mocked(images.loadProductImages);
    loadProductOverridesMock = vi.mocked(overrides.loadProductOverrides);
    loadProductImagesMock.mockResolvedValue(new Map());
    loadProductOverridesMock.mockResolvedValue(new Map());
    ({ getListings } = await import('../../../src/lib/storefront/get-listings.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('builds listings from catalog products', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('TEST-001');
    expect(listings[0]!.name).toBe('Test Product');
    expect(listings[0]!.rawPrice).toBe(1999);
    expect(listings[0]!.currency).toBe('usd');
    expect(listings[0]!.images).toEqual([]);
  });

  it('filters to storefront products only', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'SHOW', storefront: true }),
      makeCatalogProduct({ sku: 'HIDE', storefront: false }),
    ]);
    const listings = await getListings();
    expect(listings).toHaveLength(1);
    expect(listings[0]!.sku).toBe('SHOW');
  });

  it('builds images with alt text from overrides', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', [
        { url: '/product-images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' },
        { url: '/product-images/TEST-001-2.jpg', filename: 'TEST-001-2.jpg' },
      ]]])
    );
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', {
        sku: 'TEST-001',
        description: null,
        imageAlts: new Map([['TEST-001-1.jpg', 'Primary photo']]),
      }]])
    );
    const listings = await getListings();
    expect(listings[0]!.images).toEqual([
      { url: '/product-images/TEST-001-1.jpg', alt: 'Primary photo' },
      { url: '/product-images/TEST-001-2.jpg', alt: '' },
    ]);
  });

  it('defaults image alt to empty string when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', [
        { url: '/product-images/TEST-001-1.jpg', filename: 'TEST-001-1.jpg' },
      ]]])
    );
    const listings = await getListings();
    expect(listings[0]!.images[0]!.alt).toBe('');
  });

  it('applies override description over CSV', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: 'Rich desc', imageAlts: new Map() }]])
    );
    const listings = await getListings();
    expect(listings[0]!.description).toBe('Rich desc');
  });

  it('falls back to CSV description when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    const listings = await getListings();
    expect(listings[0]!.description).toBe('CSV desc');
  });

  it('passes through status from CSV', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ status: 'Coming Soon' })]);
    const listings = await getListings();
    expect(listings[0]!.status).toBe('Coming Soon');
  });

  it('passes through paymentLink from CSV', async () => {
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ paymentLink: 'https://buy.stripe.com/test' }),
    ]);
    const listings = await getListings();
    expect(listings[0]!.paymentLink).toBe('https://buy.stripe.com/test');
  });

  it('warns about products with no images', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ sku: 'NO-IMG' })]);
    await getListings();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NO-IMG has no images'),
    );
    consoleSpy.mockRestore();
  });

  it('returns empty array when catalog has no storefront products', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ storefront: false })]);
    const listings = await getListings();
    expect(listings).toEqual([]);
  });

  it('propagates catalog validation errors', async () => {
    loadCatalogMock.mockRejectedValue(new Error('[Catalog] Validation failed'));
    await expect(getListings()).rejects.toThrow('[Catalog] Validation failed');
  });

  it('logs plural "products" when multiple storefront products are found', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadCatalogMock.mockResolvedValue([
      makeCatalogProduct({ sku: 'ONE' }),
      makeCatalogProduct({ sku: 'TWO' }),
    ]);
    loadProductImagesMock.mockResolvedValue(
      new Map([
        ['ONE', [{ url: '/product-images/ONE-1.jpg', filename: 'ONE-1.jpg' }]],
        ['TWO', [{ url: '/product-images/TWO-1.jpg', filename: 'TWO-1.jpg' }]],
      ])
    );
    await getListings();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Build complete: 2 storefront products$/),
    );
    consoleSpy.mockRestore();
  });
});
