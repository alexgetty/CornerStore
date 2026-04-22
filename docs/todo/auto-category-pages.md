# Auto-Generated Category Pages

Build-time generation of per-category listing pages from the product catalog. No manual MDX authoring per category.

## Problem

If a shop has categories (Shirts, Hats, Candles), the maker currently has to manually create an MDX page per category with `<Listings categories={["Shirt"]} />`. This doesn't scale, is error-prone, and falls out of sync when categories change in the catalog.

## Direction

- Read all unique categories from the catalog at build time
- Generate a page per category using Astro dynamic routes (e.g., `[category].astro`)
- Each page renders a filtered `<Listings>` for that category
- Category nav should be auto-generated from the same source
- URL structure TBD: `/category/shirts`, `/shirts`, or configurable

## Considerations

- Slugification of category names (e.g., "T-Shirt" -> `t-shirt`)
- Categories with one product vs. many
- Empty categories (all products in a category have `storefront: false`)
- Integration with existing nav system
- Whether this should be opt-in via config or automatic when categories exist
- Relationship to pagination (category pages with many products may need pagination)
