# Modularize listings.ts

## Problem

`listings.ts` (340 lines) handles four distinct concerns in one file. Its test file (~1,950 lines) mirrors this — every concern tested through `getListings()`, requiring full Stripe mock setup even for tests that only care about name deduplication or price formatting.

## Goal

One file, one purpose. Each module testable in isolation. The orchestrator wires them together.

## Source decomposition

### `types.ts`
Already exists. Gains two new types:
- `PaymentLink` — domain subset of `Stripe.PaymentLink` (`id`, `url`)
- `PendingBundle` — intermediate between builders and collision resolution. Contains `Omit<BundleListing, 'name'>` plus resolution metadata (`suffix`, `config`, `linkId`). Builder sets `imageAlt` from config (unconfigured images are decorative, `alt=""`). Collision resolution adds only `name`.

### `stripe-adapter.ts`
The Stripe→domain boundary. No Stripe SDK types flow past this module.
- `toProductData(item: Stripe.LineItem): StripeProductData | null`
- `toPaymentLink(link: Stripe.PaymentLink): PaymentLink`

### `listing-builders.ts`
Domain types → listing objects.
- `buildSingleListing(product: StripeProductData, link: PaymentLink): SingleListing`
- `buildBundleListing(productDataItems: StripeProductData[], link: PaymentLink, config: BundleConfig | undefined): { bundle: PendingBundle; warnings: LinkWarning[] }`

### `name-collisions.ts`
- `findUniqueName(baseName: string, usedNames: Set<string>): string`
- `resolveBundleNames(pendingBundles: PendingBundle[]): { listings: BundleListing[]; warnings: LinkWarning[] }`
- Deterministic ordering (sort by link ID), user-defined vs auto-generated priority, suffix numbering

### `get-listings.ts`
Orchestrator. Fetch → adapt → build → resolve → report.
- `getListings(): Promise<Listing[]>`
- Converts Stripe types via adapter immediately after fetch
- Collects warnings from builders and collision resolution
- Orphaned config detection, summary logging

### `index.ts`
Import paths update to new file names. Public API unchanged — `getListings` and `toProductData` are the only barrel exports.

## Test decomposition

Each source module gets its own test file testing only its concern.

| Test file | Tests | Mocking |
|-----------|-------|---------|
| `stripe-adapter.test.ts` | `toProductData`, `toPaymentLink` | None |
| `listing-builders.test.ts` | `buildSingleListing`, `buildBundleListing` | None |
| `name-collisions.test.ts` | `findUniqueName`, `resolveBundleNames` | None |
| `get-listings.test.ts` | `getListings` integration — full pipeline wiring, warnings, logging | Stripe SDK, fs |

## Relationship to other work

See `test-organization.md` — the unit vs integration directory split is a separate concern.

## Risks

- **Import chain breakage**: Tests use dynamic `import()` with `vi.resetModules()`. Splitting source files changes the module graph — verify mocks still intercept correctly.
- **Export surface**: Only `getListings` and `toProductData` are barrel-exported. All other exports are internal to `storefront/`.
- **Test migration completeness**: Run coverage before and after, diff the results.
