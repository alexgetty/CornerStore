# `<Link>` Component

A general-purpose inline link component that resolves from catalog data. Renders a plain `<a>` tag with label and href derived from the product or category.

## Usage

```mdx
<Link product="COOL-HAT-01" />
<Link category="Shirts" />
```

## Behavior

- `product` prop: resolves label from product name, href from product slug
- `category` prop: resolves label from category name, href to `/category/{slug}`
- Accepts category as original name ("T-Shirts") or slug ("t-shirts")
- Exactly one of `product` or `category` must be provided
- If the target isn't found, renders nothing and logs a build warning
- Exported from the component barrel, available in MDX alongside `Listings` and `Listing`

## Dependencies

- Depends on `getCategories()` and `slugify()` from the auto-category-pages feature
- Depends on product slug resolution from existing storefront lib
