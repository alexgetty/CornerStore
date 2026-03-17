import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFsMock, getMatterMock } from './helpers.js';
import type { StoreConfig } from '../../../src/lib/storefront/types.js';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('gray-matter', async (importOriginal) => {
  const original = (await importOriginal()) as { default: (...args: unknown[]) => unknown };
  return { default: vi.fn(original.default) };
});

const baseConfig: StoreConfig = {
  name: 'Test Store',
  home: 'home',
  nav: [],
  footerNav: [],
};

describe('loadPages', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when pages/ directory does not exist', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(0);
  });

  it('re-throws non-ENOENT errors from readdir', async () => {
    const { readdirMock } = await getFsMock();
    const permErr = new Error('EACCES: permission denied');
    readdirMock.mockRejectedValue(permErr);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');

    await expect(loadPages(baseConfig)).rejects.toBe(permErr);
  });

  it('parses frontmatter and returns PageData keyed by slug', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['about.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: About Us\n---\nContent here\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('about')).toBe(true);
    const page = result.get('about')!;
    expect(page.slug).toBe('about');
    expect(page.title).toBe('About Us');
    expect(page.hasExplicitTitle).toBe(true);
  });

  it('strips .mdx extension to produce slug', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['shipping-policy.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: Shipping\n---\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.has('shipping-policy')).toBe(true);
  });

  it('uses nav label as title fallback when title is missing and page is in nav', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['about.mdx']);
    readFileMock.mockResolvedValue('---\n---\nNo title here\n');

    const config: StoreConfig = {
      ...baseConfig,
      nav: [{ label: 'About Us', page: 'about' }],
    };

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(config);

    const page = result.get('about')!;
    expect(page.title).toBe('About Us');
    expect(page.hasExplicitTitle).toBe(false);
  });

  it('uses footerNav label as title fallback when title is missing and page is in footerNav', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['faq.mdx']);
    readFileMock.mockResolvedValue('---\n---\n');

    const config: StoreConfig = {
      ...baseConfig,
      footerNav: [{ label: 'FAQ', page: 'faq' }],
    };

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(config);

    const page = result.get('faq')!;
    expect(page.title).toBe('FAQ');
    expect(page.hasExplicitTitle).toBe(false);
  });

  it('prefers nav label over footerNav label when page appears in both', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['about.mdx']);
    readFileMock.mockResolvedValue('---\n---\n');

    const config: StoreConfig = {
      ...baseConfig,
      nav: [{ label: 'About (nav)', page: 'about' }],
      footerNav: [{ label: 'About (footer)', page: 'about' }],
    };

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(config);

    expect(result.get('about')!.title).toBe('About (nav)');
  });

  it('uses slug as title fallback when title is missing and page is not in nav', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['orphan.mdx']);
    readFileMock.mockResolvedValue('---\n---\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    const page = result.get('orphan')!;
    expect(page.title).toBe('orphan');
    expect(page.hasExplicitTitle).toBe(false);
  });

  it('uses slug as title fallback when title is empty string', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['faq.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: ""\n---\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    const page = result.get('faq')!;
    expect(page.title).toBe('faq');
    expect(page.hasExplicitTitle).toBe(false);
  });

  it('uses slug as title fallback when title is not a string', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['about.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: 42\n---\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    const page = result.get('about')!;
    expect(page.title).toBe('about');
    expect(page.hasExplicitTitle).toBe(false);
  });

  it('ignores non-.mdx files in the directory', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['notes.txt', 'readme.md', 'about.mdx', 'style.css']);
    readFileMock.mockResolvedValue('---\ntitle: About\n---\n');

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('about')).toBe(true);
  });

  it('processes multiple files and returns all valid entries', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['about.mdx', 'faq.mdx', 'home.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('about')) return Promise.resolve('---\ntitle: About\n---\n');
      if (path.includes('faq')) return Promise.resolve('---\ntitle: FAQ\n---\n');
      return Promise.resolve('---\ntitle: Home\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(3);
    expect(result.get('about')!.title).toBe('About');
    expect(result.get('faq')!.title).toBe('FAQ');
    expect(result.get('home')!.title).toBe('Home');
  });

  it('returns files sorted alphabetically by filename', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['zebra.mdx', 'alpha.mdx', 'middle.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('alpha')) return Promise.resolve('---\ntitle: Alpha\n---\n');
      if (path.includes('middle')) return Promise.resolve('---\ntitle: Middle\n---\n');
      return Promise.resolve('---\ntitle: Zebra\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    const slugs = [...result.keys()];
    expect(slugs).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('warns and skips when readFile throws', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['broken.mdx', 'good.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('broken')) {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      return Promise.resolve('---\ntitle: Good Page\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('good')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/broken.mdx:');
    expect(allLogCalls).toContain('failed to read');
  });

  it('warns and skips when readFile throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['weird.mdx', 'ok.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('weird')) {
        return Promise.reject('string error');
      }
      return Promise.resolve('---\ntitle: OK\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('ok')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/weird.mdx:');
    expect(allLogCalls).toContain('string error');
  });

  it('warns and skips when frontmatter is malformed', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['malformed.mdx', 'valid.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('malformed')) {
        return Promise.resolve('---\n: invalid: yaml:\n---\n');
      }
      return Promise.resolve('---\ntitle: Valid\n---\n');
    }) as never);

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('valid')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/malformed.mdx:');
    expect(allLogCalls).toContain('failed to parse frontmatter');
  });

  it('warns and skips when frontmatter parser throws non-Error value', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const matterMock = await getMatterMock();
    readdirMock.mockResolvedValue(['cursed.mdx', 'fine.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: Fine\n---\n');
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

    const { loadPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadPages(baseConfig);

    expect(result.size).toBe(1);
    expect(result.has('fine')).toBe(true);

    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('[Storefront] Warning: pages/cursed.mdx:');
    expect(allLogCalls).toContain('42');
  });
});
