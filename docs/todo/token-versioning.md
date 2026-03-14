# Token Versioning Policy

`--cs-*` semantic tokens are a public API contract — theme authors write to them. For an NPM-distributed package, token names are semver-bound once shipped. Renaming or removing a token breaks every custom theme that references it.

## Needs Decision

- When do token names lock? (Presumably v1.0.0)
- What constitutes a breaking change to the token surface? (Rename, removal — obviously. Default value change — probably not.)
- Policy for adding new tokens (minor bump) vs deprecating old ones
- Whether deprecated tokens get a sunset window with fallback aliases or just break in the next major

## Not Urgent Because

The token contract is still being defined (typography scale TBD). No themes exist in the wild yet. This becomes load-bearing at first stable release.
