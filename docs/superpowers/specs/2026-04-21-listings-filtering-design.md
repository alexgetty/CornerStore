# Listings Filtering: Categories & Featured

## Problem

MDX authors have no way to filter which products appear in a `<Listings>` component. The component renders all storefront products or nothing. Authors need to show subsets: all shirts, featured products, featured hats, etc.

## Approach

Filter in the component (Approach A). `<Listings>` receives all listings from `getListings()` as it does today, then filters at build time based on new props. No changes to `getListings()` or the data layer query interface.

Static site; filtering is a build-time array `.filter()` with negligible cost.

## Data Layer

### New CSV Column: `Featured`

Boolean column in the product catalog CSV. Truthy string ("true") means featured; blank or missing means not featured.

```
SKU,Name,Price,Category,Featured
SHIRT-001,Classic Tee,19.99,Shirt,true
HAT-001,Bucket Hat,24.99,Hat,
```

### Type Changes

**`CatalogProduct`** (src/lib/catalog/types.ts): Add `featured: boolean`.

**`Listing`** (src/lib/storefront/types.ts): Add `featured: boolean`.

**CSV parser** (src/lib/catalog/csv.ts): Map `Featured` column. Truthy string → `true`, blank/missing → `false`.

**`buildListings()`** (src/lib/storefront/get-listings.ts): Pass `featured` through from `CatalogProduct` to `Listing`, same as every other field.

## Component Layer

### New Props on `<Listings>`

- `categories?: string[]` - filter to listings matching any of these category values
- `featured?: boolean` - filter to listings where `featured === true`

Both props are optional. Omitting them preserves current behavior (show everything).

### Filtering Logic

In `Listings.astro` frontmatter, after `getListings()` and before the existing `limit` slice:

1. Get all listings (existing)
2. If `featured` prop is set, filter to `listing.featured === true`
3. If `categories` prop is set, filter to `categories.includes(listing.category)`. Products with `null` category never match a categories filter.
4. Warn to console for any `categories` values that matched zero products
5. Slice by `limit` (existing)

Order: featured narrows first, categories filters within that set, limit caps the result. Warnings fire against the post-featured set so they reflect what the author asked for.

### Empty State

If filtering (or any other reason) produces zero listings, render a message: "No products to display." Styled consistently within the listings container. No interactivity, no toggle.

### Build Warnings

When a `categories` value matches zero products in the filtered set, log a console warning during build:

```
[Listings] Warning: category "Foo" matched no products
```

Warnings do not block the build.

## MDX Usage

```mdx
<!-- All featured products -->
<Listings featured />

<!-- All shirts -->
<Listings categories={["Shirt"]} />

<!-- Featured shirts and hats, max 6 -->
<Listings featured categories={["Shirt", "Hat"]} limit={6} />

<!-- Everything, with view toggle (unchanged) -->
<Listings toggle />
```

## Files Changed

| File | Change |
|------|--------|
| src/lib/catalog/csv.ts | Parse `Featured` column |
| src/lib/catalog/types.ts | Add `featured: boolean` to `CatalogProduct` |
| src/lib/storefront/types.ts | Add `featured: boolean` to `Listing` |
| src/lib/storefront/get-listings.ts | Pass `featured` through in `buildListings()` |
| src/components/Listings/Listings.astro | Add `categories`, `featured` props; filtering logic; empty state |
| src/components/Listings/Listings.css | Empty state styling |
| tests/unit/catalog/csv.test.ts | Test `Featured` column parsing |
| tests/unit/storefront/get-listings.test.ts | Test `featured` passthrough |

## Out of Scope

- Category filtering on `<Listing>` (single product component). Single product lookup is by name/SKU; filtering is a multi-product concern.
- Changes to `getListings()` API. Filtering stays in the component.
- Runtime/client-side filtering. This is build-time only.
