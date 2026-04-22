# Auto-Generated Category Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate category pages from catalog data, with MDX override support and nav dropdown primitives.

**Architecture:** New `getCategories()` function extracts categories from listings. Astro dynamic route at `/category/[slug]` renders auto pages or MDX overrides. Nav system gains `dropdown` property on nav items, resolved at build time.

**Tech Stack:** TypeScript, Astro, Vitest (100% coverage), existing storefront lib patterns.

**Spec:** `docs/superpowers/specs/2026-04-21-auto-category-pages-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/storefront/slugify.ts` | Pure `slugify()` utility |
| `src/lib/storefront/categories.ts` | `getCategories()`: extract categories from listings |
| `src/pages/category/[slug].astro` | Dynamic route: auto-generated + MDX override category pages |
| `tests/unit/storefront/slugify.test.ts` | Tests for slugify |
| `tests/unit/storefront/categories.test.ts` | Tests for getCategories |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/storefront/types.ts` | Add `Category` type; update `NavItem` (optional `page`, add `dropdown`); update `ResolvedNavItem` (optional `href`, add `children`) |
| `src/lib/storefront/index.ts` | Export new types, functions |
| `src/lib/storefront/config.ts` | Refactor `isValidNavItem` to `parseNavItem`; update `getNav` for dropdown resolution |
| `src/lib/storefront/pages.ts` | Add `loadCategoryPages()` and `titleCase()` |
| `src/components/Nav/Nav.astro` | Render dropdown items |
| `src/components/Nav/Nav.css` | Dropdown styles |
| `src/layouts/ContentPage.astro` | Pass category data to `getNav` |
| `bin/init.mjs` | Scaffold `pages/category/` dir and `src/pages/category/[slug].astro` |
| `tests/unit/storefront/helpers.ts` | Add `makeListing()` helper |
| `tests/unit/storefront/config.test.ts` | Tests for dropdown nav parsing and getNav dropdown resolution |
| `tests/unit/storefront/pages.test.ts` | Tests for `loadCategoryPages` |

---

## Task 1: `slugify` Utility

**Files:**
- Create: `src/lib/storefront/slugify.ts`
- Create: `tests/unit/storefront/slugify.test.ts`
- Modify: `src/lib/storefront/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/storefront/slugify.test.ts
import { describe, it, expect } from 'vitest';
import { slugify } from '../../../src/lib/storefront/slugify.js';

describe('slugify', () => {
  it('lowercases input', () => {
    expect(slugify('Shirts')).toBe('shirts');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('Home Garden')).toBe('home-garden');
  });

  it('replaces ampersands and special characters with hyphens', () => {
    expect(slugify('Home & Garden')).toBe('home-garden');
  });

  it('collapses consecutive non-alphanumeric characters into one hyphen', () => {
    expect(slugify('Home & & Garden')).toBe('home-garden');
  });

  it('trims leading non-alphanumeric characters', () => {
    expect(slugify('&Shirts')).toBe('shirts');
  });

  it('trims trailing non-alphanumeric characters', () => {
    expect(slugify('Shirts&')).toBe('shirts');
  });

  it('strips diacritics from accented characters', () => {
    expect(slugify('Café Supplies')).toBe('cafe-supplies');
  });

  it('passes through already-slugified input unchanged', () => {
    expect(slugify('t-shirts')).toBe('t-shirts');
  });

  it('preserves internal hyphens', () => {
    expect(slugify('T-Shirts')).toBe('t-shirts');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for only special characters', () => {
    expect(slugify('&&&')).toBe('');
  });

  it('handles numeric input', () => {
    expect(slugify('Category 1')).toBe('category-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/slugify.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/storefront/slugify.ts
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/slugify.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Export from barrel**

Add to `src/lib/storefront/index.ts`:

```ts
export { slugify } from './slugify.js';
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass, no regressions

- [ ] **Step 7: Commit**

```
feat: add slugify utility for category URL generation
```

---

## Task 2: `Category` Type + `getCategories`

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Create: `src/lib/storefront/categories.ts`
- Modify: `tests/unit/storefront/helpers.ts`
- Create: `tests/unit/storefront/categories.test.ts`
- Modify: `src/lib/storefront/index.ts`

- [ ] **Step 1: Add `Category` type and `makeListing` helper**

Add to `src/lib/storefront/types.ts`:

```ts
export interface Category {
  name: string;
  slug: string;
  productCount: number;
}
```

Add to `tests/unit/storefront/helpers.ts`:

```ts
import type { Listing } from '../../../src/lib/storefront/types.js';

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    sku: 'TEST-001',
    name: 'Test Product',
    description: null,
    images: [],
    price: '$19.99',
    rawPrice: 1999,
    currency: 'usd',
    category: null,
    status: null,
    paymentLink: null,
    moq: null,
    featured: false,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/storefront/categories.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeListing } from './helpers.js';

vi.mock('../../../src/lib/storefront/get-listings.js', () => ({
  getListings: vi.fn(),
}));

describe('getCategories', () => {
  let getCategories: typeof import('../../../src/lib/storefront/categories.js').getCategories;
  let getListingsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const listings = await import('../../../src/lib/storefront/get-listings.js');
    getListingsMock = vi.mocked(listings.getListings);
    ({ getCategories } = await import('../../../src/lib/storefront/categories.js'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('extracts unique categories from listings', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'HAT-1', category: 'Hats' }),
      makeListing({ sku: 'HAT-2', category: 'Hats' }),
      makeListing({ sku: 'SHIRT-1', category: 'Shirts' }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([
      { name: 'Hats', slug: 'hats', productCount: 2 },
      { name: 'Shirts', slug: 'shirts', productCount: 1 },
    ]);
  });

  it('excludes products with null category', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'HAT-1', category: 'Hats' }),
      makeListing({ sku: 'MISC-1', category: null }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([
      { name: 'Hats', slug: 'hats', productCount: 1 },
    ]);
  });

  it('returns empty array when no listings have categories', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ category: null }),
    ]);
    const categories = await getCategories();
    expect(categories).toEqual([]);
  });

  it('returns empty array when no listings exist', async () => {
    getListingsMock.mockResolvedValue([]);
    const categories = await getCategories();
    expect(categories).toEqual([]);
  });

  it('sorts categories alphabetically by name', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'Z-1', category: 'Zebra Stuff' }),
      makeListing({ sku: 'A-1', category: 'Alpha Goods' }),
      makeListing({ sku: 'M-1', category: 'Middle Things' }),
    ]);
    const categories = await getCategories();
    expect(categories.map(c => c.name)).toEqual([
      'Alpha Goods',
      'Middle Things',
      'Zebra Stuff',
    ]);
  });

  it('slugifies category names', async () => {
    getListingsMock.mockResolvedValue([
      makeListing({ sku: 'TS-1', category: 'T-Shirts' }),
      makeListing({ sku: 'HG-1', category: 'Home & Garden' }),
    ]);
    const categories = await getCategories();
    expect(categories.map(c => c.slug)).toEqual(['home-garden', 't-shirts']);
  });

  it('propagates getListings errors', async () => {
    getListingsMock.mockRejectedValue(new Error('ENOENT: no such file'));
    await expect(getCategories()).rejects.toThrow('ENOENT');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/categories.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/storefront/categories.ts
import type { Category, Listing } from './types.js';
import { slugify } from './slugify.js';
import { getListings } from './get-listings.js';

export function extractCategories(listings: Listing[]): Category[] {
  const counts = new Map<string, number>();

  for (const listing of listings) {
    if (listing.category === null) continue;
    counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1);
  }

  const categories: Category[] = [];
  for (const [name, productCount] of counts) {
    categories.push({ name, slug: slugify(name), productCount });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));
  return categories;
}

export async function getCategories(): Promise<Category[]> {
  const listings = await getListings();
  return extractCategories(listings);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/categories.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Export from barrel**

Add to `src/lib/storefront/index.ts`:

```ts
export type { Category } from './types.js';
export { getCategories } from './categories.js';
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```
feat: add getCategories to extract categories from listings
```

---

## Task 3: `loadCategoryPages`

**Files:**
- Modify: `src/lib/storefront/pages.ts`
- Modify: `tests/unit/storefront/pages.test.ts`
- Modify: `src/lib/storefront/index.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/unit/storefront/pages.test.ts`:

```ts
describe('loadCategoryPages', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty map when pages/category/ does not exist', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();
    expect(result.size).toBe(0);
  });

  it('re-throws non-ENOENT errors from readdir', async () => {
    const { readdirMock } = await getFsMock();
    const permErr = new Error('EACCES: permission denied');
    readdirMock.mockRejectedValue(permErr);

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    await expect(loadCategoryPages()).rejects.toBe(permErr);
  });

  it('reads MDX files from pages/category/ and uses frontmatter title', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['shirts.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: Our Shirts\ndescription: Hand-printed\n---\nContent\n');

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.size).toBe(1);
    expect(result.get('shirts')).toEqual({
      slug: 'shirts',
      title: 'Our Shirts',
      hasExplicitTitle: true,
      description: 'Hand-printed',
    });
  });

  it('title-cases slug when no frontmatter title', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['gift-ideas.mdx']);
    readFileMock.mockResolvedValue('Just content, no frontmatter\n');

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.get('gift-ideas')).toEqual({
      slug: 'gift-ideas',
      title: 'Gift Ideas',
      hasExplicitTitle: false,
      description: undefined,
    });
  });

  it('title-cases single-word slug', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['hats.mdx']);
    readFileMock.mockResolvedValue('Content\n');

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.get('hats')!.title).toBe('Hats');
  });

  it('ignores non-MDX files', async () => {
    const { readdirMock } = await getFsMock();
    readdirMock.mockResolvedValue(['readme.txt', 'notes.md']);

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.size).toBe(0);
  });

  it('processes multiple files sorted alphabetically', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['zebra.mdx', 'alpha.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('alpha')) return Promise.resolve('---\ntitle: Alpha\n---\n');
      return Promise.resolve('---\ntitle: Zebra\n---\n');
    }) as never);

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    const slugs = [...result.keys()];
    expect(slugs).toEqual(['alpha', 'zebra']);
  });

  it('warns and skips when readFile throws', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['broken.mdx', 'good.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('broken')) return Promise.reject(new Error('EACCES'));
      return Promise.resolve('---\ntitle: Good\n---\n');
    }) as never);

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.size).toBe(1);
    expect(result.has('good')).toBe(true);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('pages/category/broken.mdx');
    expect(allLogCalls).toContain('failed to read');
  });

  it('warns and skips when frontmatter is malformed', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readdirMock.mockResolvedValue(['bad.mdx', 'ok.mdx']);
    readFileMock.mockImplementation(((path: string) => {
      if (path.includes('bad')) return Promise.resolve('---\ntitle: [\n---\n');
      return Promise.resolve('---\ntitle: OK\n---\n');
    }) as never);

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.size).toBe(1);
    expect(result.has('ok')).toBe(true);
    const allLogCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogCalls).toContain('pages/category/bad.mdx');
    expect(allLogCalls).toContain('failed to parse frontmatter');
  });

  it('treats empty frontmatter title as missing and falls back to title case', async () => {
    const { readdirMock, readFileMock } = await getFsMock();
    readdirMock.mockResolvedValue(['cool-stuff.mdx']);
    readFileMock.mockResolvedValue('---\ntitle: ""\n---\n');

    const { loadCategoryPages } = await import('../../../src/lib/storefront/pages.js');
    const result = await loadCategoryPages();

    expect(result.get('cool-stuff')!.title).toBe('Cool Stuff');
    expect(result.get('cool-stuff')!.hasExplicitTitle).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/pages.test.ts`
Expected: FAIL (loadCategoryPages not exported)

- [ ] **Step 3: Write the implementation**

Add to `src/lib/storefront/pages.ts`:

```ts
export const CATEGORY_PAGES_DIR = join(process.cwd(), 'pages', 'category');

function titleCase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function loadCategoryPages(): Promise<Map<string, PageData>> {
  const pages = new Map<string, PageData>();

  let files: string[];
  try {
    files = ((await readdir(CATEGORY_PAGES_DIR)) as string[]).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return pages;
    }
    throw err;
  }

  const mdxFiles = files.filter((f) => f.endsWith('.mdx'));

  for (const file of mdxFiles) {
    const slug = file.replace(/\.mdx$/, '');

    let raw: string;
    try {
      raw = await readFile(join(CATEGORY_PAGES_DIR, file), 'utf-8');
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: pages/category/${file}: failed to read — ${getErrorMessage(err)}`);
      continue;
    }

    let rawData: Record<string, unknown>;
    try {
      ({ data: rawData } = parseFrontmatter(raw));
    } catch (err: unknown) {
      console.log(`[Storefront] Warning: pages/category/${file}: failed to parse frontmatter — ${getErrorMessage(err)}`);
      continue;
    }

    const parsed = frontmatterSchema.parse(rawData);
    const hasExplicitTitle = typeof parsed.title === 'string' && parsed.title.length > 0;
    const title = hasExplicitTitle ? parsed.title as string : titleCase(slug);

    pages.set(slug, { slug, title, hasExplicitTitle, description: parsed.description });
  }

  return pages;
}
```

Note: `readdir`, `readFile`, `join`, `parseFrontmatter`, `frontmatterSchema`, `getErrorMessage`, and `PageData` are already imported/declared in this file. No new imports needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/pages.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Export from barrel**

Add to `src/lib/storefront/index.ts`:

```ts
export { loadCategoryPages } from './pages.js';
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```
feat: add loadCategoryPages to scan pages/category/ for MDX overrides
```

---

## Task 4: NavItem/ResolvedNavItem Type Updates + `parseConfig`

**Files:**
- Modify: `src/lib/storefront/types.ts`
- Modify: `src/lib/storefront/config.ts`
- Modify: `tests/unit/storefront/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `parseConfig` describe block in `tests/unit/storefront/config.test.ts`, after the existing nav tests:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: FAIL (dropdown items rejected by current isValidNavItem)

- [ ] **Step 3: Update the types**

In `src/lib/storefront/types.ts`, update `NavItem`:

```ts
export interface NavItem {
  label: string;
  page?: string;
  dropdown?: 'categories' | string[];
  path?: string;
}
```

Update `ResolvedNavItem`:

```ts
export interface ResolvedNavItem {
  label: string;
  href?: string;
  children?: ResolvedNavItem[];
}
```

- [ ] **Step 4: Refactor `isValidNavItem` to `parseNavItem` in `config.ts`**

Replace the `isValidNavItem` function:

```ts
function parseNavItem(item: unknown): NavItem | null {
  if (item === null || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;

  if (typeof rec.label !== 'string') return null;

  const result: NavItem = { label: rec.label };

  if (typeof rec.page === 'string') result.page = rec.page;
  if (typeof rec.path === 'string') result.path = rec.path;

  if (rec.dropdown === 'categories') {
    result.dropdown = 'categories';
  } else if (Array.isArray(rec.dropdown)) {
    const filtered = rec.dropdown.filter(
      (v: unknown): v is string => typeof v === 'string',
    );
    if (filtered.length > 0) result.dropdown = filtered;
  }

  if (result.page === undefined && result.path === undefined && result.dropdown === undefined) {
    return null;
  }

  return result;
}
```

Update the two usages in `parseConfig`:

```ts
nav: Array.isArray(obj.nav)
  ? obj.nav.map(parseNavItem).filter((item): item is NavItem => item !== null)
  : [],
footerNav: Array.isArray(obj.footerNav)
  ? obj.footerNav.map(parseNavItem).filter((item): item is NavItem => item !== null)
  : [],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```
feat: add dropdown property to NavItem type and config parsing
```

---

## Task 5: `getNav` Dropdown Resolution + ContentPage Update

**Files:**
- Modify: `src/lib/storefront/config.ts`
- Modify: `tests/unit/storefront/config.test.ts`
- Modify: `src/layouts/ContentPage.astro`

- [ ] **Step 1: Write the failing tests for getNav dropdown resolution**

Add to the `getNav` describe block in `tests/unit/storefront/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: FAIL (getNav doesn't accept third parameter, no dropdown resolution)

- [ ] **Step 3: Update `getNav` in `config.ts`**

Import the `Category` type at the top of `config.ts`:

```ts
import type { StoreConfig, NavItem, ResolvedNavItem, PageData, Category } from './types.js';
```

Add the `CategoryNavData` interface and update `getNav`:

```ts
export interface CategoryNavData {
  catalogCategories: Category[];
  customCategoryPages: Map<string, PageData>;
}

export function getNav(
  config: StoreConfig,
  pages: Map<string, PageData>,
  categoryData?: CategoryNavData,
): { nav: ResolvedNavItem[]; footerNav: ResolvedNavItem[] } {

  function resolveDropdownChildren(dropdown: 'categories' | string[]): ResolvedNavItem[] {
    if (dropdown === 'categories') {
      if (!categoryData) return [];

      const { catalogCategories, customCategoryPages } = categoryData;
      const catalogSlugs = new Set(catalogCategories.map(c => c.slug));

      const customEntries: ResolvedNavItem[] = [];
      for (const [slug, catPage] of customCategoryPages) {
        if (!catalogSlugs.has(slug)) {
          customEntries.push({ label: catPage.title, href: `/category/${slug}` });
        }
      }
      customEntries.sort((a, b) => a.label.localeCompare(b.label));

      const catalogEntries: ResolvedNavItem[] = [];
      for (const cat of catalogCategories) {
        const override = customCategoryPages.get(cat.slug);
        catalogEntries.push({
          label: override ? override.title : cat.name,
          href: `/category/${cat.slug}`,
        });
      }

      return [...customEntries, ...catalogEntries];
    }

    const children: ResolvedNavItem[] = [];
    for (const pageName of dropdown) {
      const p = pages.get(pageName);
      if (p) {
        children.push({
          label: p.title,
          href: pageName === config.home ? '/' : `/${pageName}`,
        });
      } else {
        console.warn(`[Storefront] Warning: dropdown references "${pageName}" but pages/${pageName}.mdx does not exist`);
      }
    }
    return children;
  }

  function filterAndResolve(items: NavItem[]): ResolvedNavItem[] {
    const result: ResolvedNavItem[] = [];
    for (const item of items) {
      let href: string | undefined;

      if (item.path !== undefined) {
        href = item.path;
      } else if (item.page !== undefined) {
        if (pages.has(item.page)) {
          href = item.page === config.home ? '/' : `/${item.page}`;
        } else if (!item.dropdown) {
          console.warn(`[Storefront] Warning: nav references "${item.page}" but pages/${item.page}.mdx does not exist`);
          continue;
        }
      }

      let children: ResolvedNavItem[] | undefined;
      if (item.dropdown) {
        const resolved = resolveDropdownChildren(item.dropdown);
        if (resolved.length > 0) children = resolved;
      }

      if (href === undefined && !children) {
        continue;
      }

      const resolved: ResolvedNavItem = { label: item.label };
      if (href !== undefined) resolved.href = href;
      if (children) resolved.children = children;
      result.push(resolved);
    }
    return result;
  }

  return {
    nav: filterAndResolve(config.nav),
    footerNav: filterAndResolve(config.footerNav),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storefront/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Export `CategoryNavData` from barrel**

Add to `src/lib/storefront/index.ts`:

```ts
export type { CategoryNavData } from './config.js';
```

- [ ] **Step 6: Update `ContentPage.astro`**

Update the imports and add category data loading. In `src/layouts/ContentPage.astro`, update the frontmatter:

```ts
import { loadConfig, loadPages, getNav, getListings, getCategories, loadCategoryPages, DEFAULT_CURRENCY } from "../lib/storefront";
```

After `const { nav, footerNav } = getNav(config, pages);`, replace with:

```ts
const categories = await getCategories();
const categoryPages = await loadCategoryPages();
const { nav, footerNav } = getNav(config, pages, {
  catalogCategories: categories,
  customCategoryPages: categoryPages,
});
```

Also update the footer template to handle optional `href` on `ResolvedNavItem`:

Replace:
```astro
{footerNav.map((item: ResolvedNavItem) => (
  <li><a href={item.href}>{item.label}</a></li>
))}
```

With:
```astro
{footerNav.map((item: ResolvedNavItem) => (
  <li>{item.href ? <a href={item.href}>{item.label}</a> : item.label}</li>
))}
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```
feat: add dropdown resolution to getNav with category support
```

---

## Task 6: `category/[slug].astro` + `bin/init.mjs`

**Files:**
- Create: `src/pages/category/[slug].astro`
- Modify: `bin/init.mjs`

- [ ] **Step 1: Create the category page route**

```astro
---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { loadConfig, getCategories, loadCategoryPages } from 'corner-store';

export async function getStaticPaths() {
  const config = await loadConfig();
  const categories = await getCategories();
  const categoryPages = await loadCategoryPages();

  const paths = [];

  for (const [slug, catPage] of categoryPages) {
    paths.push({
      params: { slug },
      props: { page: catPage, isMdx: true },
    });
  }

  for (const cat of categories) {
    if (!categoryPages.has(cat.slug)) {
      paths.push({
        params: { slug: cat.slug },
        props: { categoryName: cat.name, isMdx: false },
      });
    }
  }

  return paths;
}

const { page, categoryName, isMdx } = Astro.props;
const slug = Astro.params.slug;

let Content = null;
if (isMdx) {
  const mdxModules = import.meta.glob('/pages/category/*.mdx');
  const loader = mdxModules[`/pages/category/${slug}.mdx`];
  if (loader) {
    const mod = await loader();
    Content = mod.default;
  }
}
---

{isMdx && Content ? (
  <ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
    <Content components={{ Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={categoryName}>
    <Listings categories={[categoryName]} />
  </ContentPage>
)}
```

- [ ] **Step 2: Add scaffolding to `bin/init.mjs`**

Add after the existing `await mkdir(join(dir, 'pages'), { recursive: true });` line:

```js
await mkdir(join(dir, 'pages', 'category'), { recursive: true });
await mkdir(join(dir, 'src', 'pages', 'category'), { recursive: true });
```

Add the category route scaffolding after the `src/pages/[slug].astro` safeWrite block:

```js
// src/pages/category/[slug].astro
await safeWrite(join(dir, 'src', 'pages', 'category', '[slug].astro'), `---
import ContentPage from 'corner-store/layouts/ContentPage';
import { Listings, Listing } from 'corner-store/components';
import { loadConfig, getCategories, loadCategoryPages } from 'corner-store';

export async function getStaticPaths() {
  const config = await loadConfig();
  const categories = await getCategories();
  const categoryPages = await loadCategoryPages();

  const paths = [];

  for (const [slug, catPage] of categoryPages) {
    paths.push({
      params: { slug },
      props: { page: catPage, isMdx: true },
    });
  }

  for (const cat of categories) {
    if (!categoryPages.has(cat.slug)) {
      paths.push({
        params: { slug: cat.slug },
        props: { categoryName: cat.name, isMdx: false },
      });
    }
  }

  return paths;
}

const { page, categoryName, isMdx } = Astro.props;
const slug = Astro.params.slug;

let Content = null;
if (isMdx) {
  const mdxModules = import.meta.glob('/pages/category/*.mdx');
  const loader = mdxModules[\`/pages/category/\${slug}.mdx\`];
  if (loader) {
    const mod = await loader();
    Content = mod.default;
  }
}
---

{isMdx && Content ? (
  <ContentPage title={page.title} hasExplicitTitle={page.hasExplicitTitle}>
    <Content components={{ Listings, Listing }} />
  </ContentPage>
) : (
  <ContentPage title={categoryName}>
    <Listings categories={[categoryName]} />
  </ContentPage>
)}
\`);
```

Note: The template literal in init.mjs needs `\`` escaping for the backticks inside the glob path, matching the existing pattern used for `[slug].astro`.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Verify dev server** (manual)

Run: `npm run dev`
If catalog has categories, visit `/category/{slug}` to confirm pages render.

- [ ] **Step 5: Commit**

```
feat: add category/[slug].astro dynamic route with MDX override support
```

---

## Task 7: Nav Dropdown Rendering

**Files:**
- Modify: `src/components/Nav/Nav.astro`
- Modify: `src/components/Nav/Nav.css`

- [ ] **Step 1: Update `Nav.astro` to render dropdowns**

Replace the nav `<ul>` content in `Nav.astro`:

```astro
<ul class="cs-nav-links">
  {nav.map((item) => (
    item.children ? (
      <li class="cs-nav-dropdown">
        {item.href ? (
          <a
            href={item.href}
            class="cs-nav-dropdown-trigger"
            {...(normalizedCurrentPath === normalizePath(item.href) ? { "aria-current": "page" as const } : {})}
          >
            {item.label}
          </a>
        ) : (
          <button type="button" class="cs-nav-dropdown-trigger">
            {item.label}
          </button>
        )}
        <ul class="cs-nav-dropdown-menu">
          {item.children.map((child) => (
            <li>
              <a
                href={child.href}
                {...(normalizedCurrentPath === normalizePath(child.href ?? '') ? { "aria-current": "page" as const } : {})}
              >
                {child.label}
              </a>
            </li>
          ))}
        </ul>
      </li>
    ) : (
      <li>
        <a
          href={item.href}
          {...(normalizedCurrentPath === normalizePath(item.href ?? '') ? { "aria-current": "page" as const } : {})}
        >
          {item.label}
        </a>
      </li>
    )
  ))}
</ul>
```

- [ ] **Step 2: Add dropdown styles to `Nav.css`**

Add inside the existing `@layer package { ... }` block:

```css
  .cs-nav-dropdown {
    position: relative;
  }

  .cs-nav-dropdown-trigger {
    font-size: var(--cs-font-size-small);
    color: var(--cs-body-text-color);
    text-decoration: none;
    transition: color var(--cs-transition-fast);
    background-color: transparent;
    border-width: 0;
    padding-top: 0;
    padding-right: 0;
    padding-bottom: 0;
    padding-left: 0;
    font-family: inherit;
    cursor: pointer;
  }

  .cs-nav-dropdown-trigger:hover {
    color: var(--cs-heading-text-color);
  }

  .cs-nav-dropdown-trigger:focus-visible {
    outline-width: var(--cs-focus-width);
    outline-style: solid;
    outline-color: var(--cs-focus-color);
    outline-offset: var(--cs-focus-offset);
  }

  .cs-nav-dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.5rem;
    padding-right: 0.75rem;
    padding-bottom: 0.5rem;
    padding-left: 0.75rem;
    background-color: var(--cs-header-surface, var(--cs-surface-color));
    border-width: 1px;
    border-style: solid;
    border-color: var(--cs-border-color);
    border-radius: var(--cs-border-radius, 0.25rem);
    min-width: 10rem;
    z-index: 10;
  }

  .cs-nav-dropdown:hover .cs-nav-dropdown-menu,
  .cs-nav-dropdown:focus-within .cs-nav-dropdown-menu {
    display: flex;
  }

  .cs-nav-dropdown-menu a {
    font-size: var(--cs-font-size-small);
    color: var(--cs-body-text-color);
    text-decoration: none;
    white-space: nowrap;
    transition: color var(--cs-transition-fast);
  }

  .cs-nav-dropdown-menu a:hover {
    color: var(--cs-heading-text-color);
  }

  .cs-nav-dropdown-menu a:focus-visible {
    outline-width: var(--cs-focus-width);
    outline-style: solid;
    outline-color: var(--cs-focus-color);
    outline-offset: var(--cs-focus-offset);
  }
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Visual verification** (manual)

Run: `npm run dev`
Configure a nav item with `dropdown: "categories"` in `cornerstore.config.js`. Verify:
- Dropdown appears on hover
- Dropdown appears on keyboard focus
- Category links navigate correctly
- Dropdown-only items render as buttons
- Link + dropdown items render as links with dropdown

- [ ] **Step 5: Commit**

```
feat: add nav dropdown rendering with CSS-driven disclosure
```
