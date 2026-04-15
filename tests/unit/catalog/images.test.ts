import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

async function getFsMocks() {
  const fs = await import('node:fs/promises');
  return {
    readdir: vi.mocked(fs.readdir),
    copyFile: vi.mocked(fs.copyFile),
    mkdir: vi.mocked(fs.mkdir),
  };
}

// ─── parseImageFilename ───────────────────────────────────────────────────────

describe('parseImageFilename', () => {
  let parseImageFilename: typeof import('../../../src/lib/catalog/images.js').parseImageFilename;
  const skus = new Set(['WIDGET', 'GADGET', 'ABC-123', 'COOL-THING']);

  beforeEach(async () => {
    vi.resetModules();
    ({ parseImageFilename } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('parses ordered image: SKU-1.jpg', () => {
    expect(parseImageFilename('WIDGET-1.jpg', skus)).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('parses ordered image with multi-digit order', () => {
    expect(parseImageFilename('WIDGET-10.jpg', skus)).toEqual({ sku: 'WIDGET', order: 10 });
  });

  it('matches full filename as unordered when SKU exists', () => {
    expect(parseImageFilename('WIDGET.jpg', skus)).toEqual({ sku: 'WIDGET', order: null });
  });

  it('prefers full filename match over hyphen-split for hyphenated SKUs', () => {
    expect(parseImageFilename('ABC-123.jpg', skus)).toEqual({ sku: 'ABC-123', order: null });
  });

  it('parses non-numeric suffix as unordered', () => {
    expect(parseImageFilename('WIDGET-lifestyle.jpg', skus)).toEqual({ sku: 'WIDGET', order: null });
  });

  it('parses hyphenated SKU with non-numeric suffix as unordered', () => {
    expect(parseImageFilename('COOL-THING-detail.jpg', skus)).toEqual({ sku: 'COOL-THING', order: null });
  });

  it('returns null for non-image extension', () => {
    expect(parseImageFilename('WIDGET-1.md', skus)).toBeNull();
  });

  it('returns null when no SKU matches', () => {
    expect(parseImageFilename('UNKNOWN-1.jpg', skus)).toBeNull();
  });

  it('returns null when filename has no hyphen and does not match a SKU', () => {
    expect(parseImageFilename('random.jpg', skus)).toBeNull();
  });

  it('returns null for empty SKU portion (hyphen at start)', () => {
    expect(parseImageFilename('-1.jpg', skus)).toBeNull();
  });

  it('returns null for zero order', () => {
    expect(parseImageFilename('WIDGET-0.jpg', skus)).toBeNull();
  });

  it('returns null for leading-zero order', () => {
    expect(parseImageFilename('WIDGET-01.jpg', skus)).toBeNull();
  });

  it('returns null when neither prefix nor full filename are in catalog', () => {
    const noMatch = new Set(['OTHER']);
    expect(parseImageFilename('ABC-123.jpg', noMatch)).toBeNull();
  });

  it.each(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'])(
    'handles %s extension',
    (ext) => {
      expect(parseImageFilename(`WIDGET-1${ext}`, skus)).toEqual({ sku: 'WIDGET', order: 1 });
    },
  );
});

// ─── loadProductImages ────────────────────────────────────────────────────────

describe('loadProductImages', () => {
  let loadProductImages: typeof import('../../../src/lib/catalog/images.js').loadProductImages;
  let mocks: Awaited<ReturnType<typeof getFsMocks>>;
  const skus = new Set(['WIDGET', 'GADGET', 'ABC-123']);

  beforeEach(async () => {
    vi.resetModules();
    mocks = await getFsMocks();
    ({ loadProductImages } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    mocks.readdir.mockRejectedValue(err);
    const result = await loadProductImages(skus, '/fake/product-images');
    expect(result).toEqual(new Map());
  });

  it('groups ordered images by SKU sorted by order', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-2.jpg', 'WIDGET-1.jpg', 'GADGET-1.png'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      { url: '/products/images/WIDGET-1.jpg', filename: 'WIDGET-1.jpg' },
      { url: '/products/images/WIDGET-2.jpg', filename: 'WIDGET-2.jpg' },
    ]);
    expect(result.get('GADGET')).toEqual([
      { url: '/products/images/GADGET-1.png', filename: 'GADGET-1.png' },
    ]);
  });

  it('sorts ordered before unordered, unordered alphabetically by filename', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-lifestyle.jpg', 'WIDGET-1.jpg', 'WIDGET-detail.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      { url: '/products/images/WIDGET-1.jpg', filename: 'WIDGET-1.jpg' },
      { url: '/products/images/WIDGET-detail.jpg', filename: 'WIDGET-detail.jpg' },
      { url: '/products/images/WIDGET-lifestyle.jpg', filename: 'WIDGET-lifestyle.jpg' },
    ]);
  });

  it('sorts unordered after ordered when unordered appears first in input', async () => {
    // Provides a scenario where a=unordered, b=ordered hits the b.order !== null branch
    mocks.readdir.mockResolvedValue(['WIDGET-hero.jpg', 'WIDGET-2.jpg', 'WIDGET-1.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      { url: '/products/images/WIDGET-1.jpg', filename: 'WIDGET-1.jpg' },
      { url: '/products/images/WIDGET-2.jpg', filename: 'WIDGET-2.jpg' },
      { url: '/products/images/WIDGET-hero.jpg', filename: 'WIDGET-hero.jpg' },
    ]);
  });

  it('matches full-filename SKU as unordered', async () => {
    mocks.readdir.mockResolvedValue(['ABC-123.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages(skus, '/fake/product-images');

    expect(result.get('ABC-123')).toEqual([
      { url: '/products/images/ABC-123.jpg', filename: 'ABC-123.jpg' },
    ]);
  });

  it('warns for unmatched image files', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg', 'UNKNOWN-1.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('UNKNOWN-1.jpg'),
    );
    consoleSpy.mockRestore();
  });

  it('does not warn for non-image files', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg', 'README.md', 'notes.txt'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    await loadProductImages(skus, '/fake/product-images');

    // Should not warn about README.md or notes.txt
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('README.md'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('notes.txt'));
    consoleSpy.mockRestore();
  });

  it('copies matched images to public directory', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(mocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('products'),
      { recursive: true },
    );
    expect(mocks.copyFile).toHaveBeenCalledWith(
      expect.stringContaining('WIDGET-1.jpg'),
      expect.stringContaining('WIDGET-1.jpg'),
    );
  });

  it('does not call mkdir or copyFile when no images match', async () => {
    mocks.readdir.mockResolvedValue(['README.md'] as never);

    await loadProductImages(skus, '/fake/product-images');

    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('rethrows non-ENOENT errors', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    mocks.readdir.mockRejectedValue(err);

    await expect(loadProductImages(skus, '/fake/product-images')).rejects.toThrow('EACCES');
  });

  it('uses default products/images directory when no dir is provided', async () => {
    mocks.readdir.mockResolvedValue([] as never);

    const result = await loadProductImages(skus);

    expect(result).toEqual(new Map());
    expect(mocks.readdir).toHaveBeenCalledWith(expect.stringContaining('products'));
  });
});
