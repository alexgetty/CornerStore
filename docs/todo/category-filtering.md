# Category Filtering for Listings

## Summary

`<Listings />` component accepts a `category` prop but has no filtering implementation. There is no category concept on the `Listing` type or in the Stripe data flow yet.

## Current State

- `Listing` type has no `category` field
- Stripe products have metadata (could use `metadata.category`)
- `<Listings category="candles" />` is specced in static-pages.md but cannot filter

## TODO

- Decide how categories are represented (Stripe metadata, local config, or both)
- Add `category` field to `Listing` type
- Populate from Stripe product metadata during `getListings()`
- Implement filter in `<Listings />` component

## Dependencies

- Depends on a decision about category source of truth (Stripe metadata vs local config)
