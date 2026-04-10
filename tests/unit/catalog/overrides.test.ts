import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});

async function getFsMocks() {
  const fs = await import('node:fs/promises');
  return {
    readdir: vi.mocked(fs.readdir),
    readFile: vi.mocked(fs.readFile),
  };
}

async function getMatterMock() {
  const m = await import('gray-matter');
  return vi.mocked(m.default);
}

describe('loadProductOverrides', () => {
  let loadProductOverrides: typeof import('../../../src/lib/catalog/overrides.js').loadProductOverrides;
  let mocks: Awaited<ReturnType<typeof getFsMocks>>;

  beforeEach(async () => {
    vi.resetModules();
    mocks = await getFsMocks();
    ({ loadProductOverrides } = await import('../../../src/lib/catalog/overrides.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when directory does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    mocks.readdir.mockRejectedValue(err);

    const result = await loadProductOverrides([], '/fake/products');
    expect(result).toEqual(new Map());
  });

  it('loads override with description from frontmatter', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\ndescription: A great widget\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')).toEqual({
      sku: 'WIDGET-001',
      description: 'A great widget',
      imageAlt: null,
    });
  });

  it('loads override with image_alt from frontmatter', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\nimage_alt: A photo of the widget\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')).toEqual({
      sku: 'WIDGET-001',
      description: null,
      imageAlt: 'A photo of the widget',
    });
  });

  it('warns and skips override with no sku in frontmatter', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\ndescription: No SKU here\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing required "sku" field — skipped'),
    );
  });

  it('warns when override references SKU not in catalog', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['unknown.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: UNKNOWN-999\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('SKU "UNKNOWN-999" has no matching product in catalog — skipped'),
    );
  });

  it('ignores non-markdown files', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md', 'notes.txt', 'image.jpg'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\ndescription: A great widget\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(1);
    // readFile should only be called once (for the .md file)
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it('handles override with no optional fields (description and imageAlt both null)', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')).toEqual({
      sku: 'WIDGET-001',
      description: null,
      imageAlt: null,
    });
  });
});
