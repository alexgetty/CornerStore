import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct, makeCSV, makeCSVRow } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

async function getReadFileMock() {
  const fs = await import('node:fs/promises');
  return vi.mocked(fs.readFile);
}

// ─── validateRows ────────────────────────────────────────────────────────────

describe('validateRows', () => {
  let validateRows: typeof import('../../../src/lib/catalog/csv.js').validateRows;

  beforeEach(async () => {
    vi.resetModules();
    ({ validateRows } = await import('../../../src/lib/catalog/csv.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns products for valid rows', () => {
    const rows = [makeCSVRow()];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject(makeCatalogProduct());
  });

  it('parses all optional fields when present', () => {
    const rows = [makeCSVRow({
      Category: 'Candles',
      Status: 'active',
      Storefront: 'yes',
      'Order Sheet': 'yes',
      Description: 'A lovely candle',
      'Payment Link': 'https://buy.stripe.com/abc',
    })];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject(makeCatalogProduct({
      category: 'Candles',
      status: 'active',
      storefront: true,
      orderSheet: true,
      description: 'A lovely candle',
      paymentLink: 'https://buy.stripe.com/abc',
    }));
  });

  it('defaults storefront to true when column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.storefront).toBe(true);
  });

  it('defaults orderSheet to true when column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.orderSheet).toBe(true);
  });

  it('sets storefront to false when value is "no"', () => {
    const { products } = validateRows([makeCSVRow({ Storefront: 'no' })]);
    expect(products[0]!.storefront).toBe(false);
  });

  it('sets orderSheet to false when value is "no"', () => {
    const { products } = validateRows([makeCSVRow({ 'Order Sheet': 'no' })]);
    expect(products[0]!.orderSheet).toBe(false);
  });

  it('sets storefront to false when value is "No" (case-insensitive)', () => {
    const { products } = validateRows([makeCSVRow({ Storefront: 'No' })]);
    expect(products[0]!.storefront).toBe(false);
  });

  it('sets orderSheet to false when value is "NO" (case-insensitive)', () => {
    const { products } = validateRows([makeCSVRow({ 'Order Sheet': 'NO' })]);
    expect(products[0]!.orderSheet).toBe(false);
  });

  it('ignores extra columns', () => {
    const rows = [makeCSVRow({ ExtraColumn: 'ignored' })];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
  });

  it('sets optional fields to null when absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.category).toBeNull();
    expect(products[0]!.status).toBeNull();
    expect(products[0]!.description).toBeNull();
    expect(products[0]!.paymentLink).toBeNull();
  });

  it('sets optional fields to null when empty string', () => {
    const rows = [makeCSVRow({
      Category: '',
      Status: '',
      Description: '',
      'Payment Link': '',
    })];
    const { products } = validateRows(rows);
    expect(products[0]!.category).toBeNull();
    expect(products[0]!.status).toBeNull();
    expect(products[0]!.description).toBeNull();
    expect(products[0]!.paymentLink).toBeNull();
  });

  it('returns error for missing SKU', () => {
    const { products, errors } = validateRows([makeCSVRow({ SKU: '' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'SKU', message: 'required' }]);
  });

  it('returns error for SKU with invalid characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ SKU: 'INVALID SKU!' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{
      row: 2,
      field: 'SKU',
      message: 'must contain only alphanumeric characters, hyphens, and underscores',
    }]);
  });

  it('allows SKU with hyphens and underscores', () => {
    const { products, errors } = validateRows([makeCSVRow({ SKU: 'ABC-123_xyz' })]);
    expect(errors).toEqual([]);
    expect(products[0]!.sku).toBe('ABC-123_xyz');
  });

  it('returns error for duplicate SKUs', () => {
    const rows = [makeCSVRow({ SKU: 'DUP-001' }), makeCSVRow({ SKU: 'DUP-001' })];
    const { products, errors } = validateRows(rows);
    expect(products).toEqual([]);
    expect(errors).toEqual([{
      row: 3,
      field: 'SKU',
      message: 'duplicate SKU "DUP-001"',
    }]);
  });

  it('returns error for missing Name', () => {
    const { products, errors } = validateRows([makeCSVRow({ Name: '' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'required' }]);
  });

  it('returns error for Name exceeding 250 characters', () => {
    const longName = 'A'.repeat(251);
    const { products, errors } = validateRows([makeCSVRow({ Name: longName })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'exceeds 250 characters' }]);
  });

  it('accepts Name of exactly 250 characters', () => {
    const maxName = 'A'.repeat(250);
    const { products, errors } = validateRows([makeCSVRow({ Name: maxName })]);
    expect(errors).toEqual([]);
    expect(products[0]!.name).toBe(maxName);
  });

  it('returns error for missing Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'required' }]);
  });

  it('returns error for non-numeric Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: 'free' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns error for zero Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns error for negative Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '-5.00' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns no products when there are any errors', () => {
    const rows = [
      makeCSVRow({ SKU: '' }),
      makeCSVRow({ SKU: 'GOOD-001' }),
    ];
    const { products, errors } = validateRows(rows);
    expect(products).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('collects errors from multiple rows', () => {
    const rows = [
      makeCSVRow({ SKU: '' }),
      makeCSVRow({ SKU: 'GOOD-001', Name: '' }),
      makeCSVRow({ SKU: 'GOOD-002', Price: '' }),
    ];
    const { products, errors } = validateRows(rows);
    expect(products).toEqual([]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({ row: 2, field: 'SKU', message: 'required' });
    expect(errors[1]).toEqual({ row: 3, field: 'Name', message: 'required' });
    expect(errors[2]).toEqual({ row: 4, field: 'Price', message: 'required' });
  });

  // ── Description length ──────────────────────────────────────────────────

  it('accepts description of exactly 500 characters', () => {
    const desc = 'D'.repeat(500);
    const { products, errors } = validateRows([makeCSVRow({ Description: desc })]);
    expect(errors).toEqual([]);
    expect(products[0]!.description).toBe(desc);
  });

  it('returns error for description exceeding 500 characters', () => {
    const desc = 'D'.repeat(501);
    const { products, errors } = validateRows([makeCSVRow({ Description: desc })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Description', message: 'exceeds 500 characters' }]);
  });

  // ── Price upper bound ──────────────────────────────────────────────────

  it('accepts price of 999999.99', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '999999.99' })]);
    expect(errors).toEqual([]);
    expect(products[0]!.price).toBe(999999.99);
  });

  it('returns error for price of 1000000.00', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '1000000.00' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'exceeds maximum of 999999.99' }]);
  });

  // ── Price floor (rounds to zero cents) ─────────────────────────────────

  it('accepts price of 0.01 (minimum 1 cent)', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0.01' })]);
    expect(errors).toEqual([]);
    expect(products[0]!.price).toBe(0.01);
  });

  it('returns error for price of 0.004 (rounds to 0 cents)', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0.004' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be at least 0.01' }]);
  });

  // ── Strict number parsing ──────────────────────────────────────────────

  it('returns error for price with trailing non-numeric characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '19.99abc' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns error for price with leading non-numeric characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: 'abc19.99' })]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns empty products and no errors for empty records', () => {
    const { products, errors } = validateRows([]);
    expect(products).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('returns error for missing SKU key (undefined field)', () => {
    const { products, errors } = validateRows([{ Name: 'Test', Price: '9.99' }]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'SKU', message: 'required' }]);
  });

  it('returns error for missing Name key (undefined field)', () => {
    const { products, errors } = validateRows([{ SKU: 'TEST-001', Price: '9.99' }]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'required' }]);
  });

  it('returns error for missing Price key (undefined field)', () => {
    const { products, errors } = validateRows([{ SKU: 'TEST-001', Name: 'Test' }]);
    expect(products).toEqual([]);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'required' }]);
  });

  it('parses price as a float', () => {
    const { products } = validateRows([makeCSVRow({ Price: '9.99' })]);
    expect(products[0]!.price).toBe(9.99);
  });

  it('trims whitespace from SKU, Name, and Price', () => {
    const rows = [makeCSVRow({ SKU: ' TEST-001 ', Name: ' Test Product ', Price: ' 19.99 ' })];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products[0]!.sku).toBe('TEST-001');
    expect(products[0]!.name).toBe('Test Product');
    expect(products[0]!.price).toBe(19.99);
  });
});

// ─── loadCatalog ─────────────────────────────────────────────────────────────

describe('loadCatalog', () => {
  let loadCatalog: typeof import('../../../src/lib/catalog/csv.js').loadCatalog;
  let readFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    readFileMock = await getReadFileMock();
    ({ loadCatalog } = await import('../../../src/lib/catalog/csv.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('parses a valid CSV and returns products', async () => {
    const csv = makeCSV([makeCSVRow()]);
    readFileMock.mockResolvedValue(csv);
    const products = await loadCatalog('/fake/catalog.csv');
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject(makeCatalogProduct());
  });

  it('throws with validation error details when CSV has invalid rows', async () => {
    const csv = makeCSV([makeCSVRow({ SKU: '' })]);
    readFileMock.mockResolvedValue(csv);
    await expect(loadCatalog('/fake/catalog.csv')).rejects.toThrow('[Catalog] Validation failed:');
    await expect(loadCatalog('/fake/catalog.csv')).rejects.toThrow('Row 2, SKU: required');
  });

  it('throws when file is missing', async () => {
    readFileMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
    );
    await expect(loadCatalog('/fake/catalog.csv')).rejects.toThrow('ENOENT');
  });

  it('handles quoted fields containing commas', async () => {
    const csv = makeCSV([makeCSVRow({ Name: 'Product, with comma' })]);
    readFileMock.mockResolvedValue(csv);
    const products = await loadCatalog('/fake/catalog.csv');
    expect(products[0]!.name).toBe('Product, with comma');
  });

  it('returns empty array for header-only CSV', async () => {
    const csv = 'SKU,Name,Price';
    readFileMock.mockResolvedValue(csv);
    const products = await loadCatalog('/fake/catalog.csv');
    expect(products).toEqual([]);
  });

  it('uses CATALOG_PATH when no path is provided', async () => {
    const csv = makeCSV([makeCSVRow()]);
    readFileMock.mockResolvedValue(csv);
    await loadCatalog();
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('products/catalog.csv'),
      'utf-8'
    );
  });
});
