# Scaffold — `astro build` fails under `npm link corner-store`

## Status

Open. Dev-workflow issue. Discovered during init-parity-audit DoD verification on 2026-04-24.

## Problem

`bin/init.mjs:330` runs `npm link corner-store` when the library is globally linked, so a scaffolded consumer project can pick up in-progress library changes without publishing. That link breaks `astro build` in the scaffolded project:

```
[astro:build] Could not load <absolute-path>/src/components/Cart/Cart.astro?astro&type=script&index=0&lang.ts:
No cached compile metadata found for "<absolute-path>/src/components/Cart/Cart.astro?astro&type=script&index=0&lang.ts".
The main Astro module "<temp-dir>/<absolute-path>/src/components/Cart/Cart.astro" should have compiled and filled the metadata first.
```

Astro's vite plugin can't match the compile-phase key with the load-phase key when the file is reached through a symlink. The specific module is `Cart.astro` because of its client-side `<script>` block — the client build stage is where the symlink resolution diverges.

## Impact

- Consumer-facing impact: **none.** Real consumers install from a tarball / npm registry and get real files in `node_modules/corner-store/`. `astro build` works perfectly for them (verified during the audit).
- Library-dev impact: if you want to verify the full consumer build pipeline end-to-end against in-progress library changes, `npm link` + `astro build` doesn't work. You have to `npm pack` and install the tarball instead.
- `astro check` under link: works. `astro dev` under link: untested.

## Fix options

**A. Document the tarball workflow.** Update any local-dev / DoD verification docs to use `npm pack` + `file:./corner-store-*.tgz` instead of `npm link corner-store`. Lowest cost, accepts the limitation.

**B. Investigate vite `preserveSymlinks` / Astro resolve config.** See if there's a knob that makes the symlinked build work. Risk: might break other things; vite symlink behavior is fraught.

**C. Change `bin/init.mjs` to default to tarball install for local dev.** Detect local dev context (e.g. if `CORNER_STORE_TARBALL` env var is set, install from that path). More ergonomic than (A) but adds CLI surface area.

## Recommendation

Start with (A) — document it. Revisit (B) or (C) only if we hit the limit during actual library iteration.

## Files touched (if any)

- `docs/todo/init-parity-audit.md` — Definition of done step 5 should say "install via `npm pack` + tarball" not "`npm link`".
- Possibly `bin/init.mjs:327-330` — add a comment that `npm link corner-store` is not sufficient to verify downstream `astro build`.

## Related

- `docs/todo/init-parity-audit.md` — DoD steps 1–5 verified 2026-04-24 using tarball install after this issue was hit.
