# Nav Page Validation

## Problem

`getNav()` blindly resolves every config nav item into a link. If a referenced page doesn't exist (no `.mdx` file in `pages/`), the link renders in the nav but 404s on click. Nothing warns the user, nothing filters the dead link.

The `static-pages.md` spec already calls for this (line 63): "Build-time warning if the file doesn't exist." It was never implemented.

## Fix

`getNav()` filters nav items against loaded pages. Missing pages get a terminal warning and are omitted from the rendered nav. Items with a custom `path` pass through unfiltered (they don't reference a page file).

## Scope

### 1. Change `getNav` signature

`getNav(config, pages)` where `pages` is `Map<string, PageData>`.

Filter logic per nav item:
- Has `path` property: always include (custom URL, no page file expected)
- `page` matches a key in `pages`: include
- `page` doesn't match: omit, log `[Storefront] Warning: nav references "<page>" but pages/<page>.mdx does not exist`

Applies to both `nav` and `footerNav` arrays.

### 2. Update `ContentPage.astro`

Currently calls `loadConfig()` then `getNav(config)`. Needs to also call `loadPages(config)` and pass the result: `getNav(config, pages)`.

### 3. Update existing `getNav` tests

Existing tests pass a config but no pages map. All three tests need the second argument. Test cases to add:

- Items with matching pages are included
- Items referencing missing pages are omitted
- Items with `path` override are always included regardless of pages
- Warning is logged for each omitted item
- Empty pages map omits all page-based items
- Mix of valid, invalid, and path-override items in the same nav array

### 4. Revert the band-aid

Remove the `privacy-policy.mdx` and `terms-of-service.mdx` I copied into `pages/`. The dev repo's config already references them, and once this fix lands, they'll just silently drop from the footer nav until the files are added intentionally. That's the correct behavior.

## Files touched

- `src/lib/storefront/config.ts` (getNav)
- `src/layouts/ContentPage.astro`
- `tests/unit/storefront/config.test.ts`
- `pages/privacy-policy.mdx` (delete)
- `pages/terms-of-service.mdx` (delete)
