# Audit module exports for NPM package surface

## Context

Storefront will ship as an installable NPM package (cloned repo). Every `export` in a barrel file becomes a public API contract — consumers can depend on it, and changing it is a breaking change.

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

## Dependency

Do this before first NPM publish. No point auditing repeatedly during active development — do it once when the API stabilizes.
