import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── parseConfig ────────────────────────────────────────────────────────────

describe('parseConfig', () => {
  let parseConfig: typeof import('../../../src/lib/storefront/config.js').parseConfig;

  beforeEach(async () => {
    vi.resetModules();
    ({ parseConfig } = await import('../../../src/lib/storefront/config.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns defaults when raw is undefined', () => {
    const config = parseConfig(undefined);
    expect(config).toEqual({
      name: 'My Store',
      home: 'home',
      nav: [],
      footerNav: [],
    });
  });

  it('returns defaults when raw is null', () => {
    const config = parseConfig(null);
    expect(config).toEqual({
      name: 'My Store',
      home: 'home',
      nav: [],
      footerNav: [],
    });
  });

  it('returns defaults when raw is a primitive', () => {
    expect(parseConfig('string')).toEqual(expect.objectContaining({ name: 'My Store' }));
    expect(parseConfig(42)).toEqual(expect.objectContaining({ name: 'My Store' }));
    expect(parseConfig(true)).toEqual(expect.objectContaining({ name: 'My Store' }));
  });

  it('returns defaults when raw is an array', () => {
    const config = parseConfig([1, 2, 3]);
    expect(config).toEqual({
      name: 'My Store',
      home: 'home',
      nav: [],
      footerNav: [],
    });
  });

  it('extracts name from valid config', () => {
    const config = parseConfig({ name: 'Candle Shop' });
    expect(config.name).toBe('Candle Shop');
  });

  it('defaults name when missing', () => {
    expect(parseConfig({}).name).toBe('My Store');
  });

  it('defaults name when empty string', () => {
    expect(parseConfig({ name: '' }).name).toBe('My Store');
  });

  it('defaults name when non-string', () => {
    expect(parseConfig({ name: 123 }).name).toBe('My Store');
  });

  it('extracts home from valid config', () => {
    const config = parseConfig({ home: 'landing' });
    expect(config.home).toBe('landing');
  });

  it('defaults home when missing', () => {
    expect(parseConfig({}).home).toBe('home');
  });

  it('defaults home when empty string', () => {
    expect(parseConfig({ home: '' }).home).toBe('home');
  });

  it('defaults home when non-string', () => {
    expect(parseConfig({ home: false }).home).toBe('home');
  });

  it('extracts nav array with valid items', () => {
    const config = parseConfig({
      nav: [
        { label: 'Shop', page: 'home' },
        { label: 'About', page: 'about' },
      ],
    });
    expect(config.nav).toEqual([
      { label: 'Shop', page: 'home' },
      { label: 'About', page: 'about' },
    ]);
  });

  it('preserves optional path on nav items', () => {
    const config = parseConfig({
      nav: [{ label: 'Blog', page: 'blog', path: '/writing' }],
    });
    expect(config.nav[0]).toEqual({ label: 'Blog', page: 'blog', path: '/writing' });
  });

  it('filters out null nav items', () => {
    const config = parseConfig({ nav: [null, { label: 'Valid', page: 'x' }] });
    expect(config.nav).toEqual([{ label: 'Valid', page: 'x' }]);
  });

  it('filters out non-object nav items', () => {
    const config = parseConfig({ nav: ['string', 42, true, { label: 'Valid', page: 'x' }] });
    expect(config.nav).toEqual([{ label: 'Valid', page: 'x' }]);
  });

  it('filters out nav items missing label', () => {
    const config = parseConfig({ nav: [{ page: 'about' }] });
    expect(config.nav).toEqual([]);
  });

  it('filters out nav items missing page', () => {
    const config = parseConfig({ nav: [{ label: 'About' }] });
    expect(config.nav).toEqual([]);
  });

  it('filters out nav items with non-string label', () => {
    const config = parseConfig({ nav: [{ label: 123, page: 'about' }] });
    expect(config.nav).toEqual([]);
  });

  it('filters out nav items with non-string page', () => {
    const config = parseConfig({ nav: [{ label: 'About', page: 123 }] });
    expect(config.nav).toEqual([]);
  });

  it('defaults nav to empty array when missing', () => {
    expect(parseConfig({}).nav).toEqual([]);
  });

  it('defaults nav to empty array when non-array', () => {
    expect(parseConfig({ nav: 'not-array' }).nav).toEqual([]);
  });

  it('extracts footerNav array with valid items', () => {
    const config = parseConfig({
      footerNav: [{ label: 'FAQ', page: 'faq' }],
    });
    expect(config.footerNav).toEqual([{ label: 'FAQ', page: 'faq' }]);
  });

  it('filters invalid footerNav items', () => {
    const config = parseConfig({
      footerNav: [null, { label: 'FAQ', page: 'faq' }, { label: 123, page: 'bad' }],
    });
    expect(config.footerNav).toEqual([{ label: 'FAQ', page: 'faq' }]);
  });

  it('defaults footerNav to empty array when missing', () => {
    expect(parseConfig({}).footerNav).toEqual([]);
  });

  it('defaults footerNav to empty array when non-array', () => {
    expect(parseConfig({ footerNav: {} }).footerNav).toEqual([]);
  });
});

// ─── resolveNavItem ─────────────────────────────────────────────────────────

describe('resolveNavItem', () => {
  let resolveNavItem: typeof import('../../../src/lib/storefront/config.js').resolveNavItem;

  beforeEach(async () => {
    vi.resetModules();
    ({ resolveNavItem } = await import('../../../src/lib/storefront/config.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('resolves to / when page matches home', () => {
    const result = resolveNavItem({ label: 'Shop', page: 'home' }, 'home');
    expect(result).toEqual({ label: 'Shop', href: '/' });
  });

  it('resolves to /<page> when page does not match home', () => {
    const result = resolveNavItem({ label: 'About', page: 'about' }, 'home');
    expect(result).toEqual({ label: 'About', href: '/about' });
  });

  it('uses path override when provided', () => {
    const result = resolveNavItem({ label: 'Blog', page: 'blog', path: '/writing' }, 'home');
    expect(result).toEqual({ label: 'Blog', href: '/writing' });
  });

  it('uses path override even when page matches home', () => {
    const result = resolveNavItem({ label: 'Home', page: 'home', path: '/welcome' }, 'home');
    expect(result).toEqual({ label: 'Home', href: '/welcome' });
  });
});

// ─── getNav ─────────────────────────────────────────────────────────────────

describe('getNav', () => {
  let getNav: typeof import('../../../src/lib/storefront/config.js').getNav;

  beforeEach(async () => {
    vi.resetModules();
    ({ getNav } = await import('../../../src/lib/storefront/config.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('resolves both nav and footerNav arrays', () => {
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [
        { label: 'Shop', page: 'home' },
        { label: 'About', page: 'about' },
      ],
      footerNav: [
        { label: 'FAQ', page: 'faq' },
      ],
    });
    expect(result.nav).toEqual([
      { label: 'Shop', href: '/' },
      { label: 'About', href: '/about' },
    ]);
    expect(result.footerNav).toEqual([
      { label: 'FAQ', href: '/faq' },
    ]);
  });

  it('returns empty arrays for empty inputs', () => {
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [],
      footerNav: [],
    });
    expect(result.nav).toEqual([]);
    expect(result.footerNav).toEqual([]);
  });

  it('resolves home page items to / in footerNav too', () => {
    const result = getNav({
      name: 'Test',
      home: 'index',
      nav: [],
      footerNav: [{ label: 'Home', page: 'index' }],
    });
    expect(result.footerNav).toEqual([{ label: 'Home', href: '/' }]);
  });
});

// ─── loadConfig ─────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  let tempDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), 'cs-config-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loads and parses config from cornerstore.config.js', async () => {
    await writeFile(
      join(tempDir, 'cornerstore.config.js'),
      'export default { name: "Candle Shop", home: "landing", nav: [{ label: "Shop", page: "landing" }], footerNav: [] }\n'
    );

    const { loadConfig } = await import('../../../src/lib/storefront/config.js');
    const config = await loadConfig();

    expect(config.name).toBe('Candle Shop');
    expect(config.home).toBe('landing');
    expect(config.nav).toEqual([{ label: 'Shop', page: 'landing' }]);
    expect(config.footerNav).toEqual([]);
  });

  it('returns defaults when config file does not exist', async () => {
    const { loadConfig } = await import('../../../src/lib/storefront/config.js');
    const config = await loadConfig();

    expect(config.name).toBe('My Store');
    expect(config.home).toBe('home');
    expect(config.nav).toEqual([]);
    expect(config.footerNav).toEqual([]);
  });

  it('returns defaults when config file has syntax error', async () => {
    await writeFile(
      join(tempDir, 'cornerstore.config.js'),
      'export default {{{invalid syntax\n'
    );

    const { loadConfig } = await import('../../../src/lib/storefront/config.js');
    const config = await loadConfig();

    expect(config.name).toBe('My Store');
  });

  it('returns defaults when config has no default export', async () => {
    await writeFile(
      join(tempDir, 'cornerstore.config.js'),
      'export const name = "oops";\n'
    );

    const { loadConfig } = await import('../../../src/lib/storefront/config.js');
    const config = await loadConfig();

    expect(config.name).toBe('My Store');
  });
});
