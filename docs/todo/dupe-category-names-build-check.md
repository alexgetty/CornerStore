# Build-time Duplicate Category Name Check

## Problem

Categories are referenced by name throughout the storefront (config nav, MDX `<Link category>`, `getCategories()` consumers). Two categories with the same `name` are ambiguous and silently corrupt name-based lookups: whichever the lookup hits first wins. Capitalization differences ("Hats" vs "hats") are not enough to disambiguate, since slugs are derived from a case-insensitive `slugify()`.

This is a data-quality bug that should never compile, not a runtime concern.

## Proposal

During build (or whenever `getCategories()` first runs), detect duplicate category names and fail the build with a clear error. Comparison should be case-insensitive after trimming whitespace, since case-only differences also produce identical slugs and the same ambiguity.

## Behavior

- Group categories by `name.trim().toLowerCase()` (or by their resolved `slug`, equivalently).
- If any group has more than one entry, throw a build-blocking error listing the conflicting names and the SKUs of the affected listings, so the seller can find and fix them in the catalog source.
- Single-source-of-truth: the check lives next to `extractCategories()` in `src/lib/storefront/categories.ts`, so every consumer (nav, category pages, `<Link>`) inherits the guarantee for free.

## Out of scope

- Auto-merging duplicates. The seller decides which one is canonical.
- Fuzzy similarity warnings ("Hats" vs "Hat"). Exact-match on the normalized form only.

## Why this is its own todo

`<Link>` (`docs/todo/archive/link-component.md`) assumes unique category names. Rather than each consumer defending against duplicates, fix the invariant once at the catalog boundary.
