import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFsMock, makeDirent, getMatterMock } from './helpers.js';

// Mock node:fs/promises for bundle config tests
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock gray-matter — passthrough by default, overridable per test
vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});

describe('loadBundleConfigs', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('re-throws non-ENOENT errors from readdir', async () => {
    const { readdirMock } = await getFsMock();
    const permErr = new Error('EACCES: permission denied');
    readdirMock.mockRejectedValue(permErr);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );

    await expect(loadBundleConfigs()).rejects.toBe(permErr);
  });

  it('returns empty map when directory does not exist', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
  });

  it('parses frontmatter from subdirectory and returns config keyed by link URL', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('holiday-set', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/abc\ntitle: Holiday Set\ndescription: A cozy set\nimage_alt: Cozy holiday bundle\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.has('https://buy.stripe.com/abc')).toBe(true);
    const config = result.get('https://buy.stripe.com/abc')!;
    expect(config.title).toBe('Holiday Set');
    expect(config.description).toBe('A cozy set');
    expect(config.image).toBe('/bundles/holiday-set/photo.jpg');
    expect(config.image_alt).toBe('Cozy holiday bundle');
  });

  it('skips subdirectory with no .md files', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('images-only', true)]);
      }
      return Promise.resolve(['photo1.jpg', 'photo2.png']);
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
  });

  it('skips non-directory entries in bundles dir', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('real-bundle', true),
          makeDirent('stray-file.md', false),
        ]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
  });

  it('uses first .md file alphabetically when multiple exist and warns', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['notes.md', 'config.md', 'hero.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Config Title\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('multiple .md files');
    expect(allLogCalls).toContain('config.md');
    expect(allLogCalls).toContain('notes.md');
  });

  it('uses first image alphabetically as cover when no cover field', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'zebra.jpg', 'alpha.png']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/alpha.png');
  });

  it('uses cover frontmatter field to select cover image', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'alpha.jpg', 'hero.png']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ncover: hero.png\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/hero.png');
  });

  it('warns and falls back when cover references non-existent file', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('my-bundle', true)]);
      }
      return Promise.resolve(['bundle.md', 'actual.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ncover: missing.png\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBe('/bundles/my-bundle/actual.jpg');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('cover "missing.png" not found');
  });

  it('returns undefined image when no images in directory', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('text-only', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Text Only\n---\n'
    );

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.image).toBeUndefined();
  });

  it('copies images to public/bundles/<dirname>/', async () => {
    const { readdirMock, readFileMock, mkdirMock, copyFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('holiday-set', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo1.jpg', 'photo2.png']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof mkdirMock>>);
    copyFileMock.mockResolvedValue(undefined);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    await loadBundleConfigs();

    expect(mkdirMock).toHaveBeenCalledWith(
      expect.stringContaining('public/bundles/holiday-set'),
      { recursive: true }
    );
    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('bundles/holiday-set/photo1.jpg'),
      expect.stringContaining('public/bundles/holiday-set/photo1.jpg')
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      expect.stringContaining('bundles/holiday-set/photo2.png'),
      expect.stringContaining('public/bundles/holiday-set/photo2.png')
    );
  });

  it('warns and continues when image copy fails', async () => {
    const { readdirMock, readFileMock, mkdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('broken-imgs', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockRejectedValue(new Error('EACCES: permission denied'));

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('failed to copy images');
  });

  it('warns and skips when .md file has no link field', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-bundle', true)]);
      }
      return Promise.resolve(['config.md']);
    }) as never);
    readFileMock.mockResolvedValue('---\ntitle: No Link\n---\n');

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('config.md');
    expect(allLogCalls).toContain('missing required "link"');
  });

  it('warns and skips when link field is not a string', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('numeric-link', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue('---\nlink: 42\ntitle: Bad Link\n---\n');

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('bundle.md');
    expect(allLogCalls).toContain('"link"');
  });

  it('returns partial config when only some fields specified', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('partial', true)]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\ntitle: Just a Title\n---\n'
    );

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.title).toBe('Just a Title');
    expect(config.description).toBeUndefined();
    expect(config.image).toBeUndefined();
    expect(config.image_alt).toBeUndefined();
  });

  it('warns and skips when readFile throws', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('broken', true),
          makeDirent('valid', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('broken')) {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/valid\ntitle: Valid Bundle\n---\n'
      );
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/valid')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/broken/bundle.md:');
  });

  it('warns and skips when readFile throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('weird', true),
          makeDirent('ok', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('weird')) {
        return Promise.reject('string error, not Error instance');
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/ok\ntitle: OK Bundle\n---\n'
      );
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/ok')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/weird/bundle.md:');
    expect(allLogCalls).toContain('string error, not Error instance');
  });

  it('warns and skips when frontmatter is malformed', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('malformed', true),
          makeDirent('good', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('malformed')) {
        return Promise.resolve('---\n: invalid: yaml:\n---\n');
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/good\ntitle: Good Bundle\n---\n'
      );
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/good')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/malformed/bundle.md:');
  });

  it('warns and skips when frontmatter parser throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const matterMock = await getMatterMock();
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('cursed', true),
          makeDirent('fine', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/fine\ntitle: Fine\n---\n'
    );
    const realMatter = ((await vi.importActual('gray-matter')) as { default: (...args: unknown[]) => unknown }).default;
    let callCount = 0;
    matterMock.mockImplementation(((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        throw 42;
      }
      return realMatter(...args);
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    expect(result.has('https://buy.stripe.com/fine')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: bundles/cursed/bundle.md:');
    expect(allLogCalls).toContain('42');
  });

  it('uses first directory alphabetically when duplicate links found', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([
          makeDirent('beta-bundle', true),
          makeDirent('alpha-bundle', true),
        ]);
      }
      return Promise.resolve(['bundle.md']);
    }) as never);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('alpha-bundle')) {
        return Promise.resolve(
          '---\nlink: https://buy.stripe.com/test\ntitle: Alpha Title\n---\n'
        );
      }
      return Promise.resolve(
        '---\nlink: https://buy.stripe.com/test\ntitle: Beta Title\n---\n'
      );
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    const config = result.get('https://buy.stripe.com/test')!;
    expect(config.title).toBe('Alpha Title');

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('duplicate');
  });

  it('warns and skips when subdirectory readdir fails', async () => {
    const { readdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-dir', true)]);
      }
      return Promise.reject(new Error('EACCES: permission denied'));
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('bundles/bad-dir');
    expect(allLogCalls).toContain('failed to read');
  });

  it('warns with stringified value when subdirectory readdir throws non-Error', async () => {
    const { readdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-dir', true)]);
      }
      return Promise.reject('non-error string');
    }) as never);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(0);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('non-error string');
  });

  it('warns with stringified value when image copy throws non-Error', async () => {
    const { readdirMock, readFileMock, mkdirMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockImplementation(((path: string, options?: unknown) => {
      if (options && typeof options === 'object' && 'withFileTypes' in options) {
        return Promise.resolve([makeDirent('bad-copy', true)]);
      }
      return Promise.resolve(['bundle.md', 'photo.jpg']);
    }) as never);
    readFileMock.mockResolvedValue(
      '---\nlink: https://buy.stripe.com/test\n---\n'
    );
    mkdirMock.mockRejectedValue(99);

    const { loadBundleConfigs } = await import(
      '../../../src/lib/storefront/bundles.js'
    );
    const result = await loadBundleConfigs();

    expect(result.size).toBe(1);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('failed to copy images');
    expect(allLogCalls).toContain('99');
  });
});
