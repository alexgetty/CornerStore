import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('updateCatalogPaymentLinks', () => {
  let updateCatalogPaymentLinks: typeof import('../../../src/lib/catalog/csv-writer.js').updateCatalogPaymentLinks;
  let readFileMock: ReturnType<typeof vi.fn>;
  let writeFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs/promises');
    readFileMock = vi.mocked(fs.readFile);
    writeFileMock = vi.mocked(fs.writeFile);
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    ({ updateCatalogPaymentLinks } = await import('../../../src/lib/catalog/csv-writer.js'));
  });

  it('updates Payment Link column for matching SKUs', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Payment Link\nA,Widget,1,\n');
    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('https://buy.stripe.com/new');
  });

  it('adds Payment Link column if it does not exist', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\nA,Widget,1\n');
    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('Payment Link');
    expect(written).toContain('https://buy.stripe.com/new');
  });

  it('preserves custom columns', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Custom Col,Payment Link\nA,Widget,1,my-data,\n');
    await updateCatalogPaymentLinks(
      new Map([['A', 'https://buy.stripe.com/new']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('Custom Col');
    expect(written).toContain('my-data');
  });

  it('does not modify rows without matching SKU', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price,Payment Link\nA,Widget,1,https://old\nB,Other,2,https://keep\n');
    await updateCatalogPaymentLinks(
      new Map([['A', 'https://new']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).toContain('https://new');
    expect(written).toContain('https://keep');
  });

  it('writes to the provided path', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\nA,W,1\n');
    await updateCatalogPaymentLinks(new Map(), '/custom/path.csv');
    expect(writeFileMock).toHaveBeenCalledWith('/custom/path.csv', expect.any(String));
  });

  it('does nothing for empty CSV', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\n');
    await updateCatalogPaymentLinks(new Map([['A', 'https://url']]), '/test/catalog.csv');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses default CATALOG_PATH when no path is provided', async () => {
    readFileMock.mockResolvedValue('SKU,Name,Price\nA,Widget,1\n');
    await updateCatalogPaymentLinks(new Map([['A', 'https://url']]));
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  it('skips rows where SKU is missing from the record', async () => {
    readFileMock.mockResolvedValue('Name,Price,Payment Link\nWidget,1,\n');
    await updateCatalogPaymentLinks(
      new Map([['Widget', 'https://should-not-appear']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    expect(written).not.toContain('https://should-not-appear');
  });

  it('preserves quoted fields containing commas through round-trip', async () => {
    const inputCsv =
      'SKU,Name,Description,Price,Payment Link\nSOAP-LAV,Lavender Soap,"Handmade soap, lavender scent",8,\n';
    readFileMock.mockResolvedValue(inputCsv);
    await updateCatalogPaymentLinks(
      new Map([['SOAP-LAV', 'https://buy.stripe.com/soap']]),
      '/test/catalog.csv',
    );
    const written = writeFileMock.mock.calls[0]![1] as string;
    const { parse } = await import('csv-parse/sync');
    const rows = parse(written, { columns: true }) as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Description']).toBe('Handmade soap, lavender scent');
    expect(rows[0]!['Payment Link']).toBe('https://buy.stripe.com/soap');
  });
});
