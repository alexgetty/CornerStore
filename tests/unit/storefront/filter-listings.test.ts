import { describe, it, expect } from 'vitest';
import { filterListings } from '../../../src/lib/storefront/filter-listings.js';
import type { Listing } from '../../../src/lib/storefront/types.js';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    description: null,
    images: [],
    price: '$19.99',
    rawPrice: 1999,
    currency: 'usd',
    category: null,
    status: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
}

describe('filterListings', () => {
  // ── No filters ────────────────────────────────────────────────────────

  it('returns all listings when no filters are set', () => {
    const listings = [makeListing({ sku: 'A' }), makeListing({ sku: 'B' })];
    const { filtered, warnings } = filterListings(listings, {});
    expect(filtered).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  // ── Featured filter ───────────────────────────────────────────────────

  it('filters to featured listings when featured is true', () => {
    const listings = [
      makeListing({ sku: 'FEAT', featured: true }),
      makeListing({ sku: 'NOPE', featured: false }),
    ];
    const { filtered } = filterListings(listings, { featured: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.sku).toBe('FEAT');
  });

  it('returns all listings when featured is not set', () => {
    const listings = [
      makeListing({ sku: 'FEAT', featured: true }),
      makeListing({ sku: 'NOPE', featured: false }),
    ];
    const { filtered } = filterListings(listings, {});
    expect(filtered).toHaveLength(2);
  });

  // ── Categories filter ─────────────────────────────────────────────────

  it('filters to listings matching any given category', () => {
    const listings = [
      makeListing({ sku: 'S1', category: 'Shirt' }),
      makeListing({ sku: 'H1', category: 'Hat' }),
      makeListing({ sku: 'C1', category: 'Candle' }),
    ];
    const { filtered } = filterListings(listings, { categories: ['Shirt', 'Hat'] });
    expect(filtered).toHaveLength(2);
    expect(filtered.map((l) => l.sku)).toEqual(['S1', 'H1']);
  });

  it('excludes listings with null category when categories filter is set', () => {
    const listings = [
      makeListing({ sku: 'S1', category: 'Shirt' }),
      makeListing({ sku: 'N1', category: null }),
    ];
    const { filtered } = filterListings(listings, { categories: ['Shirt'] });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.sku).toBe('S1');
  });

  it('returns all listings when categories is not set', () => {
    const listings = [
      makeListing({ sku: 'S1', category: 'Shirt' }),
      makeListing({ sku: 'H1', category: 'Hat' }),
    ];
    const { filtered } = filterListings(listings, {});
    expect(filtered).toHaveLength(2);
  });

  // ── Composed filters ──────────────────────────────────────────────────

  it('composes featured and categories filters', () => {
    const listings = [
      makeListing({ sku: 'FS', category: 'Shirt', featured: true }),
      makeListing({ sku: 'FH', category: 'Hat', featured: true }),
      makeListing({ sku: 'NS', category: 'Shirt', featured: false }),
    ];
    const { filtered } = filterListings(listings, { featured: true, categories: ['Shirt'] });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.sku).toBe('FS');
  });

  // ── Warnings ──────────────────────────────────────────────────────────

  it('warns for categories that match no products', () => {
    const listings = [makeListing({ sku: 'S1', category: 'Shirt' })];
    const { warnings } = filterListings(listings, { categories: ['Shirt', 'Bogus'] });
    expect(warnings).toEqual(['[Listings] Warning: category "Bogus" matched no products']);
  });

  it('does not warn for categories that match products', () => {
    const listings = [makeListing({ sku: 'S1', category: 'Shirt' })];
    const { warnings } = filterListings(listings, { categories: ['Shirt'] });
    expect(warnings).toEqual([]);
  });

  it('warns for categories with no match after featured filter narrows the set', () => {
    const listings = [
      makeListing({ sku: 'S1', category: 'Shirt', featured: false }),
    ];
    const { warnings } = filterListings(listings, { featured: true, categories: ['Shirt'] });
    expect(warnings).toEqual(['[Listings] Warning: category "Shirt" matched no products']);
  });

  // ── Empty input ───────────────────────────────────────────────────────

  it('returns empty filtered array when input is empty', () => {
    const { filtered, warnings } = filterListings([], {});
    expect(filtered).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('returns empty filtered array when no listings match featured', () => {
    const listings = [makeListing({ featured: false })];
    const { filtered } = filterListings(listings, { featured: true });
    expect(filtered).toEqual([]);
  });

  it('returns empty filtered array when no listings match categories', () => {
    const listings = [makeListing({ category: 'Shirt' })];
    const { filtered } = filterListings(listings, { categories: ['Hat'] });
    expect(filtered).toEqual([]);
  });
});
