import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeListing } from './helpers.js';

vi.mock('../../../src/lib/storefront/get-listings.js', () => ({
  getListings: vi.fn(),
}));

describe('getCategories', () => {
  let getCategories: typeof import('../../../src/lib/storefront/categories.js').getCategories;
  let getListingsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const listings = await import('../../../src/lib/storefront/get-listings.js');
    getListingsMock = vi.mocked(listings.getListings);
    ({ getCategories } = await import('../../../src/lib/storefront/categories.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('extracts unique categories from listings', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'HAT-1', category: 'Hats' }),
      makeListing({ sku: 'HAT-2', category: 'Hats' }),
      makeListing({ sku: 'SHIRT-1', category: 'Shirts' }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([
      { name: 'Hats', slug: 'hats', productCount: 2 },
      { name: 'Shirts', slug: 'shirts', productCount: 1 },
    ]);
  });

  it('excludes products with null category', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'HAT-1', category: 'Hats' }),
      makeListing({ sku: 'MISC-1', category: null }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([
      { name: 'Hats', slug: 'hats', productCount: 1 },
    ]);
  });

  it('returns empty array when no listings have categories', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ category: null }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([]);
  });

  it('returns empty array when no listings exist', async () => {
    getListingsMock.mockResolvedValue([]);
    const categories = await getCategories();
    expect(categories).toEqual([]);
  });

  it('sorts categories alphabetically by name', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'Z-1', category: 'Zebra Stuff' }),
      makeListing({ sku: 'A-1', category: 'Alpha Goods' }),
      makeListing({ sku: 'M-1', category: 'Middle Things' }),
    ]);
    const categories = await getCategories();
    expect(categories.map(c => c.name)).toEqual([
      'Alpha Goods',
      'Middle Things',
      'Zebra Stuff',
    ]);
  });

  it('slugifies category names', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'TS-1', category: 'T-Shirts' }),
      makeListing({ sku: 'HG-1', category: 'Home & Garden' }),
    ]);
    const categories = await getCategories();
    expect(categories.map(c => c.slug)).toEqual(['home-garden', 't-shirts']);
  });

  it('propagates getListings errors', async () => {
    getListingsMock.mockRejectedValue(new Error('ENOENT: no such file'));
    await expect(getCategories()).rejects.toThrow('ENOENT');
  });
});
