import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCatalogProduct } from './helpers.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

async function getFsMocks() {
  const fs = await import('node:fs/promises');
  return {
    readdir: vi.mocked(fs.readdir),
    readFile: vi.mocked(fs.readFile),
  };
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

  it('uses markdown body as description (not frontmatter description)', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue(
      '---\nsku: WIDGET-001\ndescription: frontmatter desc\n---\nThis is the **rich** body.' as never
    );

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')).toMatchObject({
      sku: 'WIDGET-001',
      description: 'This is the **rich** body.',
    });
  });

  it('returns null description when markdown body is empty', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')).toMatchObject({
      sku: 'WIDGET-001',
      description: null,
    });
  });

  it('returns null description when markdown body is only whitespace', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n\n   \n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.get('WIDGET-001')!.description).toBeNull();
  });

  it('parses image_alts frontmatter map into Map<string, string>', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue(
      '---\nsku: WIDGET-001\nimage_alts:\n  widget-001-1.jpg: Primary angle\n  widget-001-2.jpg: Side view\n---\n' as never
    );

    const result = await loadProductOverrides(catalog, '/fake/products');

    const override = result.get('WIDGET-001')!;
    expect(override.imageAlts).toBeInstanceOf(Map);
    expect(override.imageAlts.get('widget-001-1.jpg')).toBe('Primary angle');
    expect(override.imageAlts.get('widget-001-2.jpg')).toBe('Side view');
  });

  it('defaults imageAlts to empty Map when image_alts is missing', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    const override = result.get('WIDGET-001')!;
    expect(override.imageAlts).toBeInstanceOf(Map);
    expect(override.imageAlts.size).toBe(0);
  });

  it('ignores non-object image_alts value (empty Map)', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\nimage_alts: "not an object"\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    const override = result.get('WIDGET-001')!;
    expect(override.imageAlts).toBeInstanceOf(Map);
    expect(override.imageAlts.size).toBe(0);
  });

  it('ignores array image_alts value (empty Map)', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\nimage_alts:\n  - foo\n  - bar\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    const override = result.get('WIDGET-001')!;
    expect(override.imageAlts).toBeInstanceOf(Map);
    expect(override.imageAlts.size).toBe(0);
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

  it('warns about duplicate SKU and uses the later file alphabetically', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001-a.md', 'widget-001-b.md'] as never);
    mocks.readFile
      .mockResolvedValueOnce('---\nsku: WIDGET-001\n---\nFirst file body.' as never)
      .mockResolvedValueOnce('---\nsku: WIDGET-001\n---\nSecond file body.' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('duplicate override for SKU "WIDGET-001"'),
    );
    expect(result.get('WIDGET-001')!.description).toBe('Second file body.');
  });

  it('logs when rich description is present', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue(
      '---\nsku: WIDGET-001\n---\nSome rich description content.' as never
    );

    await loadProductOverrides(catalog, '/fake/products');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('WIDGET-001: using rich description'),
    );
    consoleSpy.mockRestore();
  });

  it('does not log rich description when body is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    await loadProductOverrides(catalog, '/fake/products');

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('using rich description'),
    );
    consoleSpy.mockRestore();
  });

  it('ignores non-markdown files', async () => {
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md', 'notes.txt', 'image.jpg'] as never);
    mocks.readFile.mockResolvedValue('---\nsku: WIDGET-001\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(1);
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-ENOENT readdir errors', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    mocks.readdir.mockRejectedValue(err);

    await expect(loadProductOverrides([], '/fake/products')).rejects.toThrow('EACCES');
  });

  it('uses default products directory when no dir is provided', async () => {
    mocks.readdir.mockResolvedValue([] as never);

    const result = await loadProductOverrides([]);

    expect(result).toEqual(new Map());
    expect(mocks.readdir).toHaveBeenCalledWith(expect.stringContaining('products'));
  });

  it('warns and skips when readFile fails with an Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockRejectedValue(new Error('disk error'));

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to read'),
    );
    consoleSpy.mockRestore();
  });

  it('warns and skips when readFile fails with a non-Error value', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockRejectedValue('raw string error');

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to read'),
    );
    consoleSpy.mockRestore();
  });

  it('warns and skips when frontmatter parsing fails with an Error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    mocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    mocks.readFile.mockResolvedValue('---\ntitle: [\n---\n' as never);

    const result = await loadProductOverrides(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to parse frontmatter'),
    );
    consoleSpy.mockRestore();
  });

  it('warns and skips when frontmatter parsing fails with a non-Error value', async () => {
    vi.resetModules();
    vi.doMock('../../../src/lib/frontmatter.js', () => ({
      parseFrontmatter: () => { throw 'raw parse failure'; },
    }));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const localMocks = await getFsMocks();
    const { loadProductOverrides: localLoad } = await import('../../../src/lib/catalog/overrides.js');

    const catalog = [makeCatalogProduct({ sku: 'WIDGET-001' })];
    localMocks.readdir.mockResolvedValue(['widget-001.md'] as never);
    localMocks.readFile.mockResolvedValue('some content' as never);

    const result = await localLoad(catalog, '/fake/products');

    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to parse frontmatter'),
    );
    consoleSpy.mockRestore();
  });
});
