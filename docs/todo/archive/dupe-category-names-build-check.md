# Build-time Duplicate Category Name Check

## Problem

Categories are referenced by name throughout the storefront (config nav, MDX `<Link category>`, `getCategories()` consumers). Two categories with the same `name` are ambiguous and silently corrupt name-based lookups: whichever the lookup hits first wins. Capitalization differences ("Hats" vs "hats") and surrounding whitespace differences (" Hats " vs "Hats") are not enough to disambiguate, since slugs are derived from a case-insensitive `slugify()` after trim.

This is a data-quality bug that should never compile, not a runtime concern.

## Resolution

The check runs at CSV intake in `src/lib/catalog/csv.ts::parseRow`, mirroring the existing `seenSkus` cross-row uniqueness pattern. A `seenCategories` map keyed by `category.trim().toLowerCase()` records the first-seen original spelling and its row number. When a later row's normalized form matches but its original string differs, `parseRow` emits a `CatalogValidationError` with field `'Category'` and a message naming the conflicting value, the original spelling, and the original row number, e.g. `Category "hats" conflicts with "Hats" on row 3`.

### Why CSV intake, not `extractCategories()`

1. `parseRow` already does cross-row uniqueness validation via `seenSkus`. Adding case-insensitive Category dedup mirrors that exact pattern at the same layer.
2. Intake knows the row number, so the error points at the spreadsheet location the seller is editing. Pointing at SKUs from a downstream extractor would be worse UX.
3. `loadCatalog`'s lenient mode (`CORNER_STORE_CATALOG_LENIENT=1` or `{ lenient: true }`) already skips bad rows with warnings. CSV-layer placement gets that for free.
4. Validating at the source means every downstream consumer of `product.category` inherits the guarantee, not just `extractCategories()`. A future `listings.filter(l => l.category === 'hats')` would silently miss the `'Hats'` row if the check were only in the extractor.

## Behavior

- Empty/null categories are not duplicates. Lots of products legitimately have no category.
- Identical-case duplicates are legitimate ("Hats" and "Hats" is two products in the same category, not a bug). Only flag when normalized form matches but original strings differ.
- The first-seen row produces a valid product. Only conflicting later rows fail validation.
- The Category dedup error coexists with other errors on the same row (does not suppress them), matching the existing pattern.
- In lenient mode, the conflicting row is skipped with a `[Catalog] Warning:` line; the first-seen row is preserved in the output.

## Out of scope

- Auto-merging duplicates. The seller decides which one is canonical.
- Fuzzy similarity warnings ("Hats" vs "Hat"). Exact-match on the normalized form only.
- Diacritic-only collisions. Already handled by exact-match-after-normalize since the CSV stores raw text.

## Why this is its own todo

`<Link>` (`docs/todo/archive/link-component.md`) assumes unique category names. Rather than each consumer defending against duplicates, the invariant is fixed once at the catalog boundary.
