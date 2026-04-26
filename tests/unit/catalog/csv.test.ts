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
      Hidden: 'no',
      Description: 'A lovely candle',
      'Payment Link': 'https://buy.stripe.com/abc',
    })];
    const { products, errors } = validateRows(rows);
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject(makeCatalogProduct({
      category: 'Candles',
      status: 'active',
      hidden: false,
      description: 'A lovely candle',
      paymentLink: 'https://buy.stripe.com/abc',
    }));
  });

  it('defaults hidden to false when Hidden column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.hidden).toBe(false);
  });

  it('defaults hidden to false when Hidden is empty string', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: '' })]);
    expect(products[0]!.hidden).toBe(false);
  });

  it('sets hidden to true when Hidden is "true"', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'true' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to true when Hidden is "True" (case-insensitive)', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'True' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to true when Hidden is "yes"', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'yes' })]);
    expect(products[0]!.hidden).toBe(true);
  });

  it('sets hidden to false for non-truthy Hidden values', () => {
    const { products } = validateRows([makeCSVRow({ Hidden: 'no' })]);
    expect(products[0]!.hidden).toBe(false);
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

  it('skips row and returns error for missing SKU', () => {
    const { products, errors } = validateRows([makeCSVRow({ SKU: '' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'SKU', message: 'required' }]);
  });

  it('skips row and returns error for SKU with invalid characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ SKU: 'INVALID SKU!' })]);
    expect(products).toHaveLength(0);
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

  it('keeps first and skips duplicate SKU', () => {
    const rows = [makeCSVRow({ SKU: 'DUP-001' }), makeCSVRow({ SKU: 'DUP-001' })];
    const { products, errors } = validateRows(rows);
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('DUP-001');
    expect(errors).toEqual([{
      row: 3,
      field: 'SKU',
      message: 'duplicate SKU "DUP-001"',
    }]);
  });

  it('skips row and returns error for missing Name', () => {
    const { products, errors } = validateRows([makeCSVRow({ Name: '' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'required' }]);
  });

  it('skips row and returns error for Name exceeding 250 characters', () => {
    const longName = 'A'.repeat(251);
    const { products, errors } = validateRows([makeCSVRow({ Name: longName })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'exceeds 250 characters' }]);
  });

  it('accepts Name of exactly 250 characters', () => {
    const maxName = 'A'.repeat(250);
    const { products, errors } = validateRows([makeCSVRow({ Name: maxName })]);
    expect(errors).toEqual([]);
    expect(products[0]!.name).toBe(maxName);
  });

  it('skips row and returns error for missing Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'required' }]);
  });

  it('skips row and returns error for non-numeric Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: 'free' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('skips row and returns error for zero Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('skips row and returns error for negative Price', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '-5.00' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns valid products and skips invalid rows', () => {
    const rows = [
      makeCSVRow({ SKU: '' }),
      makeCSVRow({ SKU: 'GOOD-001' }),
    ];
    const { products, errors } = validateRows(rows);
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('GOOD-001');
    expect(errors).toHaveLength(1);
  });

  it('collects errors from multiple invalid rows while keeping valid ones', () => {
    const rows = [
      makeCSVRow({ SKU: '' }),
      makeCSVRow({ SKU: 'GOOD-001', Name: '' }),
      makeCSVRow({ SKU: 'GOOD-002', Price: '' }),
      makeCSVRow({ SKU: 'GOOD-003' }),
    ];
    const { products, errors } = validateRows(rows);
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('GOOD-003');
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

  it('skips row and returns error for description exceeding 500 characters', () => {
    const desc = 'D'.repeat(501);
    const { products, errors } = validateRows([makeCSVRow({ Description: desc })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Description', message: 'exceeds 500 characters' }]);
  });

  // ── Price upper bound ──────────────────────────────────────────────────

  it('accepts price of 999999.99', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '999999.99' })]);
    expect(errors).toEqual([]);
    expect(products[0]!.price).toBe(999999.99);
  });

  it('skips row and returns error for price of 1000000.00', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '1000000.00' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'exceeds maximum of 999999.99' }]);
  });

  // ── Price floor (rounds to zero cents) ─────────────────────────────────

  it('accepts price of 0.01 (minimum 1 cent)', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0.01' })]);
    expect(errors).toEqual([]);
    expect(products[0]!.price).toBe(0.01);
  });

  it('skips row and returns error for price of 0.004 (rounds to 0 cents)', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '0.004' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be at least 0.01' }]);
  });

  // ── Strict number parsing ──────────────────────────────────────────────

  it('skips row and returns error for price with trailing non-numeric characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: '19.99abc' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('skips row and returns error for price with leading non-numeric characters', () => {
    const { products, errors } = validateRows([makeCSVRow({ Price: 'abc19.99' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'must be a positive number' }]);
  });

  it('returns empty products and no errors for empty records', () => {
    const { products, errors } = validateRows([]);
    expect(products).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('skips row for missing SKU key (undefined field)', () => {
    const { products, errors } = validateRows([{ Name: 'Test', Price: '9.99' }]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'SKU', message: 'required' }]);
  });

  it('skips row for missing Name key (undefined field)', () => {
    const { products, errors } = validateRows([{ SKU: 'TEST-001', Price: '9.99' }]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Name', message: 'required' }]);
  });

  it('skips row for missing Price key (undefined field)', () => {
    const { products, errors } = validateRows([{ SKU: 'TEST-001', Name: 'Test' }]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'Price', message: 'required' }]);
  });

  it('parses price as a float', () => {
    const { products } = validateRows([makeCSVRow({ Price: '9.99' })]);
    expect(products[0]!.price).toBe(9.99);
  });

  // ── MOQ parsing ───────────────────────────────────────────────────────

  it('parses MOQ as integer when present', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '6' })]);
    expect(products[0]!.moq).toBe(6);
  });

  it('defaults moq to null when MOQ column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.moq).toBeNull();
  });

  it('defaults moq to null when MOQ is empty string', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '' })]);
    expect(products[0]!.moq).toBeNull();
  });

  it('defaults moq to null when MOQ is zero', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: '0' })]);
    expect(products[0]!.moq).toBeNull();
  });

  it('skips row and returns error for non-integer MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: '2.5' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('skips row and returns error for negative MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: '-3' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('skips row and returns error for non-numeric MOQ', () => {
    const { products, errors } = validateRows([makeCSVRow({ MOQ: 'abc' })]);
    expect(products).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, field: 'MOQ', message: 'must be a positive whole number' }]);
  });

  it('trims whitespace from MOQ', () => {
    const { products } = validateRows([makeCSVRow({ MOQ: ' 12 ' })]);
    expect(products[0]!.moq).toBe(12);
  });

  // ── Featured parsing ───────────────────────────────────────────────────

  it('defaults featured to false when Featured column is absent', () => {
    const { products } = validateRows([makeCSVRow()]);
    expect(products[0]!.featured).toBe(false);
  });

  it('defaults featured to false when Featured is empty string', () => {
    const { products } = validateRows([makeCSVRow({ Featured: '' })]);
    expect(products[0]!.featured).toBe(false);
  });

  it('sets featured to true when Featured is "true"', () => {
    const { products } = validateRows([makeCSVRow({ Featured: 'true' })]);
    expect(products[0]!.featured).toBe(true);
  });

  it('sets featured to true when Featured is "True" (case-insensitive)', () => {
    const { products } = validateRows([makeCSVRow({ Featured: 'True' })]);
    expect(products[0]!.featured).toBe(true);
  });

  it('sets featured to true when Featured is "yes"', () => {
    const { products } = validateRows([makeCSVRow({ Featured: 'yes' })]);
    expect(products[0]!.featured).toBe(true);
  });

  it('sets featured to false for non-truthy Featured values', () => {
    const { products } = validateRows([makeCSVRow({ Featured: 'no' })]);
    expect(products[0]!.featured).toBe(false);
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

  it('logs warnings and returns empty array when all rows are invalid', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const csv = makeCSV([makeCSVRow({ SKU: '' })]);
    readFileMock.mockResolvedValue(csv);
    const products = await loadCatalog('/fake/catalog.csv', { lenient: true });
    expect(products).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Row 2, SKU: required'),
    );
    consoleSpy.mockRestore();
  });

  it('returns valid products and warns about invalid rows', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const csv = makeCSV([makeCSVRow({ SKU: '' }), makeCSVRow({ SKU: 'GOOD-001' })]);
    readFileMock.mockResolvedValue(csv);
    const products = await loadCatalog('/fake/catalog.csv', { lenient: true });
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('GOOD-001');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
    );
    consoleSpy.mockRestore();
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

describe('loadCatalog strict mode (default)', () => {
  let loadCatalog: typeof import('../../../src/lib/catalog/csv.js').loadCatalog;
  let CatalogError: typeof import('../../../src/lib/catalog/csv.js').CatalogError;
  let readFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.CORNER_STORE_CATALOG_LENIENT;
    readFileMock = await getReadFileMock();
    ({ loadCatalog, CatalogError } = await import('../../../src/lib/catalog/csv.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('throws CatalogError when any row is invalid', async () => {
    const csv = makeCSV([makeCSVRow({ SKU: '' }), makeCSVRow({ SKU: 'GOOD-001' })]);
    readFileMock.mockResolvedValue(csv);

    await expect(loadCatalog('/fake/catalog.csv')).rejects.toThrow(CatalogError);
  });

  it('CatalogError exposes the underlying issues', async () => {
    const csv = makeCSV([makeCSVRow({ SKU: '' }), makeCSVRow({ SKU: 'BAD!', Name: '' })]);
    readFileMock.mockResolvedValue(csv);

    try {
      await loadCatalog('/fake/catalog.csv');
      throw new Error('expected loadCatalog to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CatalogError);
      const catErr = err as InstanceType<typeof CatalogError>;
      expect(catErr.issues.length).toBeGreaterThanOrEqual(2);
      expect(catErr.message).toContain('Row 2');
      expect(catErr.message).toContain('Row 3');
    }
  });

  it('does not throw when all rows are valid', async () => {
    const csv = makeCSV([makeCSVRow({ SKU: 'GOOD-001' })]);
    readFileMock.mockResolvedValue(csv);

    const products = await loadCatalog('/fake/catalog.csv');
    expect(products).toHaveLength(1);
  });

  it('lenient mode via CORNER_STORE_CATALOG_LENIENT=1 env var skips errors and returns valid rows', async () => {
    process.env.CORNER_STORE_CATALOG_LENIENT = '1';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const csv = makeCSV([makeCSVRow({ SKU: '' }), makeCSVRow({ SKU: 'GOOD-001' })]);
    readFileMock.mockResolvedValue(csv);

    const products = await loadCatalog('/fake/catalog.csv');
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('GOOD-001');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('lenient mode via options.lenient skips errors and returns valid rows', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const csv = makeCSV([makeCSVRow({ SKU: '' }), makeCSVRow({ SKU: 'GOOD-001' })]);
    readFileMock.mockResolvedValue(csv);

    const products = await loadCatalog('/fake/catalog.csv', { lenient: true });
    expect(products).toHaveLength(1);
    expect(products[0]!.sku).toBe('GOOD-001');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('options.lenient overrides absence of env var (explicit beats default)', async () => {
    delete process.env.CORNER_STORE_CATALOG_LENIENT;
    const csv = makeCSV([makeCSVRow({ SKU: '' })]);
    readFileMock.mockResolvedValue(csv);

    // strict default would throw; options.lenient: true should not throw
    await expect(loadCatalog('/fake/catalog.csv', { lenient: true })).resolves.toEqual([]);
  });
});
