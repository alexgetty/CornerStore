# Scaffold — Missing `@astrojs/check` and `typescript` devDeps

## Status

Open. Discovered during init-parity-audit DoD verification on 2026-04-24.

## Problem

`bin/init.mjs` scaffolds a `package.json` with `astro` and `@astrojs/mdx` as runtime deps, but no `devDependencies` for `@astrojs/check` or `typescript`. When a consumer runs `npx astro check` in a fresh scaffold, Astro prompts them to install the missing deps before it will run:

```
To continue, Astro requires the following dependency to be installed: @astrojs/check.
  npm i @astrojs/check typescript
```

Not a blocker — Astro offers to install automatically — but it's a rough first impression.

## Options

**A. Bundle them.** Add `@astrojs/check` and `typescript` to the scaffold's `devDependencies`. Typecheck works out of the box. Cost: two more packages in every consumer's install, even ones who never typecheck.

**B. Add a typecheck script + document the install.** Add `"typecheck": "astro check"` to the scaffold's scripts and let the install happen on first run via Astro's auto-install prompt. Cheaper install for consumers who don't care about typecheck.

**C. Do nothing.** `npx astro check` works after accepting the prompt. No scaffold changes.

## Recommendation

Probably B — explicit script signals the feature exists without paying the install cost up front. Decision pending.

## Files touched (if A or B chosen)

- `bin/init.mjs` / `bin/scaffold.mjs` — scaffold `package.json` construction.

## Related

- `docs/todo/archive/init-parity-audit.md` — verified that typecheck passes once deps are installed; the scaffold's generated code is clean.
