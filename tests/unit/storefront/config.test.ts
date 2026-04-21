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
      listings: { views: ['card'] },
    });
  });

  it('returns defaults when raw is null', () => {
    const config = parseConfig(null);
    expect(config).toEqual({
      name: 'My Store',
      home: 'home',
      nav: [],
      footerNav: [],
      listings: { views: ['card'] },
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
      listings: { views: ['card'] },
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

  it('extracts contact when valid email string', () => {
    const config = parseConfig({ contact: 'hello@example.com' });
    expect(config.contact).toBe('hello@example.com');
  });

  it('contact is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.contact).toBeUndefined();
  });

  it('contact is undefined when non-string', () => {
    const config = parseConfig({ contact: 42 });
    expect(config.contact).toBeUndefined();
  });

  it('contact is undefined when empty string', () => {
    const config = parseConfig({ contact: '' });
    expect(config.contact).toBeUndefined();
  });

  // ── dropdown nav items ────────────────────────────────────────────

  it('accepts nav item with dropdown: "categories"', () => {
    const config = parseConfig({
      nav: [{ label: 'Shop', dropdown: 'categories' }],
    });
    expect(config.nav).toEqual([{ label: 'Shop', dropdown: 'categories' }]);
  });

  it('accepts nav item with dropdown: "categories" and page', () => {
    const config = parseConfig({
      nav: [{ label: 'Shop', page: 'home', dropdown: 'categories' }],
    });
    expect(config.nav).toEqual([{ label: 'Shop', page: 'home', dropdown: 'categories' }]);
  });

  it('accepts nav item with dropdown string array', () => {
    const config = parseConfig({
      nav: [{ label: 'Info', dropdown: ['faq', 'about'] }],
    });
    expect(config.nav).toEqual([{ label: 'Info', dropdown: ['faq', 'about'] }]);
  });

  it('filters non-string values from dropdown array', () => {
    const config = parseConfig({
      nav: [{ label: 'Info', dropdown: ['faq', 42, null, 'about'] }],
    });
    expect(config.nav).toEqual([{ label: 'Info', dropdown: ['faq', 'about'] }]);
  });

  it('rejects nav item with empty dropdown array after filtering', () => {
    const config = parseConfig({
      nav: [{ label: 'Info', dropdown: [42, null] }],
    });
    expect(config.nav).toEqual([]);
  });

  it('ignores invalid dropdown values', () => {
    const config = parseConfig({
      nav: [{ label: 'Bad', dropdown: 42 }],
    });
    expect(config.nav).toEqual([]);
  });

  it('ignores dropdown: empty string', () => {
    const config = parseConfig({
      nav: [{ label: 'Bad', dropdown: '' }],
    });
    expect(config.nav).toEqual([]);
  });

  it('accepts dropdown-only nav items in footerNav', () => {
    const config = parseConfig({
      footerNav: [{ label: 'Browse', dropdown: 'categories' }],
    });
    expect(config.footerNav).toEqual([{ label: 'Browse', dropdown: 'categories' }]);
  });

  // ── logo ──────────────────────────────────────────────────────────────

  it('extracts logo when valid string', () => {
    const config = parseConfig({ logo: '/logo.png' });
    expect(config.logo).toBe('/logo.png');
  });

  it('logo is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.logo).toBeUndefined();
  });

  it('logo is undefined when empty string', () => {
    const config = parseConfig({ logo: '' });
    expect(config.logo).toBeUndefined();
  });

  it('logo is undefined when non-string', () => {
    const config = parseConfig({ logo: 42 });
    expect(config.logo).toBeUndefined();
  });

  // ── listings ───────────────────────────────────────────────────────────

  it('parses listings.views when valid array', () => {
    const config = parseConfig({ listings: { views: ['card', 'table'] } });
    expect(config.listings).toEqual({ views: ['card', 'table'] });
  });

  it('parses listings.views with single card', () => {
    const config = parseConfig({ listings: { views: ['card'] } });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('parses listings.views with single table', () => {
    const config = parseConfig({ listings: { views: ['table'] } });
    expect(config.listings).toEqual({ views: ['table'] });
  });

  it('preserves view order (first entry is default)', () => {
    const config = parseConfig({ listings: { views: ['table', 'card'] } });
    expect(config.listings).toEqual({ views: ['table', 'card'] });
  });

  it('defaults to { views: ["card"] } when listings is missing', () => {
    const config = parseConfig({});
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('defaults to { views: ["card"] } when listings is null', () => {
    const config = parseConfig({ listings: null });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('defaults to { views: ["card"] } when listings is non-object', () => {
    const config = parseConfig({ listings: 'card' });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('defaults to { views: ["card"] } when listings.views is empty after filtering', () => {
    const config = parseConfig({ listings: { views: ['grid', 'list'] } });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('defaults to { views: ["card"] } when listings.views is empty array', () => {
    const config = parseConfig({ listings: { views: [] } });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('defaults to { views: ["card"] } when listings.views is not an array', () => {
    const config = parseConfig({ listings: { views: 'card' } });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('filters out invalid view values', () => {
    const config = parseConfig({ listings: { views: ['card', 'grid', 'table', 42] } });
    expect(config.listings).toEqual({ views: ['card', 'table'] });
  });

  it('backwards compat: orderSheet true without listings becomes { views: ["card", "table"] }', () => {
    const config = parseConfig({ orderSheet: true });
    expect(config.listings).toEqual({ views: ['card', 'table'] });
  });

  it('backwards compat: orderSheet false without listings defaults to { views: ["card"] }', () => {
    const config = parseConfig({ orderSheet: false });
    expect(config.listings).toEqual({ views: ['card'] });
  });

  it('backwards compat: listings takes precedence over orderSheet', () => {
    const config = parseConfig({ orderSheet: true, listings: { views: ['table'] } });
    expect(config.listings).toEqual({ views: ['table'] });
  });

  // ── minCartSize ───────────────────────────────────────────────────────

  it('extracts minCartSize when positive number', () => {
    const config = parseConfig({ minCartSize: 150 });
    expect(config.minCartSize).toBe(150);
  });

  it('extracts minCartSize when decimal', () => {
    const config = parseConfig({ minCartSize: 99.50 });
    expect(config.minCartSize).toBe(99.50);
  });

  it('minCartSize is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when non-number', () => {
    const config = parseConfig({ minCartSize: '150' });
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when zero', () => {
    const config = parseConfig({ minCartSize: 0 });
    expect(config.minCartSize).toBeUndefined();
  });

  it('minCartSize is undefined when negative', () => {
    const config = parseConfig({ minCartSize: -50 });
    expect(config.minCartSize).toBeUndefined();
  });

  // ── wholesaleMargin ───────────────────────────────────────────────────

  it('extracts wholesaleMargin when valid fraction', () => {
    const config = parseConfig({ wholesaleMargin: 0.5 });
    expect(config.wholesaleMargin).toBe(0.5);
  });

  it('extracts wholesaleMargin at small value', () => {
    const config = parseConfig({ wholesaleMargin: 0.1 });
    expect(config.wholesaleMargin).toBe(0.1);
  });

  it('extracts wholesaleMargin at high value', () => {
    const config = parseConfig({ wholesaleMargin: 0.99 });
    expect(config.wholesaleMargin).toBe(0.99);
  });

  it('wholesaleMargin is undefined when missing', () => {
    const config = parseConfig({});
    expect(config.wholesaleMargin).toBeUndefined();
  });

  it('wholesaleMargin is undefined when non-number', () => {
    const config = parseConfig({ wholesaleMargin: '0.5' });
    expect(config.wholesaleMargin).toBeUndefined();
  });

  it('wholesaleMargin is undefined when zero', () => {
    const config = parseConfig({ wholesaleMargin: 0 });
    expect(config.wholesaleMargin).toBeUndefined();
  });

  it('wholesaleMargin is undefined when 1 or above', () => {
    const config = parseConfig({ wholesaleMargin: 1 });
    expect(config.wholesaleMargin).toBeUndefined();
  });

  it('wholesaleMargin is undefined when negative', () => {
    const config = parseConfig({ wholesaleMargin: -0.5 });
    expect(config.wholesaleMargin).toBeUndefined();
  });

  // ── shippingFlat ──────────────────────────────────────────────────────

  describe('shipping config', () => {
    it('parses shippingFlat when valid positive number', () => {
      const config = parseConfig({ shippingFlat: 9.99 });
      expect(config.shippingFlat).toBe(9.99);
    });

    it('omits shippingFlat when zero', () => {
      const config = parseConfig({ shippingFlat: 0 });
      expect(config.shippingFlat).toBeUndefined();
    });

    it('omits shippingFlat when negative', () => {
      const config = parseConfig({ shippingFlat: -5 });
      expect(config.shippingFlat).toBeUndefined();
    });

    it('omits shippingFlat when not a number', () => {
      const config = parseConfig({ shippingFlat: '9.99' });
      expect(config.shippingFlat).toBeUndefined();
    });

    it('parses shippingFreeThreshold when valid positive number', () => {
      const config = parseConfig({ shippingFreeThreshold: 75 });
      expect(config.shippingFreeThreshold).toBe(75);
    });

    it('omits shippingFreeThreshold when zero', () => {
      const config = parseConfig({ shippingFreeThreshold: 0 });
      expect(config.shippingFreeThreshold).toBeUndefined();
    });

    it('omits shippingFreeThreshold when negative', () => {
      const config = parseConfig({ shippingFreeThreshold: -10 });
      expect(config.shippingFreeThreshold).toBeUndefined();
    });

    it('omits shippingFreeThreshold when not a number', () => {
      const config = parseConfig({ shippingFreeThreshold: '75' });
      expect(config.shippingFreeThreshold).toBeUndefined();
    });
  });

  // ── checkoutUrl ───────────────────────────────────────────────────────

  describe('checkoutUrl config', () => {
    it('parses checkoutUrl when valid string', () => {
      const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: 'https://api.example.com/checkout' });
      expect(config.checkoutUrl).toBe('https://api.example.com/checkout');
    });

    it('omits checkoutUrl when empty string', () => {
      const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: '' });
      expect(config.checkoutUrl).toBeUndefined();
    });

    it('omits checkoutUrl when not a string', () => {
      const config = parseConfig({ name: 'Test', home: 'home', nav: [], footerNav: [], checkoutUrl: 123 });
      expect(config.checkoutUrl).toBeUndefined();
    });
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

  function page(slug: string) {
    return { slug, title: slug, hasExplicitTitle: true, description: undefined };
  }

  it('resolves both nav and footerNav arrays', () => {
    const pages = new Map([['home', page('home')], ['about', page('about')], ['faq', page('faq')]]);
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
      listings: { views: ['card'] },
    }, pages);
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
      listings: { views: ['card'] },
    }, new Map());
    expect(result.nav).toEqual([]);
    expect(result.footerNav).toEqual([]);
  });

  it('resolves home page items to / in footerNav too', () => {
    const pages = new Map([['index', page('index')]]);
    const result = getNav({
      name: 'Test',
      home: 'index',
      nav: [],
      footerNav: [{ label: 'Home', page: 'index' }],
      listings: { views: ['card'] },
    }, pages);
    expect(result.footerNav).toEqual([{ label: 'Home', href: '/' }]);
  });

  it('includes items with matching pages', () => {
    const pages = new Map([['about', page('about')]]);
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [{ label: 'About', page: 'about' }],
      footerNav: [],
      listings: { views: ['card'] },
    }, pages);
    expect(result.nav).toEqual([{ label: 'About', href: '/about' }]);
  });

  it('omits items referencing missing pages', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [{ label: 'About', page: 'about' }],
      footerNav: [],
      listings: { views: ['card'] },
    }, new Map());
    expect(result.nav).toEqual([]);
  });

  it('always includes items with path override regardless of pages', () => {
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [{ label: 'Blog', page: 'blog', path: '/writing' }],
      footerNav: [],
      listings: { views: ['card'] },
    }, new Map());
    expect(result.nav).toEqual([{ label: 'Blog', href: '/writing' }]);
  });

  it('logs warning for each omitted item', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getNav({
      name: 'Test',
      home: 'home',
      nav: [{ label: 'About', page: 'about' }],
      footerNav: [{ label: 'FAQ', page: 'faq' }],
      listings: { views: ['card'] },
    }, new Map());
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('[Storefront] Warning: nav references "about" but pages/about.mdx does not exist');
    expect(warnSpy).toHaveBeenCalledWith('[Storefront] Warning: nav references "faq" but pages/faq.mdx does not exist');
  });

  it('omits all page-based items when pages map is empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [
        { label: 'About', page: 'about' },
        { label: 'FAQ', page: 'faq' },
      ],
      footerNav: [],
      listings: { views: ['card'] },
    }, new Map());
    expect(result.nav).toEqual([]);
  });

  it('handles mix of valid, invalid, and path-override items', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = new Map([['about', page('about')]]);
    const result = getNav({
      name: 'Test',
      home: 'home',
      nav: [
        { label: 'About', page: 'about' },
        { label: 'Missing', page: 'missing' },
        { label: 'Blog', page: 'blog', path: '/writing' },
      ],
      footerNav: [],
      listings: { views: ['card'] },
    }, pages);
    expect(result.nav).toEqual([
      { label: 'About', href: '/about' },
      { label: 'Blog', href: '/writing' },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[Storefront] Warning: nav references "missing" but pages/missing.mdx does not exist');
  });

  it('resolves dropdown: "categories" with catalog categories', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Shop', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [
          { name: 'Hats', slug: 'hats', productCount: 3 },
          { name: 'Shirts', slug: 'shirts', productCount: 5 },
        ],
        customCategoryPages: new Map(),
      },
    );
    expect(result.nav).toEqual([
      {
        label: 'Shop',
        children: [
          { label: 'Hats', href: '/category/hats' },
          { label: 'Shirts', href: '/category/shirts' },
        ],
      },
    ]);
  });

  it('resolves dropdown: "categories" with custom pages before catalog', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Browse', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [
          { name: 'Hats', slug: 'hats', productCount: 2 },
        ],
        customCategoryPages: new Map([
          ['gift-ideas', { slug: 'gift-ideas', title: 'Gift Ideas', hasExplicitTitle: true, description: undefined }],
        ]),
      },
    );
    expect(result.nav).toEqual([
      {
        label: 'Browse',
        children: [
          { label: 'Gift Ideas', href: '/category/gift-ideas' },
          { label: 'Hats', href: '/category/hats' },
        ],
      },
    ]);
  });

  it('deduplicates MDX override from catalog categories', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Browse', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [
          { name: 'Hats', slug: 'hats', productCount: 2 },
          { name: 'Shirts', slug: 'shirts', productCount: 3 },
        ],
        customCategoryPages: new Map([
          ['hats', { slug: 'hats', title: 'Our Hats', hasExplicitTitle: true, description: undefined }],
        ]),
      },
    );
    expect(result.nav[0]!.children).toEqual([
      { label: 'Our Hats', href: '/category/hats' },
      { label: 'Shirts', href: '/category/shirts' },
    ]);
  });

  it('resolves nav item with page + dropdown: "categories"', () => {
    const pages = new Map([['home', page('home')]]);
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Shop', page: 'home', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      pages,
      {
        catalogCategories: [{ name: 'Hats', slug: 'hats', productCount: 1 }],
        customCategoryPages: new Map(),
      },
    );
    expect(result.nav).toEqual([
      {
        label: 'Shop',
        href: '/',
        children: [{ label: 'Hats', href: '/category/hats' }],
      },
    ]);
  });

  it('resolves dropdown string array through page system', () => {
    const pages = new Map([['faq', page('faq')], ['about', page('about')]]);
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Info', dropdown: ['faq', 'about'] }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      pages,
    );
    expect(result.nav).toEqual([
      {
        label: 'Info',
        children: [
          { label: 'faq', href: '/faq' },
          { label: 'about', href: '/about' },
        ],
      },
    ]);
  });

  it('warns and omits missing pages from dropdown array', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = new Map([['faq', page('faq')]]);
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Info', dropdown: ['faq', 'missing'] }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      pages,
    );
    expect(result.nav[0]!.children).toEqual([
      { label: 'faq', href: '/faq' },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dropdown references "missing"'),
    );
  });

  it('drops dropdown-only item when children resolve to empty', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Browse', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [],
        customCategoryPages: new Map(),
      },
    );
    expect(result.nav).toEqual([]);
  });

  it('resolves home page in dropdown array to /', () => {
    const pages = new Map([['home', page('home')]]);
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Stuff', dropdown: ['home'] }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      pages,
    );
    expect(result.nav[0]!.children).toEqual([
      { label: 'home', href: '/' },
    ]);
  });

  it('falls back gracefully when categoryData is not provided', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Browse', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
    );
    expect(result.nav).toEqual([]);
  });

  it('keeps page-referenced item with missing page when dropdown provides children', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Shop', page: 'shop', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [{ name: 'Hats', slug: 'hats', productCount: 1 }],
        customCategoryPages: new Map(),
      },
    );
    expect(result.nav).toEqual([
      {
        label: 'Shop',
        children: [{ label: 'Hats', href: '/category/hats' }],
      },
    ]);
  });

  it('sorts custom category pages alphabetically in dropdown', () => {
    const result = getNav(
      {
        name: 'Test', home: 'home',
        nav: [{ label: 'Browse', dropdown: 'categories' }],
        footerNav: [],
        listings: { views: ['card'] },
      },
      new Map(),
      {
        catalogCategories: [],
        customCategoryPages: new Map([
          ['zebra', { slug: 'zebra', title: 'Zebra', hasExplicitTitle: true, description: undefined }],
          ['alpha', { slug: 'alpha', title: 'Alpha', hasExplicitTitle: true, description: undefined }],
        ]),
      },
    );
    expect(result.nav[0]!.children!.map(c => c.label)).toEqual(['Alpha', 'Zebra']);
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
