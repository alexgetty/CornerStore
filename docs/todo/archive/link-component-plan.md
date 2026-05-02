# `<Link>` Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `<Link>` MDX component per `docs/todo/link-component.md` v1: `category` and `page` props, build-warning-on-miss, init-parity wiring.

**Architecture:** A pure resolver function (`resolve.ts`) handles all lookup logic and warning emission, fed pre-fetched data. The `Link.astro` template is a thin shell that awaits `loadConfig()`, `loadPages(config)`, and `getCategories()`, then delegates to the resolver and renders `<a>` or nothing. This split lets us TDD the resolver with vitest the same way `tests/unit/storefront/categories.test.ts` exercises pure data, and keeps the Astro template trivial.

**Tech Stack:** Astro 4 (static output), TypeScript, Vitest, existing `corner-store` lib (`getCategories`, `loadConfig`, `loadPages`, `slugify`).

---

## File Structure

**Create:**
- `src/components/Link/resolve.ts` — pure `resolveLink()` function. All branching, all `console.warn` calls.
- `src/components/Link/Link.astro` — Astro shell. Awaits library data, calls resolver, renders.
- `tests/unit/components/link-resolve.test.ts` — Vitest tests for the resolver.

**Modify:**
- `src/components/index.ts` — add `Link` to the public barrel.
- `src/pages/[slug].astro` — add `Link` to import and to the MDX components map (one location each).
- `bin/scaffold.mjs` — add `Link` to `buildIndexPage` and `buildSlugPage` (import line + components map = 4 line-edits total).

**Move on completion:**
- `docs/todo/link-component.md` → `docs/todo/archive/link-component.md`
- `docs/todo/link-component-plan.md` → `docs/todo/archive/link-component-plan.md`

---

## Task 1: Resolver — category branch (TDD)

**Files:**
- Create: `src/components/Link/resolve.ts`
- Create: `tests/unit/components/link-resolve.test.ts`

- [ ] **Step 1: Write the failing tests for category resolution**

```typescript
// tests/unit/components/link-resolve.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: FAIL with "Cannot find module '../../../src/components/Link/resolve'" or similar.

- [ ] **Step 3: Implement the minimal resolver (category branch only)**

```typescript
// src/components/Link/resolve.ts
import type { Category, PageData } from '../../lib/storefront';
import { slugify } from '../../lib/storefront/slugify';

export interface ResolveLinkArgs {
  category?: string | undefined;
  page?: string | undefined;
  categories: Category[];
  pages: Map<string, PageData>;
  home: string;
}

export interface ResolvedLink {
  label: string;
  href: string;
}

export function resolveLink(args: ResolveLinkArgs): ResolvedLink | null {
  const { category, categories } = args;

  if (typeof category === 'string' && category.length > 0) {
    const found =
      categories.find((c) => c.name === category) ??
      categories.find((c) => c.slug === category) ??
      categories.find((c) => c.slug === slugify(category));
    if (!found) {
      console.warn(`[Link] Warning: category "${category}" not found. Rendering nothing.`);
      return null;
    }
    return { label: found.name, href: `/category/${found.slug}` };
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Link/resolve.ts tests/unit/components/link-resolve.test.ts
git commit -m "Add Link resolver with category branch"
```

---

## Task 2: Resolver — page branch (TDD)

**Files:**
- Modify: `src/components/Link/resolve.ts`
- Modify: `tests/unit/components/link-resolve.test.ts`

- [ ] **Step 1: Append failing page-branch tests**

```typescript
// add to tests/unit/components/link-resolve.test.ts

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
      resolveLink({ page: 'landing', categories: noCategories, pages: new Map([
        ['landing', { slug: 'landing', title: 'Welcome', hasExplicitTitle: true, description: undefined }],
      ]), home: 'landing' })
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: 4 category tests pass, 5 page tests fail (returning `null` from a function that doesn't yet handle `page`).

- [ ] **Step 3: Extend the resolver to handle the page branch**

Replace the body of `resolveLink` in `src/components/Link/resolve.ts` with:

```typescript
export function resolveLink(args: ResolveLinkArgs): ResolvedLink | null {
  const { category, page, categories, pages, home } = args;

  if (typeof category === 'string' && category.length > 0) {
    const found =
      categories.find((c) => c.name === category) ??
      categories.find((c) => c.slug === category) ??
      categories.find((c) => c.slug === slugify(category));
    if (!found) {
      console.warn(`[Link] Warning: category "${category}" not found. Rendering nothing.`);
      return null;
    }
    return { label: found.name, href: `/category/${found.slug}` };
  }

  if (typeof page === 'string' && page.length > 0) {
    const entry = pages.get(page);
    if (!entry) {
      console.warn(`[Link] Warning: page "${page}" not found. Rendering nothing.`);
      return null;
    }
    const href = page === home ? '/' : `/${page}`;
    return { label: entry.title, href };
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Link/resolve.ts tests/unit/components/link-resolve.test.ts
git commit -m "Add Link resolver page branch"
```

---

## Task 3: Resolver — prop validation (TDD)

**Files:**
- Modify: `src/components/Link/resolve.ts`
- Modify: `tests/unit/components/link-resolve.test.ts`

- [ ] **Step 1: Append failing validation tests**

```typescript
// add to tests/unit/components/link-resolve.test.ts

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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: previous 9 pass; "both" and "neither" tests fail (no warning emitted, returns null silently).

- [ ] **Step 3: Add validation as the first guard in the resolver**

Insert this block at the top of `resolveLink`'s body, before the existing `if (typeof category === 'string'...)` block:

```typescript
const hasCategory = typeof category === 'string' && category.length > 0;
const hasPage = typeof page === 'string' && page.length > 0;

if (hasCategory && hasPage) {
  console.warn('[Link] Warning: pass exactly one of `category` or `page`, not both. Rendering nothing.');
  return null;
}
if (!hasCategory && !hasPage) {
  console.warn('[Link] Warning: pass exactly one of `category` or `page`. Rendering nothing.');
  return null;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run tests/unit/components/link-resolve.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/Link/resolve.ts tests/unit/components/link-resolve.test.ts
git commit -m "Add Link resolver prop validation"
```

---

## Task 4: `Link.astro` template

**Files:**
- Create: `src/components/Link/Link.astro`

- [ ] **Step 1: Write the Astro template**

```astro
---
import { getCategories } from '../../lib/storefront/categories';
import { loadConfig, loadPages } from '../../lib/storefront';
import { resolveLink } from './resolve';

interface Props {
  category?: string;
  page?: string;
}

const { category, page } = Astro.props;

const config = await loadConfig();
const [categories, pages] = await Promise.all([
  getCategories(),
  loadPages(config),
]);

const resolved = resolveLink({ category, page, categories, pages, home: config.home });
---
{resolved && <a href={resolved.href}>{resolved.label}</a>}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npm run check` (or `npx astro check` if `check` is not a script)
Expected: 0 errors. If the script name differs, look in `package.json` for the type-check command and use that.

- [ ] **Step 3: Verify the full unit-test suite still passes**

Run: `npm test -- --run` (or whichever invocation runs vitest once; check `package.json`)
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add src/components/Link/Link.astro
git commit -m "Add Link.astro template"
```

---

## Task 5: Wire the barrel and the library MDX page

**Files:**
- Modify: `src/components/index.ts`
- Modify: `src/pages/[slug].astro`

- [ ] **Step 1: Add `Link` to the component barrel**

In `src/components/index.ts`, find the line:
```typescript
export { default as Listing } from './Listings/Listing.astro';
```
Immediately after the `Listings` export, add:
```typescript
export { default as Link } from './Link/Link.astro';
```
(Placement is alphabetical-ish to match the surrounding style; if the barrel groups by feature, follow that grouping instead.)

- [ ] **Step 2: Wire `Link` into the library's content page**

In `src/pages/[slug].astro`:

Change line 2 from:
```typescript
import { Hero, Listings, Listing } from 'corner-store/components';
```
to:
```typescript
import { Hero, Listings, Listing, Link } from 'corner-store/components';
```

Change line 32 from:
```astro
<Content components={{ Hero, Listings, Listing }} />
```
to:
```astro
<Content components={{ Hero, Listings, Listing, Link }} />
```

- [ ] **Step 3: Verify build and type-check still pass**

Run: `npm run check && npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/index.ts src/pages/[slug].astro
git commit -m "Expose Link in component barrel and library [slug].astro"
```

---

## Task 6: Init parity — wire `Link` into the scaffolder

**Files:**
- Modify: `bin/scaffold.mjs`

- [ ] **Step 1: Update `buildIndexPage`**

In `bin/scaffold.mjs` around lines 110-140, find the `buildIndexPage` function. Update the import line (currently around line 113) from:
```javascript
import { Hero, Listings, Listing } from 'corner-store/components';
```
to:
```javascript
import { Hero, Listings, Listing, Link } from 'corner-store/components';
```

Update the components map (currently around line 132) from:
```jsx
<Content components={{ Hero, Listings, Listing }} />
```
to:
```jsx
<Content components={{ Hero, Listings, Listing, Link }} />
```

- [ ] **Step 2: Update `buildSlugPage` the same way**

In `bin/scaffold.mjs` around lines 142-180, find `buildSlugPage`. Apply the same two edits there (import line at ~line 145, components map at ~line 174).

Do NOT touch `buildCategorySlugPage`. It intentionally omits non-essential MDX components (matches existing pattern; `Link` is not needed in category page templates by default).

- [ ] **Step 3: Run scaffold into a throwaway directory to verify**

```bash
TMPDIR_LINK=$(mktemp -d)
node bin/init.mjs --target "$TMPDIR_LINK"
grep -n "Link" "$TMPDIR_LINK/src/pages/index.astro" "$TMPDIR_LINK/src/pages/[slug].astro"
```
Expected: both files contain `Link` in the import and in the `components` map. If `bin/init.mjs` does not accept `--target`, fall back to `cd $TMPDIR_LINK && node /absolute/path/to/bin/init.mjs` and inspect the produced files.

Clean up: `rm -rf "$TMPDIR_LINK"`.

- [ ] **Step 4: Commit**

```bash
git add bin/scaffold.mjs
git commit -m "Wire Link into scaffolded pages for init parity"
```

---

## Task 7: End-to-end smoke + archive

**Files:**
- Modify: `pages/about.mdx` (temporarily, for smoke test only — revert after)
- Move: `docs/todo/link-component.md` → `docs/todo/archive/link-component.md`
- Move: `docs/todo/link-component-plan.md` → `docs/todo/archive/link-component-plan.md`

- [ ] **Step 1: Smoke test the happy paths and the warning paths in dev**

Add a temporary block at the bottom of `pages/about.mdx`:
```mdx
<Link category="Shirts" />
<Link category="t-shirts" />
<Link page="shipping-policy" />
<Link page="home" />
<Link category="DoesNotExist" />
<Link page="DoesNotExist" />
<Link />
<Link category="Shirts" page="about" />
```

(Substitute real category names from the dev catalog if "Shirts"/"t-shirts" aren't present.)

Run: `npm run dev`
Open: the rendered about page in a browser.

Expected:
- Four valid `<a>` elements rendered with correct labels and hrefs.
- The four invalid usages render nothing.
- The terminal shows four `[Link] Warning:` lines.

If any of those don't hold, stop and debug — do NOT proceed to revert or commit.

- [ ] **Step 2: Revert the smoke-test block**

Remove the temporary `<Link>` block from `pages/about.mdx` so its working tree is clean.

Run: `git diff pages/about.mdx`
Expected: empty.

- [ ] **Step 3: Move the todo docs into the archive**

```bash
git mv docs/todo/link-component.md docs/todo/archive/link-component.md
git mv docs/todo/link-component-plan.md docs/todo/archive/link-component-plan.md
```

Search for any cross-references that need updating:
```bash
grep -rn "docs/todo/link-component" docs/ src/ bin/ 2>/dev/null
```
If `docs/todo/dupe-category-names-build-check.md` (or any other doc) references the old path, update each to point at `docs/todo/archive/link-component.md`.

- [ ] **Step 4: Final verification**

Run in parallel:
- `npm run check`
- `npm test -- --run`
- `npm run build`

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add docs/todo/archive/link-component.md docs/todo/archive/link-component-plan.md docs/todo/link-component.md docs/todo/link-component-plan.md
# plus any cross-reference updates from Step 3
git commit -m "Archive Link component todo and plan"
```

---

## Self-Review Notes

- Spec coverage: every requirement in `docs/todo/link-component.md` has at least one task. Category resolution (Task 1), page resolution (Task 2), prop validation (Task 3), build warning idiom (assertions in Tasks 1-3), public barrel + library wiring (Task 5), init parity for `bin/scaffold.mjs` (Task 6).
- The `Link.astro` template is not unit-tested directly because the project has no precedent for rendering Astro components in vitest; coverage of that thin shell happens in the Task 7 smoke test.
- Method names used across tasks: `resolveLink`, `ResolveLinkArgs`, `ResolvedLink` — consistent throughout.
- No `product` prop work: explicitly deferred per the spec.
