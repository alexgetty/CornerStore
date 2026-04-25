# CSS Strip Pass — Package Neutrals + Starter Theme Extraction

## Status

Audit attempted, partially lost to tool-result truncation. Settled architecture below is final. Phase 2 implementer must reconstruct the full per-file violation report and bare-token inventory from the source files before editing.

## Principle

**Package ships structure + tokens. Themes ship behavior + look.**

- Package CSS references tokens via `var(--cs-*)`.
- Tokens used in package CSS get **structurally-neutral defaults** at the rule site: `transparent`, `0`, `currentColor`, `inherit`, `none`.
- Package never carries baked-in light-mode opinions a dark theme would have to override.
- Consumers get a **starter theme** auto-imported by the **scaffolded consumer project**, NOT by the package itself. Custom themes simply don't import the starter.

## Settled architecture decisions

1. **Package auto-loaded CSS** = structural neutrals only. Zero light-mode opinion.
2. **Starter theme lives at `theme/theme.css`** in the repo. The opinionated content currently in `src/styles/defaults.css` (plus the doc comments already in `theme/theme.css`) gets consolidated there. No new file under `src/styles/`.
3. **Delivery mechanism is the one that already exists.** `Base.astro:19-23` reads `theme/theme.css` from `process.cwd()` and inlines it under `@layer theme`. `bin/init.mjs:227-229` already copies the package's `theme/theme.css` into the consumer's `theme/`. Fresh init = working, decently-styled shop because the consumer's `theme/theme.css` IS the starter. Devs branding the site edit or replace that file. **No new `package.json` exports entry. No new import line in `Base.astro`.**
4. **Bare `var(--cs-*)` references in package CSS** get **explicit fallbacks to structural neutrals at the rule site** (approach (a)). Examples: `var(--cs-transition-fast, 0s)`, `var(--cs-button-background, transparent)`, `var(--cs-listing-shadow-hover, none)`, `var(--cs-border-color, currentColor)`.
5. `theme/theme.css` serves three roles simultaneously: dogfood-site theme, init-scaffold source, and reference theme for documentation.

## Phase 2 plan (run in order)

1. **Write the contract tests first** (TDD per project CLAUDE.md). At minimum:
   - Assert every `var(--cs-*)` reference in `src/styles/` and `src/components/**/*.css` and `src/layouts/**/*.css` includes a fallback (regex: no bare `var(--cs-[a-z-]+)` without a comma).
   - Assert package CSS contains no hex/rgb/hsl color literals outside of `palette.css` (which is theme-adjacent and consumer-overridable).
   - Snapshot the inventory of bare-token references the patch pass must cover. Test fails on regression.
   - Existing `tests/unit/bin/init.test.ts` still passes (init still scaffolds `theme/theme.css` correctly).
2. Rewrite `theme/theme.css` to be the canonical starter theme: current `src/styles/defaults.css` opinionated content plus the doc comments already in `theme/theme.css`. This file is simultaneously the dogfood theme, the init-scaffold source, and the reference theme.
3. Strip `src/styles/defaults.css` down to structural neutrals only: `body { display: flex; flex-direction: column; min-height: 100vh }`, `header`/`main`/`footer` padding rules with token-fallback math, `.cs-skip-link` and `.cs-sr-only` a11y utilities, the `--cs-image-aspect-ratio` token if it stays auto-loaded.
4. Move all bare-element selectors (`main h1/h2/h3/p/ul/ol/hr` from `ContentPage.css`, any in `defaults.css`) into `theme/theme.css`. Package CSS = `.cs-*` classes only.
5. Add fallback values to every bare `var(--cs-*)` reference in package CSS per approach (a). Build the inventory by grep first (current count: ~234 references), then patch. Contract test from step 1 is the gate.
6. Fix duplicate selectors (`.cs-listings-empty`, `.cs-remove-btn`, `.cs-no-image` mismatches noted in findings).
7. Delete dead `:not(.cs-listing-buy)` selectors in `src/layouts/ContentPage.css`. The class doesn't exist anywhere in the package.
8. Tokenize / extract per the per-file findings (re-derive from source).
9. Replace opacity-dodge muted-text with explicit `--cs-muted-text-color` references. Reserve `opacity` for disabled-state.
10. Re-run dogfood site build. Eyeball for visual regressions (the dogfood site now reads its theme from the new `theme/theme.css`, so it should look identical to before).
11. Run `cornerstore init` into a fresh empty directory. Install deps. Build. Verify the scaffolded shop renders correctly with the starter theme in place. Init parity definition-of-done test per project CLAUDE.md.

## Explicitly NOT doing

- No new file at `src/styles/starter.css`. The starter is `theme/theme.css`.
- No new entry in `package.json` `exports`. The existing scaffold-and-read mechanism already delivers it.
- No new import line in `src/layouts/Base.astro`. The existing `process.cwd()/theme/theme.css` read is the channel.
- No changes to `bin/init.mjs` logic (the line 227-229 copy already does the right thing once `theme/theme.css` is rewritten in step 2). Verify only.

## Recovered findings 13-21 (use as starting hints, not exhaustive)

13. **Dead tokens.** `--cs-listing-inner-gap` and `--cs-listing-padding` are declared in `defaults.css` AND `theme/theme.css` but referenced nowhere in package CSS. They appear in the documented theme as if they were public API but do nothing. Phase 2: either wire them up to listing card padding/gaps (replacing hardcoded `0.75rem` and `0.25rem` in `ListingCards.css:91-99`), or delete the tokens.

14. **Opacity-as-muted-text anti-pattern repeats 12+ times** across components. `opacity: 0.4`, `0.5`, `0.6`, `0.7`, `0.85` used variously. Some convey "disabled" (acceptable structural meaning). Most just dim text instead of using `--cs-muted-text-color`. Inconsistent levels for the same conceptual treatment. Policy: opacity reserved for disabled-state; muted text uses the muted color token.

15. **`Listings.css:42` view-toggle ordering fragility.** `.cs-view-toggle-btn:hover { opacity: 0.8 }` and `[aria-pressed="true"] { opacity: 1 }` chain. When opacity is 0.5 by default, hover-over-active inherits from `[aria-pressed="true"]` rule. Ordering-dependent. Bug-adjacent.

16. **`Cart.css:233-253` mobile media query confusion.** Uses `flex-direction: row` but commentary at line 232 describes "stack" behavior. Actual mechanism: parent `.cs-order-actions` has `flex-wrap: wrap-reverse` (line 197), child rules force `flex: 1 1 100%` to wrap each child. The `flex-direction: row` on line 234 is a no-op. Clean up.

17. **`ContentPage.css:14-20`** — `main > article > h1/h2/h3/p/ul/ol/hr` selectors imply MDX/Astro pages wrap in `<article>`. Verify still true; if not, dead selectors.

18. **No CSS scoping prefix consistency.** Some classes are `.cs-listing-*`, some `.cs-cart-*`, some `.cs-status-*`. Some pseudo-utilities (`.cs-skip-link`, `.cs-sr-only`) sit at the root. No `.cs-` namespace boundary check exists. Out of scope for this strip pass — flag for a future contract test todo.

19. **`@layer package, theme` declared in two places**: `src/styles/reset.css:9` and inlined in `Base.astro:30` (`<style is:inline>@layer package, theme;</style>`). Redundant but harmless. The inline version exists because Astro's CSS bundling order isn't deterministic enough. Leave as-is.

20. **Starter theme MUST go in `@layer theme`** to win against the package layer. `Base.astro:42` already wraps consumer `theme.css` in `@layer theme`. Phase 2 must ensure the scaffolded starter import goes through the same layer wrapping mechanism.

21. **CSS leakage outside `.cs-*` classes**: `ContentPage.css` styles `main h1/h2/h3/p/ul/ol/hr` directly. `defaults.css:71-90` styles `body/header/main/footer`. Bare-element selectors collide with anything the consumer renders inside `<main>`. Cleaner line: all bare-element selectors live in starter, not package.

## Files to touch in Phase 2

- `theme/theme.css` (rewrite — becomes the canonical starter)
- `src/styles/defaults.css` (strip to structural neutrals)
- `src/styles/palette.css`
- `src/styles/reset.css`
- `src/components/Cart/Cart.css`
- `src/components/CartControl/CartControl.css`
- `src/components/CartWidget/CartWidget.css`
- `src/components/Listings/Listings.css`
- `src/components/Listings/ListingCards.css`
- `src/components/Listings/ListingTable.css`
- `src/components/Nav/Nav.css`
- `src/components/StatusPage/StatusPage.css`
- `src/layouts/ContentPage.css`
- `tests/unit/styles/css-contract.test.ts` (new — fallbacks + no-color-literals + no bare-element-selectors-in-package)
- `tests/unit/bin/init.test.ts` (verify still passes)

**Not touched:** `src/layouts/Base.astro`, `bin/init.mjs`, `package.json`. Existing wiring already delivers the starter via `theme/theme.css`.

## What's missing from this todo

The original audit produced findings 1-12 (per-file violation breakdowns with line ranges and `delete`/`tokenize`/`extract-to-starter` verdicts), a bare-`var(--cs-*)` inventory grouped by token, an explicit init-parity change list, and a test-impact list. All lost to truncation. Phase 2's first action is to reconstruct these by reading the listed files. Don't start editing until the inventory is rebuilt — approach (a) requires every bare reference patched in the same pass.

## Pre-flight before Phase 2

- Confirm `bin/init.mjs:227-229` still copies `theme/theme.css` from package root to consumer's `theme/`.
- Confirm `Base.astro:19-23` still reads `theme/theme.css` from `process.cwd()` and inlines it under `@layer theme`.
- Grep for tests touching CSS class names, snapshots, computed styles, or token names. Note which need updates.
- Grep current bare-token reference count. Snapshot the list before patching so the contract test can assert zero remain.
