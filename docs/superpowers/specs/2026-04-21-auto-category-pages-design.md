# Auto-Generated Category Pages

## Overview

Build-time generation of per-category listing pages from the product catalog, with an MDX override system for customization, and nav dropdown primitives to expose categories in site navigation.

## Problem

If a shop has categories (Shirts, Hats, Candles), the maker currently has to manually create an MDX page per category with `<Listings categories={["Shirts"]} />`. This doesn't scale, is error-prone, and falls out of sync when categories change in the catalog.

## Design

### 1. Data Layer: `getCategories()`

New function in `src/lib/storefront/`, exported from the barrel. Calls `getListings()` to get the current set of products, then extracts unique categories.

```ts
interface Category {
  name: string;        // original from CSV: "T-Shirts"
  slug: string;        // slugified: "t-shirts"
  productCount: number; // number of listings in this category
}
```

- Products with `category: null` are excluded from category extraction.
- Category visibility inherits whatever product filtering `getListings()` applies. The category system does not define its own filtering logic.
- Empty categories (zero products after filtering) are still returned with `productCount: 0` and a build warning logged.
- Results sorted alphabetically by name.

A standalone pure `slugify()` utility handles slug generation: lowercase, replace non-alphanumeric runs with single hyphens, trim leading/trailing hyphens. Testable in isolation.

### 2. Auto-Generated Category Pages

New Astro dynamic route at `src/pages/category/[slug].astro`.

- `getStaticPaths()` calls `getCategories()` to produce the slug list, excluding any slug that has a corresponding MDX override file in `pages/category/`.
- Each page renders `<ContentPage>` with the category name as the title.
- Each page renders `<Listings categories={[categoryName]} />` as the body.
- No new layout or component needed. Reuses `ContentPage` and `Listings` as they exist today.

Empty categories show the existing `<Listings>` empty state ("No products to display.") and log a build warning. They do not block the build.

URL structure: `/category/{slug}`. Namespaced to avoid collision with MDX page slugs.

### 3. MDX Override System

Resolution order for any `/category/{slug}` URL:

1. **MDX file exists at `pages/category/{slug}.mdx`**: render it, regardless of whether the slug matches a catalog category.
2. **No MDX file, but catalog category matches the slug**: render the auto-generated template.
3. **Neither**: no page generated.

MDX overrides have full control over the page. A maker can add descriptions, featured sections, or any custom layout:

```mdx
---
title: Our Shirts
description: Hand-printed, small batch.
---

## Featured

<Listings categories={["Shirts"]} featured={true} limit={3} />

## Full Collection

<Listings categories={["Shirts"]} />
```

Custom category pages (MDX files in `pages/category/` that don't match any catalog category) are also valid. They live at `/category/{slug}` and participate in the category nav system. A maker can create `pages/category/gift-ideas.mdx` as a curated page without needing a corresponding catalog category.

### 4. Nav Dropdown System

#### Updated Types

```ts
interface NavItem {
  label: string;
  page?: string;       // optional when dropdown is present
  dropdown?: "categories" | string[];
  path?: string;
}
```

Validation: a `NavItem` must have at least one of `page`, `path`, or `dropdown`. `label` is always required.

```ts
interface ResolvedNavItem {
  label: string;
  href?: string;       // optional (dropdown-only items have no href)
  children?: ResolvedNavItem[];
}
```

#### Dropdown Resolution

**`dropdown: "categories"`** resolves at build time by merging two sources:

1. Custom category pages: scan `pages/category/*.mdx` for files that don't match a catalog category. Label from frontmatter `title` (falls back to title-cased filename if no frontmatter title), slug from filename.
2. Catalog categories: from `getCategories()`.

Custom pages come first (alphabetical), then catalog categories (alphabetical). Each entry becomes a `ResolvedNavItem` with `href: /category/{slug}`.

**`dropdown: ["faq", "shipping-policy"]`** resolves each string through the existing page resolution logic (validates MDX existence, warns if missing).

#### Nav Item Behavior

Three valid configurations:

| Config | Top-level behavior | Dropdown |
|--------|-------------------|----------|
| `{ label, page, dropdown }` | Links to resolved page | Reveals children |
| `{ label, dropdown }` | Non-navigable trigger | Reveals children |
| `{ label, page }` | Links to resolved page | None (current behavior) |

#### Nav Component

The `<Nav>` component renders items with `children` as a dropdown. CSS-driven disclosure using `:hover` and `:focus-within`. Keyboard accessible with logical tab order through dropdown items.

### 5. Activation Behavior

Automatic. If the catalog contains categories, category pages are generated. No config flag required.

The design does not prevent adding an opt-out config flag in the future. The `getStaticPaths()` call in the category route can trivially check config before generating pages.

## Out of Scope

- **`<Link>` component**: general-purpose link that resolves from catalog data. Tracked in `docs/todo/link-component.md`.
- **Config opt-out flag**: not needed now. Can be added without breaking changes.
- **Custom ordering for category dropdowns**: makers who need full control over order can use the explicit array form `dropdown: ["gift-ideas", "shirts", "hats"]`.
- **Pagination on category pages**: separate concern, tracked in `docs/todo/listings-pagination.md`.

## Files Affected

### New
- `src/lib/storefront/categories.ts`: `getCategories()`, `slugify()`
- `src/pages/category/[slug].astro`: dynamic route for category pages

### Modified
- `src/lib/storefront/types.ts`: updated `NavItem`, `ResolvedNavItem`, new `Category` type
- `src/lib/storefront/index.ts`: export `getCategories`, `slugify`, `Category`
- `src/lib/storefront/config.ts`: updated `parseConfig` for dropdown nav items, updated `getNav` to resolve dropdowns
- `src/components/Nav/Nav.astro`: render dropdown items
- `src/components/Nav/Nav.css`: dropdown styles
- `src/components/index.ts`: no changes needed (category pages use existing components)
- `bin/init.mjs`: scaffold `pages/category/` directory awareness

### Tests
- `tests/unit/storefront/categories.test.ts`: `getCategories()`, `slugify()`
- `tests/unit/storefront/config.test.ts`: updated for dropdown nav item parsing and validation
- `tests/unit/storefront/get-nav.test.ts`: dropdown resolution (categories and explicit arrays)
