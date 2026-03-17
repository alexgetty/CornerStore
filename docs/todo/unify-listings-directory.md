# Unify bundles/ → listings/

## Summary

Rename `bundles/` to `listings/` and extend local `.md` file support to single-product listings. The local file structure shouldn't care about Stripe's internal distinction between singles and bundles — a listing is a listing.

## Current State

- `bundles/` — local `.md` files with `link` field, matched to Stripe payment links
- Singles — come entirely from Stripe API, no local files

## Proposed

- `listings/` — any listing (single or bundle) CAN have a local `.md` file
- `.md` provides overrides: title, description, image, custom path
- Singles without a local file still work purely from Stripe data
- `link` field in frontmatter connects local file to Stripe payment link (same for both types)

## Scope

Touches: `bundles.ts`, `get-listings.ts`, `stripe-adapter.ts`, all their tests, init scaffolding, `bundles/` public directory convention.

Rename + extend across existing core. Not a bolt-on.

## Dependencies

- None — can be done independently of static pages
- Should be done before static pages ship if possible, so `loadPages()` and `loadListings()` naming is consistent from day one
