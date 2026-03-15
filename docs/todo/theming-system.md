# CSS Theming System

Migrate from hardcoded CSS in scoped Astro `<style>` blocks to a two-layer CSS architecture with a semantic token API. The storefront must look identical after migration — this is a structural refactor, not a redesign.

## Architecture

```css
@layer package, theme;
```

| Layer | Purpose | Location | Who touches it |
|-------|---------|----------|----------------|
| `package` | Everything we ship: reset, palette, default token values, structural CSS, visual declarations with `var()` | `src/styles/reset.css` + `palette.css` + `defaults.css` + colocated `Component.css` files | Package authors |
| `theme` | Token values on `:root` + optional creative overrides. One folder = one theme. Tokens are the easy path, direct CSS selectors are equally valid | `theme/theme.css` (user's project) | Theme authors, sellers |

The two layers exist solely to separate authorship boundaries. The layer mechanic is entirely package-internal — theme authors write plain CSS and never see `@layer`. Base.astro imports the user's theme via `@import url('./theme/theme.css') layer(theme)`, which assigns everything in the file (and anything it `@import`s) to the `theme` layer automatically.

Theme switching is a folder swap. Replace the contents of `theme/` and the storefront changes appearance. No JS, no build step. `theme/theme.css` is the single entry point — Base.astro conditionally imports it if present.

Cross-browser consistency is handled by an aggressive reset in the package layer. The seller's problem space starts at theming, not normalizing. No dark mode — these are maker brand storefronts, not apps.

---

## Token Contract

`--cs-` prefixed semantic tokens are the contract between package and theme. Components read them. Themes write them. How a theme fills those values — hex literals, `var()` references to palette or custom variables, `calc()` — is entirely the theme author's choice.

`defaults.css` sets all tokens on `:root` in `@layer package` — the single source of truth for default values. Component CSS reads tokens via `var(--cs-token)` with no fallbacks. A theme overrides whichever tokens it wants; unset tokens keep the package-layer defaults. If no theme exists, the site renders with these defaults — functional, unstyled.

Token names are semver-bound public API once shipped. Breaking changes (renames, removals, semantic changes) require a major version bump. Additive changes (new tokens) are minor. The same stability guarantee applies to selectors and palette variables — all `--cs-` prefixed names and `cs-` prefixed classes are stable API.

**Pre-v1 caveat:** Stability guarantees take effect at `1.0.0`. Before that, names can change freely — no one is consuming the contract yet. Use pre-v1 to get naming right; lock it at launch.

Versioning policy details in `docs/todo/token-versioning.md`.

### Naming Convention

Token names follow `--cs-{thing}-{property}-{modifier}`, ordered general to specific. The "thing" leads — all tokens for a given element sort together regardless of group. This aligns with the selector convention (`cs-listing-image`, `cs-listing-name`).

Naming rules:
- **No abbreviations** unless universally understood (`max` yes, `bg` no)
- **Names must stand alone** without a purpose/description column
- **Describe intent, not implementation** — token names describe what the maker sees, not what CSS property is used
- **"Surface"** = a layer that sits on the background (listing, header). "Background" = the base layer (page) or a container fill (image area)

Font-level properties (family, size, weight) describe individual characters. Composition-level properties (text color, line height, letter spacing) describe how text is arranged in context — these are prefixed by their context (`heading-`, `body-`, etc.).

### Deprecation Policy

Three-phase deprecation (Atlassian model): deprecated in a minor version (functional, warns), soft-deleted in the following minor (functional, loud warnings), removed in the next major. npm version-level download stats inform timing. `cornerstore doctor` CLI command scans theme files for deprecated tokens locally.

Grouped by usage:

### Surfaces

| Token | Default |
|-------|---------|
| `--cs-background` | `#fafafa` |
| `--cs-header-surface` | `#fff` |
| `--cs-image-background` | `#e5e5e5` |
| `--cs-listing-surface` | `#fff` |

### Text Styles

Composition-level properties grouped by context. Body/heading/etc. prefixes group related properties together when sorted alphabetically.

| Token | Default |
|-------|---------|
| `--cs-body-font-weight` | `400` |
| `--cs-body-line-height` | `1.6` |
| `--cs-body-text-color` | `#555` |
| `--cs-emphasis-font-weight` | `600` |
| `--cs-heading-font-weight` | `700` |
| `--cs-heading-letter-spacing` | `-0.02em` |
| `--cs-heading-line-height` | `1.3` |
| `--cs-heading-text-color` | `#1a1a1a` |
| `--cs-highlight-text-color` | `#c25e30` |
| `--cs-muted-text-color` | `#777` |
| `--cs-thin-font-weight` | `300` |

### Font

Universal character-level properties. These apply to all text uniformly.

| Token | Default |
|-------|---------|
| `--cs-font-family` | System stack |
| `--cs-font-size-smallest` | `0.75rem` |
| `--cs-font-size-smaller` | `0.8125rem` |
| `--cs-font-size-small` | `0.875rem` |
| `--cs-font-size-base` | `1rem` |
| `--cs-font-size-large` | `1.125rem` |
| `--cs-font-size-larger` | `1.5rem` |
| `--cs-font-size-largest` | `2rem` |

Font size scale is intentionally closed at 7 levels (3 below base, base, 3 above base). If a storefront needs more than 7 text sizes, the design is the problem.

### Buttons

| Token | Default |
|-------|---------|
| `--cs-button-background` | `#1a1a1a` |
| `--cs-button-background-hover` | `#333` |
| `--cs-button-padding-horizontal` | `1.25rem` |
| `--cs-button-padding-vertical` | `0.625rem` |
| `--cs-button-text-color` | `#fff` |

### Focus

| Token | Default |
|-------|---------|
| `--cs-focus-color` | `#1a1a1a` |
| `--cs-focus-offset` | `2px` |
| `--cs-focus-width` | `2px` |

### Borders

| Token | Default |
|-------|---------|
| `--cs-border-color` | `#e5e5e5` |

### Shadows

| Token | Default |
|-------|---------|
| `--cs-listing-shadow-hover` | `0 2px 12px rgba(0,0,0,0.08)` |

### Border Radius

| Token | Default |
|-------|---------|
| `--cs-listing-border-radius` | `8px` |
| `--cs-button-border-radius` | `6px` |

Future: a single `--cs-roundness` multiplier that proportionally derives all radii is planned as a vibe layer (see `docs/todo/vibe-layers.md`).

### Transitions

| Token | Default |
|-------|---------|
| `--cs-transition-fast` | `0.15s ease` |
| `--cs-transition-normal` | `0.2s ease` |

### Layout

| Token | Default |
|-------|---------|
| `--cs-image-aspect-ratio` | `4 / 3` |
| `--cs-listing-inner-gap` | `0.5rem` |
| `--cs-listing-minimum-width` | `280px` |
| `--cs-listing-padding` | `1.25rem` |
| `--cs-listings-gap` | `1.5rem` |
| `--cs-main-gap` | `2rem` |
| `--cs-main-padding` | `1.5rem` |
| `--cs-main-width` | `1080px` |

---

## Selector Contract

Astro components use no `<style>` blocks — components are pure markup that import colocated CSS files (`ComponentName/ComponentName.css`). This eliminates Astro data-attribute scoping noise. Component CSS contains both structural and visual property declarations — visual properties use `var(--cs-token)` with no fallbacks.

Component CSS is global. Every element gets a `cs-` prefixed class that describes its domain purpose — not its visual treatment or HTML element. Class names are the theming surface; the underlying HTML elements can change without breaking theme selectors.

Naming principles:
- **Name the thing, not how it looks.** `cs-listing` not `cs-listing-card`. The theme decides the visual treatment.
- **Name the purpose, not the element.** `cs-listing-image` not `cs-listing-figure`. Theme authors shouldn't need to know semantic HTML to understand what they're styling.
- **No positional selectors.** Every element that a theme might target gets its own class. No `:first-of-type`, no bare element descendants.

```css
@layer package {
  .cs-listing { /* the listing root */ }
  .cs-listing-image { /* image container */ }
  .cs-listing-name { /* product name */ }
  .cs-listing-description { /* description text */ }
  .cs-listing-price { /* price display */ }
  .cs-listing-buy { /* purchase CTA */ }
}
```

Selectors are semver-bound public API, same as tokens. Breaking changes (renames, removals) require a major version bump. Additive changes (new classes for new components) are minor. Every new component must go through naming review before its selectors ship — these names are permanent for the major version.

### Full Selector Inventory

#### Site Structure

| Class | Element | Purpose |
|---|---|---|
| `cs-main` | `div` | Max-width content wrapper |
| `cs-header` | `header` | Site header/nav area |
| `cs-storefront` | `main` | Primary content area |

#### Listings

| Class | Element | Purpose |
|---|---|---|
| `cs-listings` | `section` | Listing collection — always rendered, contains either listings or empty state |
| `cs-listings-empty` | `p` | Empty state message (inside `cs-listings`) |

#### Listing

| Class | Element | Purpose |
|---|---|---|
| `cs-listing` | `article` | Individual listing root |
| `cs-listing-image` | `figure` | Image container |
| `cs-listing-placeholder` | `div` | Fallback content when no image is set |
| `cs-listing-name` | `h2` | Product/bundle name |
| `cs-listing-description` | `p` | Product description |
| `cs-listing-price` | `p` | Price display |
| `cs-listing-buy` | `a` | Purchase/cart CTA |
| `cs-listing-details` | `div` | Content area wrapping name, description, price, buy |

#### Status Page

| Class | Element | Purpose |
|---|---|---|
| `cs-status-page` | `main` | Full-height centered layout |
| `cs-status-content` | `div` | Centered content block |
| `cs-status-heading` | `h1` | Page heading |
| `cs-status-message` | `p` | Body text |
| `cs-status-action` | `a` | Primary link/CTA |

### Authoring Surface for Themes

Tokens (`--cs-*`) are the primary theming surface — documented in the Token Contract above.

Selectors (`cs-*` classes) are the secondary surface — documented in the selector inventory above and by example in the starter themes. Theme authors write plain CSS in `theme/theme.css`. Base.astro assigns it to the `theme` layer on import, so any selector in the theme file overrides `package` layer styles regardless of specificity.

Both tokens and selectors are stable API. New components expand the contract — each new component adds to the selector inventory as part of its deliverables. The selector inventory in this document is the canonical reference; starter themes demonstrate usage by example.

---

## Palette

Corner Store ships a built-in color palette in `src/styles/palette.css`, defined in the `package` layer. The palette is optional — themes can reference these colors, define their own, or just use hex values directly. But palette variables that ship are stable API, same as tokens and selectors. If a theme references `--cs-ochre`, that name won't disappear in a minor bump.

The palette reflects Corner Store's vintage brutalist brand identity. Full palette TBD pending brand design. Shape:

```css
@layer package {
  :root {
    /* Neutrals */
    --cs-black: #1a1a1a;
    --cs-white: #fafafa;
    --cs-gray-...: ...;

    /* Brand */
    --cs-ochre: ...;
    --cs-rust: ...;
    --cs-cream: ...;

    /* Color wheel selections */
    ...
  }
}
```

A theme referencing the palette:

```css
:root {
  --cs-button-background: var(--cs-ochre);
  --cs-background: var(--cs-cream);
  --cs-heading-text-color: var(--cs-black);
}
```

A theme ignoring the palette entirely:

```css
:root {
  --cs-button-background: #0000ff;
  --cs-background: #fff;
  --cs-heading-text-color: #111;
}
```

A theme with its own color scheme:

```css
:root {
  --brand: #5c4a32;
  --brand-light: #d4a574;
  --bg: #fdf6e3;

  --cs-heading-text-color: var(--brand);
  --cs-button-background: var(--brand-light);
  --cs-background: var(--bg);
}
```

Note: Theme authors write plain CSS. The `@layer theme` assignment is handled automatically by Base.astro's import — theme authors never need to know about layers.

---

## Target File Structure

```
# User's project (scaffolded by cornerstore init)
theme/
  theme.css                     # Generated at init — all defaults using palette references.
                                # User's working copy. Identical to defaults.css values
                                # at init, diverges as user customizes.

# Package internals
src/
  components/
    Listing/
      Listing.astro             # Pure markup, imports Listing.css
      Listing.css               # @layer package { structural + visual via var() }
    Listings/
      Listings.astro
      Listings.css
    StatusPage/
      StatusPage.astro          # Shared layout for 404/success/cancel
      StatusPage.css
  layouts/
    Base.astro                  # Imports reset + defaults + theme. Has <slot name="head" />
  pages/
    index.astro                 # No <style> block
    404.astro                   # Uses StatusPage
    success.astro               # Uses StatusPage
    cancel.astro                # Uses StatusPage
  styles/
    reset.css                   # @layer package, theme; declaration + aggressive normalize
    palette.css                 # @layer package { built-in named colors }
    defaults.css                # @layer package { :root token defaults — safety net, never
                                # edited by user. If theme.css is deleted or corrupted,
                                # defaults.css catches everything. }
    pages/
      index.css                 # @layer package { page-level structural }
```

Starter themes (scaffold, basic, palette, full) are educational examples — they live in the theme repository and documentation, not in the package. They illustrate increasing levels of theme sophistication through diffing. See Phase 6.

---

## Phases

### Phase 0: Extract StatusPage component

`404.astro`, `success.astro`, and `cancel.astro` share identical structure and identical copy-pasted `.link`/`.page`/`.content` styles. Extract once, migrate once.

**Deliverables:**
- `src/components/StatusPage/StatusPage.astro` — accepts heading, body text, link text, link href
- Updated pages to use StatusPage
- All `<style>` blocks removed from these three pages

### Phase 1: Create reset.css and layer declaration

Extract the global reset from `Base.astro`'s `<style is:global>` into `src/styles/reset.css`. Expand into aggressive normalize.

**Deliverables:**
- `src/styles/reset.css` with `@layer package, theme;` declaration as first line
- All reset rules inside `@layer package { ... }`
- Comprehensive: box-sizing, margin/padding, font inherit, list-style removal, table border-collapse, button/input font inheritance, `[hidden]`, reduced-motion media query

**Where does the layer declaration live?** In `reset.css`, first line. This file MUST load first. Document this constraint.

### Phase 2: Create component and page CSS

Create colocated `.css` files for each component in `@layer package { ... }`. Move components into subdirectories. Create page-level CSS in `src/styles/pages/`. These files contain both structural and visual property declarations — visual properties reference tokens via `var(--cs-token)` with no inline fallbacks — `defaults.css` guarantees every token is defined.

**Structural properties:** `display`, `flex-direction`, `flex`, `grid-template-columns`, `overflow`, `object-fit`, `width: 100%`, `text-align`, `margin-top: auto`. Direct values — tokenizing these adds no value since no one sets `display: grid` via a custom property. Themes can still override them via selector overrides in the `theme` layer.

**Visual properties:** `background`, `color`, `border`, `border-radius`, `box-shadow`, `font-*`, `line-height`, `letter-spacing`, `padding`, `gap`, `transition`, `outline`, `text-decoration`, `max-width`. Referenced via `var(--cs-token)` with no fallbacks — default values come from `defaults.css`.

**Approach:** Create CSS files and import them, but do NOT remove `<style>` blocks yet. Scoped styles continue to provide visual appearance. Package layer sits underneath harmlessly.

### Phase 3: Create palette.css and defaults.css

Create `src/styles/palette.css` with Corner Store's built-in named colors. Create `src/styles/defaults.css` with all semantic token default values.

`palette.css` defines named color variables in the `package` layer — available to all themes but not referenced by any component CSS. The palette is a resource, not a dependency.

`defaults.css` sets all `--cs-*` semantic tokens on `:root` in `@layer package`. This is the single source of truth for default values. Component CSS references these tokens without fallbacks — `defaults.css` must always be loaded.

**Themes are not just token configs.** Theme authors can include `:root` token definitions AND direct CSS selectors targeting component classes, semantic elements, and pseudo-elements. Tokens are the easy path, direct selectors are equally valid. The `theme` layer wins over `package`, so theme-authored selectors override component defaults.

### Phase 4: Wire up Base.astro

Update `Base.astro` to import the layer stack, the user's theme, and add `<slot name="head" />` for font loading.

**Deliverables:**
- Import `reset.css`, `palette.css`, `defaults.css` (package layer)
- Conditionally import the user's theme: Base.astro frontmatter checks if `theme/theme.css` exists at build time. If present, import via `@import url('./theme/theme.css') layer(theme)` — this assigns everything in the file (and anything it `@import`s) to the `theme` layer automatically. The user writes plain CSS; the layer wrapping is invisible to them. If absent, skip the import entirely — Vite resolves CSS `@import`s as module imports and will fail the build on a missing file, so the conditional check is required.
- Add `<slot name="head" />` inside `<head>`
- Remove `<style is:global>` block (contents now in reset.css + defaults.css)
- Validate that Astro's conditional rendering of `<style>` blocks with `@import` works correctly in both present and absent cases

**If no theme exists:** The conditional import is skipped. All tokens resolve to `defaults.css` values. The site renders with the package defaults — functional, unstyled. This is the correct zero-config state. The build must not fail.

### Phase 5: Remove legacy styles

Remove all remaining `<style>` blocks from components and pages. The new CSS layer stack is now the sole source of styles.

**Verification:** `npm run build` succeeds, grep for `<style` in `src/` returns zero results (excluding non-component files). Visual parity with pre-migration appearance.

### Phase 6: Example themes (documentation only)

Example themes are educational content — they live in the theme repository and documentation site, not in the npm package. They illustrate increasing levels of theme sophistication. The diff between each example is the lesson.

All examples below are plain CSS — no `@layer` wrapping. Base.astro handles the layer assignment on import.

**`scaffold`** — Every token listed, commented out, with its default value. A blank-canvas reference for building a theme from scratch. Uncomment what you want to set.

```css
:root {
  /* Surfaces */
  /* --cs-background: var(--cs-cream); */
  /* --cs-listing-surface: var(--cs-white); */
  /* ... every token, grouped, with defaults shown */
}
```

**`example-basic`** — Direct values on semantic tokens. Flat list of overrides, no indirection. Teaches: "you can change these values."

```css
:root {
  --cs-background: #f5f0eb;
  --cs-heading-text-color: #2b2b2b;
  --cs-button-background: #c25e30;
  --cs-button-background-hover: #a84f28;
  --cs-button-text-color: #fff;
  --cs-font-family: "Georgia", serif;
  /* ... */
}
```

**`example-palette`** — Same visual result, but values come from design system variables: color scheme, type scale, spacing ratios. Teaches: "values can have relationships." Demonstrates file splitting — tokens in a separate file imported by the entry point.

```css
@import url('./tokens.css');

:root {
  --cs-background: var(--warm-bg);
  --cs-heading-text-color: var(--neutral);
  --cs-button-background: var(--brand);
  --cs-button-background-hover: var(--brand-dark);
  --cs-font-size-small: calc(var(--type-base) / var(--type-scale));
  --cs-font-size-base: var(--type-base);
  --cs-font-size-large: calc(var(--type-base) * var(--type-scale));
  --cs-listing-padding: calc(var(--space-unit) * 2.5);
  --cs-listings-gap: calc(var(--space-unit) * 3);
  /* ... */
}
```

**`example-full`** — Everything from `example-palette` plus component selector overrides for things tokens can't reach. Teaches: "you can go this deep."

```css
@import url('./tokens.css');

:root {
  /* Same semantic token mappings as example-palette */
  /* ... */
}

/* Creative overrides beyond tokens */
.cs-listing {
  border: 2px solid var(--neutral);
  box-shadow: none;
}
.cs-listing:hover {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--neutral);
}

/* ... additional structural/decorative overrides */
```

**File splitting is optional.** A theme can be a single `theme.css` that does everything — token overrides, custom variables, selector overrides, `@font-face` declarations. Or the theme author can split into multiple files using `@import` in `theme.css`. Everything imported lands in the `theme` layer because Base.astro assigns the entry point to that layer. CSS source order within the theme determines override priority: later declarations win.

### Phase 7: Update `cornerstore init` scaffolding

The CLI doesn't exist yet. Document requirements so it includes theming from day one:
- Init generates `theme/theme.css` with all token defaults using palette references, grouped with human-readable comments
- The generated theme file is identical to `defaults.css` values — the site looks the same with or without it
- No theme selection prompt. The maker gets a working starting point and can customize immediately, download a theme from the repository to replace it, or use the scaffold from the docs to start blank
- The generated file should lead with the highest-impact tokens (`--cs-background`, `--cs-heading-text-color`, `--cs-button-background`, `--cs-font-family`) before listing the full set
- Future: vibe layers (see `docs/todo/vibe-layers.md`) may restructure the generated file into progressive customization tiers

### Phase 8: Documentation

- Update SETUP.md with "Customizing Your Theme" section
- Create `docs/theming.md` — token reference, selector inventory, building custom themes, loading fonts, installing themes from the repository
- Inline documentation in the generated theme file and `reset.css`
- Theming guide walks through the example themes (scaffold → basic → palette → full), showing the same brand built with increasing sophistication — these examples live in docs and the theme repository, not in the package

**Ongoing:** Theming documentation grows with the component set. Every new component (product detail page, static content page, etc.) must include as deliverables: naming review for new selectors, addition to the selector inventory, and updated example themes if applicable.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Astro CSS import reordering breaks layer priority | Test with `npm run build` early. Verify layer order in browser DevTools on built output |
| Scoped `<style>` removal changes selector specificity | All selectors use `cs-` classes — no dependency on `[data-astro-*]` specificity boost. Test each component after migration |
| `defaults.css` not loaded | Component CSS uses `var()` without fallbacks — if `defaults.css` is missing, unstyled. This is a hard dependency, enforced by Base.astro importing it |
| Theme file grows unwieldy | Token-only themes are small. Themes with creative overrides grow proportionally to ambition — that's expected |
| `@import ... layer(theme)` browser support | Supported in all evergreen browsers since 2022. Verify Astro's CSS processing respects the `layer()` modifier on `@import`. Test early in Phase 4 |
| Missing `theme/theme.css` | Base.astro conditionally imports the theme — frontmatter checks file existence at build time, skips the import if absent. All tokens resolve to `defaults.css` values. The build succeeds and the site renders with package defaults |
