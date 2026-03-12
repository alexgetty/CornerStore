# Audit module exports for NPM package surface

## Context

Storefront will ship as an installable NPM package (cloned repo). Every `export` in a barrel file becomes a public API contract — consumers can depend on it, and changing it is a breaking change.

### Case study: `extractProductData`

`extractProductData` is exported from `listings.ts` but not re-exported from `storefront/index.ts`. It takes a raw `Stripe.LineItem` and returns internal `StripeProductData`. This is a low-level data extraction helper that no external consumer should need.

If it were added to the barrel "for convenience," a consumer could start depending on it. Now renaming it, changing its return type, or restructuring the internal `StripeProductData` shape becomes a breaking change for downstream users — even though it was never intended to be public.

The tension: during development, exporting everything is frictionless. For a published package, every export is a maintenance commitment. What's convenient today becomes a constraint tomorrow.

## Principle

**Export what consumers need. Keep internals internal.** The barrel is the public API. If a function isn't in the barrel, it's not part of the contract.

- Exported from barrel = public, stable, semver-protected
- Exported from module file only = accessible for testing but not part of the package API
- Not exported = truly private, free to change

## Action

Audit all exports across `src/lib/storefront/` and `src/lib/stripe/`:

1. For each exported symbol, determine: does an external consumer need this?
2. If yes → ensure it's in the barrel with a stable interface
3. If no → remove the `export` keyword or keep it module-level only for test access
4. Document the intended public API surface

### Known items

- `extractProductData` in `listings.ts` — remove `export`, internal only
- `buildSingleListing`, `buildBundleListing`, `resolveBundleNames` in `listings.ts` — already unexported, correct
- `BUNDLES_DIR`, `BUNDLES_PUBLIC_DIR`, `IMAGE_EXTENSIONS` in `bundles.ts` — currently exported, likely internal only
- `STRIPE_ERROR_MAP` in `errors.ts` — evaluate whether consumers need to inspect error mappings

## Dependency

Do this before first NPM publish. No point auditing repeatedly during active development — do it once when the API stabilizes.
