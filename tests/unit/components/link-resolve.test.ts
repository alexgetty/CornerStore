import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveLink } from '../../../src/components/Link/resolve';
import type { Category, PageData } from '../../../src/lib/storefront';

const noPages = new Map<string, PageData>();
const home = 'home';

const categories: Category[] = [
  { name: 'T-Shirts', slug: 't-shirts', productCount: 3 },
  { name: 'Hats', slug: 'hats', productCount: 1 },
];

describe('resolveLink — category', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('matches by exact display name', () => {
    expect(
      resolveLink({ category: 'T-Shirts', categories, pages: noPages, home })
    ).toEqual({ label: 'T-Shirts', href: '/category/t-shirts' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('matches by exact slug', () => {
    expect(
      resolveLink({ category: 't-shirts', categories, pages: noPages, home })
    ).toEqual({ label: 'T-Shirts', href: '/category/t-shirts' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('matches by slugified input', () => {
    expect(
      resolveLink({ category: 'T Shirts', categories, pages: noPages, home })
    ).toEqual({ label: 'T-Shirts', href: '/category/t-shirts' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns null and warns when category is not found', () => {
    expect(
      resolveLink({ category: 'Mugs', categories, pages: noPages, home })
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/^\[Link\]/);
    expect(warnSpy.mock.calls[0][0]).toContain('Mugs');
  });
});

const noCategories: Category[] = [];

const pages = new Map<string, PageData>([
  ['home', { slug: 'home', title: 'Welcome', hasExplicitTitle: true, description: undefined }],
  ['about', { slug: 'about', title: 'About', hasExplicitTitle: true, description: undefined }],
  ['shipping-policy', { slug: 'shipping-policy', title: 'Shipping Policy', hasExplicitTitle: true, description: undefined }],
]);

describe('resolveLink — page', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('resolves a regular page to its title and /slug href', () => {
    expect(
      resolveLink({ page: 'about', categories: noCategories, pages, home })
    ).toEqual({ label: 'About', href: '/about' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves a multi-word slug to /slug', () => {
    expect(
      resolveLink({ page: 'shipping-policy', categories: noCategories, pages, home })
    ).toEqual({ label: 'Shipping Policy', href: '/shipping-policy' });
  });

  it('resolves the home page to /', () => {
    expect(
      resolveLink({ page: 'home', categories: noCategories, pages, home })
    ).toEqual({ label: 'Welcome', href: '/' });
  });

  it('honors a non-default home slug', () => {
    expect(
      resolveLink({
        page: 'landing',
        categories: noCategories,
        pages: new Map([
          ['landing', { slug: 'landing', title: 'Welcome', hasExplicitTitle: true, description: undefined }],
        ]),
        home: 'landing',
      })
    ).toEqual({ label: 'Welcome', href: '/' });
  });

  it('returns null and warns when page is not found', () => {
    expect(
      resolveLink({ page: 'nonexistent', categories: noCategories, pages, home })
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/^\[Link\]/);
    expect(warnSpy.mock.calls[0][0]).toContain('nonexistent');
  });
});

describe('resolveLink — prop validation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null and warns when both category and page are provided', () => {
    expect(
      resolveLink({ category: 'T-Shirts', page: 'about', categories, pages, home })
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/^\[Link\]/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/both/i);
  });

  it('returns null and warns when neither category nor page is provided', () => {
    expect(
      resolveLink({ categories, pages, home })
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/^\[Link\]/);
  });

  it('treats an empty-string prop as missing', () => {
    expect(
      resolveLink({ category: '', page: '', categories, pages, home })
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
