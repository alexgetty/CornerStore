# Token Versioning Policy

`--cs-*` semantic tokens are a public API contract — theme authors write to them. For an NPM-distributed package, token names are semver-bound once shipped. Renaming or removing a token breaks every custom theme that references it.

* Token names initial lock at V1.0.0
* Renaming or removing a token is considered a breaking change. Default value changes do not.
* Breaking changes require a sunset window. At the next major version, deprecated tokens are removed.
