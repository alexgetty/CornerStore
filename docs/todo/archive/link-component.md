# `<Link>` Component

A general-purpose inline link component for use in MDX. Resolves label and href from catalog or page data, so authors don't hand-maintain hrefs that drift when slugs or titles change.

## Usage

```mdx
<Link category="Shirts" />
<Link category="t-shirts" />
<Link page="shipping-policy" />
```

## Props

Exactly one of `category` or `page` must be provided. If both or neither are passed, the component emits a build warning and renders nothing.

### `category`

- Accepts the category's display name ("T-Shirts") or slug ("t-shirts").
- Resolution order: exact `name` match, then exact `slug` match, then `slugify(input)` against `slug`.
- Label: the category's `name`.
- Href: `/category/{slug}`.
- Assumes unique category names. Duplicate-category detection is a separate build-time concern tracked in `docs/todo/dupe-category-names-build-check.md`.

### `page`

- Accepts a page filename slug (e.g. `shipping-policy`, `about`, `home`).
- Label: the page's resolved title from `loadPages()`, which uses frontmatter `title`, then the page's nav label, then the slug, in that order. The component does not add its own fallback layer.
- Href: `/` if the slug equals `config.home`, otherwise `/{slug}` (matches existing nav behavior in `src/lib/storefront/config.ts`).

## Output

Plain `<a href={href}>{label}</a>`. No class, no `data-*` attributes. Styling is inherited from the surrounding MDX context.

## Errors

- Missing or both props: `console.warn('[Link] Warning: ...')`, render nothing.
- Category or page not found: `console.warn('[Link] Warning: ...')`, render nothing.
- These are non-fatal so a stale link in MDX prose doesn't break the build.

## Wiring

- Exported from `src/components/index.ts` (public API contract).
- Added to the MDX components map in `src/pages/[slug].astro` and in both scaffold builders in `bin/scaffold.mjs` (`buildIndexPage`, `buildSlugPage`). Init parity is mandatory; consumer projects scaffolded by `cornerstore init` must get `Link` in their MDX maps in the same change.
- Not added to `buildCategorySlugPage` (consistent with the existing pattern there, which omits `Hero` and other non-essential MDX components).

## Deferred

- **`product` prop.** The storefront does not currently route to product detail pages. Once a product page route exists, add `<Link product="SKU" />` that resolves label from `getListings()` and href from the product's slug. Tracked here; do not stub in v1.

## Dependencies

- `getCategories()` and `slugify()` from `src/lib/storefront/`.
- MDX module glob (`mdxModules`) used by `src/pages/[slug].astro` for reading page frontmatter at build time.
