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

  beforeEach(async () => {
    vi.resetModules();
    ({ parseImageFilename } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('parses simple filename', () => {
    expect(parseImageFilename('WIDGET-1.jpg')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('parses SKU with hyphens', () => {
    expect(parseImageFilename('cool-thing-2.png')).toEqual({ sku: 'cool-thing', order: 2 });
  });

  it('parses SKU with underscores and hyphens', () => {
    expect(parseImageFilename('my_sku-name-3.webp')).toEqual({ sku: 'my_sku-name', order: 3 });
  });

  it('parses multi-digit order', () => {
    expect(parseImageFilename('ABC-10.jpg')).toEqual({ sku: 'ABC', order: 10 });
  });

  it('returns null for non-image extension', () => {
    expect(parseImageFilename('product-1.md')).toBeNull();
  });

  it('returns null for files with no hyphen in name', () => {
    expect(parseImageFilename('product.jpg')).toBeNull();
  });

  it('returns null when order is not numeric', () => {
    expect(parseImageFilename('product-abc.jpg')).toBeNull();
  });

  it('returns null when order is zero', () => {
    expect(parseImageFilename('product-0.jpg')).toBeNull();
  });

  it('returns null when order has leading zeros', () => {
    expect(parseImageFilename('product-01.jpg')).toBeNull();
  });

  it('returns null for empty SKU portion', () => {
    expect(parseImageFilename('-1.jpg')).toBeNull();
  });

  it('handles .jpeg extension', () => {
    expect(parseImageFilename('WIDGET-1.jpeg')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('handles .png extension', () => {
    expect(parseImageFilename('WIDGET-1.png')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('handles .gif extension', () => {
    expect(parseImageFilename('WIDGET-1.gif')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('handles .webp extension', () => {
    expect(parseImageFilename('WIDGET-1.webp')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('handles .avif extension', () => {
    expect(parseImageFilename('WIDGET-1.avif')).toEqual({ sku: 'WIDGET', order: 1 });
  });

  it('handles .svg extension', () => {
    expect(parseImageFilename('WIDGET-1.svg')).toEqual({ sku: 'WIDGET', order: 1 });
  });
});

// ─── loadProductImages ────────────────────────────────────────────────────────

describe('loadProductImages', () => {
  let loadProductImages: typeof import('../../../src/lib/catalog/images.js').loadProductImages;
  let mocks: Awaited<ReturnType<typeof getFsMocks>>;

  beforeEach(async () => {
    vi.resetModules();
    mocks = await getFsMocks();
    ({ loadProductImages } = await import('../../../src/lib/catalog/images.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    mocks.readdir.mockRejectedValue(err);
    const result = await loadProductImages('/fake/product-images');
    expect(result).toEqual(new Map());
  });

  it('groups images by SKU sorted by order', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-2.jpg', 'WIDGET-1.jpg', 'GADGET-1.png'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages('/fake/product-images');

    expect(result.get('WIDGET')).toEqual([
      '/product-images/WIDGET-1.jpg',
      '/product-images/WIDGET-2.jpg',
    ]);
    expect(result.get('GADGET')).toEqual(['/product-images/GADGET-1.png']);
  });

  it('ignores non-image files', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg', 'README.md', 'notes.txt'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages('/fake/product-images');

    expect(result.size).toBe(1);
    expect(result.has('WIDGET')).toBe(true);
  });

  it('ignores files not matching naming convention', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg', 'nohyphen.jpg', 'product-0.jpg', 'product-abc.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    const result = await loadProductImages('/fake/product-images');

    expect(result.size).toBe(1);
    expect(result.has('WIDGET')).toBe(true);
  });

  it('copies images to public directory', async () => {
    mocks.readdir.mockResolvedValue(['WIDGET-1.jpg'] as never);
    mocks.mkdir.mockResolvedValue(undefined as never);
    mocks.copyFile.mockResolvedValue(undefined as never);

    await loadProductImages('/fake/product-images');

    expect(mocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('product-images'),
      { recursive: true },
    );
    expect(mocks.copyFile).toHaveBeenCalledWith(
      expect.stringContaining('WIDGET-1.jpg'),
      expect.stringContaining('WIDGET-1.jpg'),
    );
  });

  it('does not call mkdir or copyFile when no images are found', async () => {
    mocks.readdir.mockResolvedValue(['README.md'] as never);

    await loadProductImages('/fake/product-images');

    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('rethrows non-ENOENT errors', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    mocks.readdir.mockRejectedValue(err);

    await expect(loadProductImages('/fake/product-images')).rejects.toThrow('EACCES');
  });

  it('uses default product-images directory when no dir is provided', async () => {
    mocks.readdir.mockResolvedValue([] as never);

    const result = await loadProductImages();

    expect(result).toEqual(new Map());
    expect(mocks.readdir).toHaveBeenCalledWith(expect.stringContaining('product-images'));
  });
});
