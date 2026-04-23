# Scaffold Emission Strategy

## Status

Open. Non-blocking. Surfaced by Task 2 code review of the `checkout` mode init work (`9b6f330`).

## Problem

`bin/init.mjs` currently emits scaffolded files using three different mechanisms:

1. **Inline template literals inside `bin/init.mjs`.** Example: 404, success, cancel pages (around lines 374-446 at `9b6f330`). The page content is a backtick-quoted string in the CLI source.

2. **Pure builder functions in `bin/scaffold.mjs`.** Example: `buildConfigFile`, `buildCartPage`, `buildEnvFile`. The CLI calls the builder, gets a string, writes it to disk.

3. **Static stub files in `bin/stubs/`.** Example: `home.mdx`, `about.mdx`, `shipping-policy.mdx`, `returns-policy.mdx`, `faq.mdx`. The CLI reads the stub file from the package and writes it to the consumer's project unchanged.

## Why it matters

**The split is accidental, not principled.** Contributors adding new scaffolded files pick a mechanism based on what's nearest in `bin/init.mjs`, not based on any rule. This produces:

- Inconsistent testability. `scaffold.mjs` functions are unit-testable; inline template literals require either subprocess integration tests or source-text inspection.
- Inconsistent ownership of dynamic vs. static content. Some dynamic content (like `cart.astro` with a config-derived signal) is in `scaffold.mjs`, while other dynamic content (404/success/cancel with interpolated store name) is inline in `init.mjs`.
- Fragmentation when searching for scaffolded output. A contributor looking for "what does the scaffolded cart page contain?" has to check three places.

## Proposal

Pick one convention. Candidates:

### Option A — Everything through `scaffold.mjs`

All scaffolded file contents originate from functions in `bin/scaffold.mjs`. Static files (stubs) become functions that return a constant string; dynamic files become functions that take parameters.

- Pros: single discovery path, unit-testable by default, consistent with recent direction.
- Cons: more code for static files than a file-on-disk approach.

### Option B — Everything through `bin/stubs/`

Static files stay as stubs; dynamic files become stubs with `{{placeholder}}` tokens that the CLI substitutes at scaffold time. `cart.astro` would be a stub with a placeholder for the `checkoutEnabled` expression.

- Pros: scaffolded files are authored as Astro/JS files (with syntax highlighting and linting in-repo), not as backtick-quoted strings.
- Cons: requires a template-substitution step; placeholders can collide with real syntax; harder to unit-test "did the substitution produce valid output" than "did the builder function return the right string."

### Option C — Hybrid with a clear rule

Static-only content lives in `bin/stubs/`. Any content that requires values derived from init answers (store name, checkout style, URL) lives as a builder function in `bin/scaffold.mjs`. Ban inline template literals in `bin/init.mjs` for anything longer than a few lines.

- Pros: least disruptive; matches current distribution of complexity.
- Cons: the rule has to be actually enforced (CLAUDE.md addition + review discipline).

Recommendation: **Option C**, with a CLAUDE.md rule that any scaffolded file longer than ~10 lines must live in `bin/stubs/` (static) or `bin/scaffold.mjs` (dynamic), never inline in `bin/init.mjs`. Migrate the 404 / success / cancel pages to either `bin/scaffold.mjs:buildStatusPage(kind, storeName)` or `bin/stubs/404.astro` with store-name substitution, as a one-shot cleanup.

## Out of scope (for this todo)

- Whether to rewrite the init CLI to support non-interactive mode (for CI-style testing). Separate concern.
- Whether to split `scaffold.mjs` further (e.g. per-file builder modules). Only if it grows significantly.

## Definition of done

1. A single convention is picked and documented in CLAUDE.md.
2. Existing inline scaffolded files longer than ~10 lines are migrated.
3. `tests/unit/bin/init.test.ts` exercises the full migrated set.
