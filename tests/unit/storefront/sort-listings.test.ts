import { describe, it, expect } from 'vitest';
import { sortListings } from '../../../src/lib/storefront/sort-listings.js';
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

describe('sortListings', () => {
  // ── No sort ───────────────────────────────────────────────────────────

  it('returns listings unchanged when sort is not set', () => {
    const listings = [
      makeListing({ sku: 'B' }),
      makeListing({ sku: 'A' }),
    ];
    const { sorted, warnings } = sortListings(listings, {});
    expect(sorted.map((l) => l.sku)).toEqual(['B', 'A']);
    expect(warnings).toEqual([]);
  });

  // ── String sorting ────────────────────────────────────────────────────

  it('sorts by string property ascending by default', () => {
    const listings = [
      makeListing({ sku: 'C', name: 'Charlie' }),
      makeListing({ sku: 'A', name: 'Alpha' }),
      makeListing({ sku: 'B', name: 'Bravo' }),
    ];
    const { sorted } = sortListings(listings, { sort: 'name' });
    expect(sorted.map((l) => l.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by string property descending when order is desc', () => {
    const listings = [
      makeListing({ sku: 'A', name: 'Alpha' }),
      makeListing({ sku: 'C', name: 'Charlie' }),
      makeListing({ sku: 'B', name: 'Bravo' }),
    ];
    const { sorted } = sortListings(listings, { sort: 'name', order: 'desc' });
    expect(sorted.map((l) => l.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by string property ascending when order is explicitly asc', () => {
    const listings = [
      makeListing({ sku: 'B', name: 'Bravo' }),
      makeListing({ sku: 'A', name: 'Alpha' }),
    ];
    const { sorted } = sortListings(listings, { sort: 'name', order: 'asc' });
    expect(sorted.map((l) => l.name)).toEqual(['Alpha', 'Bravo']);
  });

  // ── Numeric sorting ───────────────────────────────────────────────────

  it('sorts by numeric property ascending', () => {
    const listings = [
      makeListing({ sku: 'C', rawPrice: 3000 }),
      makeListing({ sku: 'A', rawPrice: 1000 }),
      makeListing({ sku: 'B', rawPrice: 2000 }),
    ];
    const { sorted } = sortListings(listings, { sort: 'rawPrice' });
    expect(sorted.map((l) => l.rawPrice)).toEqual([1000, 2000, 3000]);
  });

  it('sorts by numeric property descending', () => {
    const listings = [
      makeListing({ sku: 'A', rawPrice: 1000 }),
      makeListing({ sku: 'C', rawPrice: 3000 }),
      makeListing({ sku: 'B', rawPrice: 2000 }),
    ];
    const { sorted } = sortListings(listings, { sort: 'rawPrice', order: 'desc' });
    expect(sorted.map((l) => l.rawPrice)).toEqual([3000, 2000, 1000]);
  });

  // ── Null handling ─────────────────────────────────────────────────────

  it('sorts nulls to end in ascending order', () => {
    const listings = [
      makeListing({ sku: 'N', category: null }),
      makeListing({ sku: 'A', category: 'Alpha' }),
      makeListing({ sku: 'B', category: 'Bravo' }),
    ];
    const { sorted } = sortListings(listings, { sort: 'category' });
    expect(sorted.map((l) => l.category)).toEqual(['Alpha', 'Bravo', null]);
  });

  it('sorts nulls to end in descending order', () => {
    const listings = [
      makeListing({ sku: 'N', category: null }),
      makeListing({ sku: 'B', category: 'Bravo' }),
      makeListing({ sku: 'A', category: 'Alpha' }),
    ];
    const { sorted } = sortListings(listings, { sort: 'category', order: 'desc' });
    expect(sorted.map((l) => l.category)).toEqual(['Bravo', 'Alpha', null]);
  });

  it('preserves relative order of multiple null values', () => {
    const listings = [
      makeListing({ sku: 'N1', category: null }),
      makeListing({ sku: 'A', category: 'Alpha' }),
      makeListing({ sku: 'N2', category: null }),
    ];
    const { sorted } = sortListings(listings, { sort: 'category' });
    expect(sorted.map((l) => l.sku)).toEqual(['A', 'N1', 'N2']);
  });

  // ── Invalid sort key ──────────────────────────────────────────────────

  it('warns and returns original order for invalid sort key', () => {
    const listings = [
      makeListing({ sku: 'B' }),
      makeListing({ sku: 'A' }),
    ];
    const { sorted, warnings } = sortListings(listings, { sort: 'nonexistent' });
    expect(sorted.map((l) => l.sku)).toEqual(['B', 'A']);
    expect(warnings).toEqual(['[Listings] Warning: sort key "nonexistent" not found on any listing']);
  });

  it('warns when sort key exists but all values are null', () => {
    const listings = [
      makeListing({ sku: 'A', category: null }),
      makeListing({ sku: 'B', category: null }),
    ];
    const { sorted, warnings } = sortListings(listings, { sort: 'category' });
    expect(sorted.map((l) => l.sku)).toEqual(['A', 'B']);
    expect(warnings).toEqual([]);
  });

  // ── Does not mutate input ─────────────────────────────────────────────

  it('does not mutate the input array', () => {
    const listings = [
      makeListing({ sku: 'B', name: 'Bravo' }),
      makeListing({ sku: 'A', name: 'Alpha' }),
    ];
    const original = [...listings];
    sortListings(listings, { sort: 'name' });
    expect(listings.map((l) => l.sku)).toEqual(original.map((l) => l.sku));
  });

  // ── Empty input ───────────────────────────────────────────────────────

  it('returns empty array when input is empty', () => {
    const { sorted, warnings } = sortListings([], { sort: 'name' });
    expect(sorted).toEqual([]);
    expect(warnings).toEqual([]);
  });

  // ── Boolean sorting ───────────────────────────────────────────────────

  it('sorts by boolean property (false before true ascending)', () => {
    const listings = [
      makeListing({ sku: 'F', featured: true }),
      makeListing({ sku: 'N', featured: false }),
    ];
    const { sorted } = sortListings(listings, { sort: 'featured' });
    expect(sorted.map((l) => l.sku)).toEqual(['N', 'F']);
  });

  it('sorts by boolean property descending (true first)', () => {
    const listings = [
      makeListing({ sku: 'N', featured: false }),
      makeListing({ sku: 'F', featured: true }),
    ];
    const { sorted } = sortListings(listings, { sort: 'featured', order: 'desc' });
    expect(sorted.map((l) => l.sku)).toEqual(['F', 'N']);
  });

  // ── Price alias ───────────────────────────────────────────────────────

  it('sort="price" sorts numerically by rawPrice ascending', () => {
    const listings = [
      makeListing({ sku: 'C', rawPrice: 3000 }),
      makeListing({ sku: 'A', rawPrice: 1000 }),
      makeListing({ sku: 'B', rawPrice: 2000 }),
    ];
    const { sorted, warnings } = sortListings(listings, { sort: 'price' });
    expect(sorted.map((l) => l.rawPrice)).toEqual([1000, 2000, 3000]);
    expect(warnings).toEqual([]);
  });

  it('sort="price" sorts numerically by rawPrice descending', () => {
    const listings = [
      makeListing({ sku: 'A', rawPrice: 1000 }),
      makeListing({ sku: 'C', rawPrice: 3000 }),
    ];
    const { sorted } = sortListings(listings, { sort: 'price', order: 'desc' });
    expect(sorted.map((l) => l.rawPrice)).toEqual([3000, 1000]);
  });
});
