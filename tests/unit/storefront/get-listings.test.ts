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

  it('applies primary image from image map', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(
      new Map([['TEST-001', ['/product-images/TEST-001-1.jpg', '/product-images/TEST-001-2.jpg']]])
    );
    const listings = await getListings();
    expect(listings[0]!.image).toBe('/product-images/TEST-001-1.jpg');
  });

  it('uses null image when no images exist for SKU', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductImagesMock.mockResolvedValue(new Map());
    const listings = await getListings();
    expect(listings[0]!.image).toBeNull();
  });

  it('applies override description when present', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: 'Rich desc', imageAlt: null }]])
    );
    const listings = await getListings();
    expect(listings[0]!.description).toBe('Rich desc');
  });

  it('falls back to CSV description when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ description: 'CSV desc' })]);
    const listings = await getListings();
    expect(listings[0]!.description).toBe('CSV desc');
  });

  it('applies override imageAlt when present', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct()]);
    loadProductOverridesMock.mockResolvedValue(
      new Map([['TEST-001', { sku: 'TEST-001', description: null, imageAlt: 'Custom alt' }]])
    );
    const listings = await getListings();
    expect(listings[0]!.imageAlt).toBe('Custom alt');
  });

  it('defaults imageAlt to product name when no override', async () => {
    loadCatalogMock.mockResolvedValue([makeCatalogProduct({ name: 'Widget' })]);
    const listings = await getListings();
    expect(listings[0]!.imageAlt).toBe('Widget');
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
});
