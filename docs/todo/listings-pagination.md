# Listings Pagination

Build-time pagination for listing pages with many products. Static page generation, not client-side.

## Problem

A shop with hundreds of products shouldn't render them all on a single page. Currently the only control is `limit`, which caps the count but doesn't provide a way to access the rest.

## Direction

- Build-time page splitting: `/shop/1`, `/shop/2` or similar
- Works for both the full catalog and filtered views (e.g., paginated category pages)
- Astro dynamic routes with `getStaticPaths` generating one page per chunk
- Page size should be configurable (store config or per-component prop)
- Navigation controls: prev/next, page numbers, or both

## Considerations

- Interaction with sort and filter props (pagination applies after filter and sort)
- URL structure: `/page/2`, `?page=2`, `/2`, or nested under category (`/shirts/2`)
- SEO: canonical URLs, rel="next"/"prev"
- Whether this is a component-level concern (prop on `<Listings>`) or a page-level concern (route generation)
- Relationship to auto-generated category pages (paginated category pages need both features)
- Edge cases: last page with fewer items, single-page catalogs shouldn't show pagination controls
