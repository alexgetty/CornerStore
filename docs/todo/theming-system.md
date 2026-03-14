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

Theme switching is a folder swap. Replace the contents of `theme/` and the storefront changes appearance. No JS, no build step. `theme/theme.css` is the single entry point — Base.astro always imports it.

Cross-browser consistency is handled by an aggressive reset in the package layer. The seller's problem space starts at theming, not normalizing. No dark mode — these are maker brand storefronts, not apps.

---

## Token Contract

`--cs-` prefixed semantic tokens are the contract between package and theme. Components read them. Themes write them. How a theme fills those values — hex literals, `var()` references to palette or custom variables, `calc()` — is entirely the theme author's choice.

`defaults.css` sets all tokens on `:root` in `@layer package` — the single source of truth for default values. Component CSS reads tokens via `var(--cs-token)` with no fallbacks. A theme overrides whichever tokens it wants; unset tokens keep the package-layer defaults. If no theme exists, the site renders with these defaults — functional, unstyled.

Token names are semver-bound public API once shipped. Breaking changes (renames, removals, semantic changes) require a major version bump. Additive changes (new tokens) are minor. The same stability guarantee applies to selectors and palette variables — all `--cs-` prefixed names and `cs-` prefixed classes are stable API.

**Pre-v1 caveat:** Stability guarantees take effect at `1.0.0`. Before that, names can change freely — no one is consuming the contract yet. Use pre-v1 to get naming right; lock it at launch.

Versioning policy details in `docs/todo/token-versioning.md`.

Grouped by usage:

### Surfaces

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-surface-page` | `#fafafa` | Page background |
| `--cs-surface-listing` | `#fff` | Listing background |
| `--cs-surface-header` | `#fff` | Header/nav background |
| `--cs-surface-placeholder` | `#e5e5e5` | Image placeholder, empty areas |

### Text

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-text-primary` | `#1a1a1a` | Body text, headings, price |
| `--cs-text-secondary` | `#555` | Descriptions, supporting text |
| `--cs-text-muted` | `#777` | Empty states, disabled text |

### Interactive

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-interactive-bg` | `#1a1a1a` | Button/CTA background |
| `--cs-interactive-bg-hover` | `#333` | Button hover state |
| `--cs-interactive-text` | `#fff` | Button/CTA text color |

### Focus

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-focus-color` | `#1a1a1a` | Focus ring color |
| `--cs-focus-width` | `2px` | Focus outline width |
| `--cs-focus-offset` | `2px` | Focus outline offset |

### Borders

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-border-color` | `#e5e5e5` | Listing borders, dividers |
| `--cs-radius-listing` | `8px` | Listing border-radius |
| `--cs-radius-button` | `6px` | Button border-radius |

### Shadows

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-shadow-listing-hover` | `0 2px 12px rgba(0,0,0,0.08)` | Listing hover elevation |

### Typography

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-font-family` | System stack | Base font |
| `--cs-font-size-smallest` | TBD | Fine print, captions |
| `--cs-font-size-smaller` | TBD | Labels, metadata |
| `--cs-font-size-small` | TBD | Supporting text |
| `--cs-font-size-base` | TBD | Body text |
| `--cs-font-size-large` | TBD | Subheadings |
| `--cs-font-size-larger` | TBD | Section headings |
| `--cs-font-size-largest` | TBD | Page titles |
| `--cs-font-weight-medium` | `500` | Buttons |
| `--cs-font-weight-semibold` | `600` | Product names, prices |
| `--cs-font-weight-bold` | `700` | Headings |
| `--cs-line-height` | `1.6` | Body text |
| `--cs-line-height-tight` | `1.3` | Headings, names |
| `--cs-letter-spacing-tight` | `-0.02em` | Headings |

### Transitions

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-transition-fast` | `0.15s ease` | Button states |
| `--cs-transition-normal` | `0.2s ease` | Listing hover |

### Layout

| Token | Default | Purpose |
|-------|---------|---------|
| `--cs-max-width` | `1080px` | Container max-width |
| `--cs-max-width-narrow` | `480px` | Status page content width |
| `--cs-spacing-container` | `1.5rem` | Container horizontal padding |
| `--cs-spacing-section` | `2rem` | Section vertical padding |
| `--cs-spacing-listing` | `1.25rem` | Listing content padding |
| `--cs-spacing-listing-gap` | `0.5rem` | Listing content gap |
| `--cs-spacing-listings-gap` | `1.5rem` | Listing collection gap |
| `--cs-listings-min-column` | `280px` | Listings auto-fill min column |
| `--cs-spacing-button-y` | `0.625rem` | Button vertical padding |
| `--cs-spacing-button-x` | `1.25rem` | Button horizontal padding |
| `--cs-image-aspect-ratio` | `4 / 3` | Product image aspect ratio |

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
| `cs-container` | `div` | Max-width content wrapper |
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
| `cs-listing-placeholder` | `div` | Placeholder when no image |
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
  --cs-interactive-bg: var(--cs-ochre);
  --cs-surface-page: var(--cs-cream);
  --cs-text-primary: var(--cs-black);
}
```

A theme ignoring the palette entirely:

```css
:root {
  --cs-interactive-bg: #0000ff;
  --cs-surface-page: #fff;
  --cs-text-primary: #111;
}
```

A theme with its own color scheme:

```css
:root {
  --brand: #5c4a32;
  --brand-light: #d4a574;
  --bg: #fdf6e3;

  --cs-text-primary: var(--brand);
  --cs-interactive-bg: var(--brand-light);
  --cs-surface-page: var(--bg);
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
- Import the user's theme via `@import url('./theme/theme.css') layer(theme)` — this assigns the entire theme file (and any `@import`s within it) to the `theme` layer automatically. The user writes plain CSS; the layer wrapping is invisible to them.
- Add `<slot name="head" />` inside `<head>`
- Remove `<style is:global>` block (contents now in reset.css + defaults.css)

**If no theme exists:** All tokens resolve to `defaults.css` values. The site renders with the package defaults — functional, unstyled. This is the correct zero-config state.

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
  /* --cs-surface-page: var(--cs-cream); */
  /* --cs-surface-listing: var(--cs-white); */
  /* ... every token, grouped, with defaults shown */
}
```

**`example-basic`** — Direct values on semantic tokens. Flat list of overrides, no indirection. Teaches: "you can change these values."

```css
:root {
  --cs-surface-page: #f5f0eb;
  --cs-text-primary: #2b2b2b;
  --cs-interactive-bg: #c25e30;
  --cs-interactive-bg-hover: #a84f28;
  --cs-interactive-text: #fff;
  --cs-font-family: "Georgia", serif;
  /* ... */
}
```

**`example-palette`** — Same visual result, but values come from design system variables: color scheme, type scale, spacing ratios. Teaches: "values can have relationships." Demonstrates file splitting — tokens in a separate file imported by the entry point.

```css
@import url('./tokens.css');

:root {
  --cs-surface-page: var(--warm-bg);
  --cs-text-primary: var(--neutral);
  --cs-interactive-bg: var(--brand);
  --cs-interactive-bg-hover: var(--brand-dark);
  --cs-font-size-small: calc(var(--type-base) / var(--type-scale));
  --cs-font-size-base: var(--type-base);
  --cs-font-size-large: calc(var(--type-base) * var(--type-scale));
  --cs-spacing-listing: calc(var(--space-unit) * 2.5);
  --cs-spacing-listings-gap: calc(var(--space-unit) * 3);
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
- The generated file should lead with a "Your Brand" section highlighting the 5-6 highest-impact tokens (brand color, page background, text color, font) before listing the full set

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
| Missing `theme/theme.css` | If the file doesn't exist, the `@import` fails silently (per CSS spec). All tokens resolve to `defaults.css` values. The site renders with package defaults — functional, unstyled. This is the correct zero-config state |
