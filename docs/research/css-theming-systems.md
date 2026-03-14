# CSS Theming Systems Research

Research into how projects handle CSS-only theming where markup is system-controlled and users customize via CSS only.

---

## The Three Mechanisms

Every project studied uses one or more of three fundamental mechanisms for CSS theming. No project invented something novel -- they all compose these primitives differently.

### 1. CSS Custom Properties (Design Tokens)

The dominant pattern. Every modern theming system studied relies on CSS custom properties as the primary customization surface.

**How it works:** The system defines semantic variables on `:root` (or `:where(html)`) with sensible defaults. Users override those variables to change the theme. The markup never changes -- only the variable values do.

```css
/* System provides */
:root {
  --color-bg: #fafafa;
  --color-text: #1a1a1a;
  --color-accent: #0066cc;
}

/* User overrides */
:root {
  --color-accent: #e63946;
}
```

**Who does this:**
- **Pico CSS** -- 130+ variables prefixed `--pico-`, organized into style variables (fonts, spacing, borders) and color variables (scheme-dependent). [picocss.com/docs/css-variables]
- **Simple.css** -- 14 variables, no prefix. Semantic names: `--bg`, `--accent`, `--text`, `--text-light`, `--border`, `--code`, `--marked`, `--disabled`. [github.com/kevquirk/simple.css]
- **new.css** -- Variables prefixed `--nc-` with category abbreviations: `--nc-tx-1` (text), `--nc-bg-1` (background), `--nc-lk-1` (link), `--nc-ac-1` (accent). Numbers indicate hierarchy. [github.com/xz/new.css]
- **MVP.css** -- Descriptive names: `--color-bg`, `--color-link`, `--font-family`, `--border-radius`, `--hover-brightness`. [andybrewer.github.io/mvp]
- **Open Props** -- 500+ primitive tokens (e.g., `--gray-0` through `--gray-12`) plus semantic aliases (e.g., `--text-1-light`, `--surface-2-dark`). Uses `:where()` for zero specificity. [open-props.style]
- **Bootstrap 5.3** -- Variables prefixed `--bs-`, defined on `:root` via `_root.scss`. Component-level variables on base classes (e.g., `.navbar { --bs-navbar-color: ... }`). [getbootstrap.com/docs/5.3/customize/css-variables]
- **Shoelace** -- Design tokens prefixed `--sl-`. Users override in `:root`. Also exposes `::part()` selectors for shadow DOM internals. [shoelace.style/getting-started/customizing]
- **shadcn/ui** -- Semantic tokens: `--primary`, `--primary-foreground`, `--background`, `--border`, `--ring`, `--radius`. Convention: no suffix = background, `-foreground` = text color. [ui.shadcn.com/docs/theming]
- **Tailwind v4** -- `@theme` directive defines CSS custom properties that also generate utility classes. Namespaced: `--color-*`, `--font-*`, `--spacing-*`, `--radius-*`. [tailwindcss.com/docs/theme]

**Key observations:**
- Prefix convention is universal for frameworks (`--pico-`, `--bs-`, `--sl-`, `--nc-`). Prevents collisions when users combine libraries.
- Variable count varies wildly: Simple.css exposes 14, Pico exposes 130+, Open Props exposes 500+. More variables = more control but higher learning curve.
- Semantic naming (e.g., `--color-accent`) is more common than primitive naming (e.g., `--blue-500`) for theming APIs. Primitive tokens are internal implementation details that semantic tokens reference.

### 2. CSS Cascade Layers (@layer)

A newer mechanism (browser support since March 2022) that controls cascade priority independently of specificity. Only two of the studied projects use it in production.

**How it works:** Layers declared earlier have lower priority. Styles in later layers override earlier layers regardless of selector specificity. Styles *outside* any layer beat everything.

```css
@layer reset, base, theme, user;

@layer reset { /* lowest priority */ }
@layer base { /* default element styles */ }
@layer theme { /* pluggable theme */ }
@layer user { /* user customizations always win */ }
```

**Who does this:**
- **Tailwind v4** -- Four layers: `theme`, `base`, `components`, `utilities`. Preflight reset lives in `base`. Theme variables in `theme`. This is the most sophisticated production use of `@layer` in any project studied. [tailwindcss.com/docs/preflight]
- **CSS-Tricks recommended pattern** -- `reset -> defaults -> themes -> patterns -> components -> utilities`, mirroring ITCSS methodology. Nested theme layers suggested: `@layer theme.light, theme.dark`. [css-tricks.com/css-cascade-layers]
- **MDN documentation** -- Shows a three-layer pattern: `base`, `theme`, `user`. Notes that `!important` reverses layer priority (earlier layers win), which is a significant gotcha. [developer.mozilla.org/en-US/docs/Web/CSS/@layer]

**Who does NOT do this (and why it matters):**
- Pico CSS, Simple.css, new.css, MVP.css, Water.css, Bootstrap, Shoelace, Open Props, shadcn/ui, highlight.js, PrismJS -- none use `@layer`.
- Open Props uses `:where()` for specificity management instead of layers.
- Most classless frameworks rely on traditional cascade ordering.

**Key observations:**
- `@layer` is the "right" answer for a system that needs reset/base/theme/user override layers. The specification was literally designed for this use case.
- Adoption is slow. Framework authors are cautious because `@layer` changes how specificity works in ways that can surprise users (especially the `!important` reversal).
- The CSS-Tricks community discussion revealed skepticism: some practitioners view layers as most valuable for framework/library authors rather than end users. That is exactly what Corner Store is.
- Bramus (Chrome DevRel) recommends declaring all layers upfront in one line, then appending styles to them separately. This matches the pattern Corner Store would need.

### 3. File Swapping (Stylesheet Replacement)

The simplest mechanism. Different themes are different CSS files. Users pick one.

**Who does this:**
- **highlight.js** -- 512 themes as individual CSS files. Users include one `<link>` tag per theme. No custom properties, no layers. Each theme is entirely self-contained. [highlightjs.org, github.com/highlightjs/highlight.js/tree/main/src/styles]
- **PrismJS** -- Same pattern. Individual theme files with hardcoded values. No CSS custom properties. Flat structure targeting `.token.*` classes. [github.com/PrismJS/prism-themes]
- **Water.css** -- Three separate builds: automatic (follows OS preference), dark-only, light-only. User picks which file to include. [watercss.kognise.dev]

**Key observations:**
- This is the easiest model for users to understand: pick a file, include it.
- It's also the most rigid: customizing a theme means forking the entire file.
- highlight.js and PrismJS themes don't compose -- you can't mix and match pieces.
- This pattern works best when the customization surface is small (just colors for syntax highlighting) and the number of pre-built options matters more than per-theme customizability.

---

## Dark/Light Mode Patterns

Three distinct approaches emerged for handling color scheme switching.

### Pattern A: Media Query (OS Preference)

```css
:root { --bg: #fff; --text: #1a1a1a; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #121212; --text: #e0e0e0; }
}
```

**Used by:** Simple.css, new.css, Open Props (via normalize)

**Pros:** Zero JavaScript. Respects user's OS setting automatically.
**Cons:** No user toggle possible without JS or additional mechanism.

### Pattern B: Data Attribute Selector

```css
:root, [data-theme="light"] { --bg: #fff; }
[data-theme="dark"] { --bg: #121212; }
```

**Used by:** Pico CSS (`data-theme`), Bootstrap (`data-bs-theme`), Matcha CSS (`data-color-scheme`)

**Pros:** Supports both OS preference fallback and explicit user toggle. Can scope to individual elements.
**Cons:** Requires minimal JS to set the attribute (reading from localStorage or a toggle).

### Pattern C: CSS Class

```css
:root { --bg: #fff; }
.dark { --bg: #121212; }
```

**Used by:** shadcn/ui (`.dark` class on root)

**Pros:** Familiar pattern for Tailwind users.
**Cons:** Class-based, which can conflict with utility class conventions.

**Recommendation for Corner Store:** Pattern B. It allows OS-preference fallback with `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }` while also supporting explicit toggling. Pico CSS's three-tier approach is clean: light default, dark via media query when no attribute set, dark forced via `[data-theme="dark"]`.

---

## Classless CSS Frameworks: The Closest Analogy

Corner Store's constraint -- system-controlled markup, CSS-only customization -- maps directly to classless CSS frameworks. These projects style semantic HTML without requiring class names.

### What They Have in Common with Corner Store

| Framework | Size | Custom Props | Prefix | Dark Mode | Customization Surface |
|-----------|------|-------------|--------|-----------|----------------------|
| Pico CSS | ~10kb | 130+ vars | `--pico-` | data-attribute + media query | Comprehensive |
| Simple.css | ~4kb | 14 vars | none | media query only | Minimal |
| new.css | ~4.5kb | ~12 vars | `--nc-` | media query only | Minimal |
| MVP.css | ~10kb | ~15 vars | `--color-`, etc. | `color-mode` attribute | Moderate |
| Water.css | ~2kb | unknown | -- | separate file builds | None (file swap) |
| Matcha CSS | varies | semantic vars | none specified | data-attribute | Modular (a la carte imports) |

### The Spectrum of Customizability

There's a clear trade-off between simplicity and power:

- **Simple.css / new.css** (14 variables) -- Users can change colors and fonts. That's it. Simple to learn, limited control.
- **MVP.css** (15 variables) -- Adds layout variables (content width, card width) and interaction variables (hover brightness). Slightly more control.
- **Pico CSS** (130+ variables) -- Full control over every component's appearance. Steeper learning curve, but any look is achievable without touching markup.

**The question for Corner Store:** How many variables constitute the right API surface? Too few and themes all look the same. Too many and the learning curve kills adoption.

---

## E-Commerce Theming: Shopify as Reference

### Shopify Dawn Theme Architecture

Shopify's approach is instructive because it solves a similar problem: merchants customize appearance without changing markup.

**Mechanism:** JSON settings files define theme configuration. Liquid templates (server-side) read settings and generate inline CSS custom properties. Merchants customize via the theme editor UI, which writes to the JSON config.

**CSS files** live in `/assets/`. Templates can use `.css.liquid` extension to inject Liquid variables into stylesheets (e.g., `color: {{ settings.text_color }};`).

**What this means for Corner Store:** Shopify's approach is fundamentally server-rendered with a visual editor. Corner Store is static. The useful takeaway is the *separation of concerns*: settings (config) are distinct from the theme (CSS) are distinct from the markup (templates). Corner Store already has this with Stripe as the data source, Astro as the markup generator, and (future) CSS as the theme layer. [shopify.dev/docs/storefronts/themes/architecture]

---

## Static Site Generator Theming

### Jekyll Gem-Based Themes

**Distribution:** Ruby gems via RubyGems. `jekyll new` installs a default theme (Minima). Users update via `bundle update`.

**Override mechanism:** File-level overrides. Users create identically-named files in their project to replace theme files. For CSS specifically, users copy the main SASS file to their `_sass` directory, or write higher-specificity selectors in new CSS files.

**Lesson for Corner Store:** The file-override model is simple and well-understood, but it creates a fork: once you copy a theme file to customize it, you stop getting updates. This is the tension between customizability and maintainability. [jekyllrb.com/docs/themes]

### Hugo Theme Components

**Distribution:** File-system directories in `/themes/`. Multiple themes can compose via ordered configuration list.

**Override mechanism:** File-level merging with left-most-wins precedence. The user's files always override theme files.

**Lesson for Corner Store:** Hugo's composition model (layering multiple theme components) is powerful but complex. A simpler model -- one base, one theme, user overrides -- is probably right for Corner Store's audience. [gohugo.io/hugo-modules/theme-components]

### Eleventy

**No theming system.** CSS is managed by the developer. Eleventy provides no opinion on styling architecture. This is intentional -- maximum flexibility, zero guidance.

**Lesson for Corner Store:** Total flexibility is not a feature for indie makers. They need a default that works and a clear path to customize. [11ty.dev/docs/plugins]

---

## NPM-Distributed Theme Patterns

### Pattern A: Separate CSS Files (highlight.js model)

```
node_modules/highlight.js/styles/
  atom-one-dark.css
  github-dark.css
  monokai.css
  nord.css
```

Users import one file. Themes are self-contained. No composition, no customization within a theme.

### Pattern B: CSS Custom Properties + Import (Bootstrap model)

```css
@import "bootstrap/dist/css/bootstrap.css";

/* Override tokens */
:root {
  --bs-primary: #e63946;
}
```

Users import the framework, then override variables. Theme = set of variable overrides.

### Pattern C: Sass Configuration (Jekyll/Bootstrap Sass model)

```scss
@use "bootstrap" with (
  $primary: #e63946,
  $font-family-base: "Inter"
);
```

Users configure at build time via Sass `@use ... with`. Requires a build step.

### Pattern D: Theme Layer via @theme Directive (Tailwind v4 model)

```css
@import "tailwindcss";
@import "../brand/theme.css";

@theme {
  --color-*: initial; /* reset defaults */
  --color-brand: oklch(0.72 0.11 221.19);
}
```

Theme files are shareable CSS imports. The `@theme` directive is Tailwind-specific but the concept -- a CSS file that overrides the design token layer -- is universal.

**For Corner Store:** Pattern B is the right fit. No build step required (ruling out Pattern C). More customizable than Pattern A. Pattern D requires Tailwind's toolchain.

---

## Lea Verou's "Pseudo-Private Properties" Pattern

This is worth calling out specifically because it solves a problem Corner Store will face: how to expose a clean customization API while keeping internal implementation details private.

**The pattern:**
```css
/* Internal implementation uses underscore-prefixed properties */
.product-card {
  --_bg: var(--card-bg, white);
  --_border: var(--card-border, 1px solid #e5e5e5);
  background: var(--_bg);
  border: var(--_border);
}
```

The user sets `--card-bg`. The component consumes it via `--_bg` with a fallback. If the user doesn't set anything, the default applies. The underscore prefix signals "don't touch this directly."

**Source:** Lea Verou, "Custom Properties with Defaults" (2021). Shoelace uses this pattern for component-level customization. [lea.verou.me/blog/2021/10/custom-properties-with-defaults]

---

## Astro-Specific Constraints

Astro's styling architecture has implications for theming:

1. **Scoped styles by default.** `<style>` tags in Astro components are scoped via data attributes. This means theme CSS in components won't leak, but it also means external theme CSS can't easily reach scoped selectors without `is:global` or higher specificity.

2. **`is:global` opt-out.** The `<style is:global>` directive makes styles unscoped. Base.astro already uses this for the reset.

3. **CSS loading order.** Astro processes styles in this order: `<link>` tags (lowest), imported stylesheets, scoped `<style>` tags (highest). Theme CSS loaded via `<link>` or import would be overridden by component-scoped styles.

4. **`define:vars` directive.** Astro can pass component props into CSS as custom properties. This could bridge data (from Stripe) to styling.

**Critical implication:** If Corner Store's components use scoped `<style>` tags with hardcoded values (as they currently do -- `#fff`, `#e5e5e5`, `#1a1a1a`), no external theme CSS can override those values. The components *must* consume CSS custom properties for theming to work. This is a prerequisite architectural change, not a theme system choice. [docs.astro.build/en/guides/styling]

---

## Synthesis: Architecture Recommendation

Based on everything studied, a three-layer architecture using both `@layer` and CSS custom properties appears to be the strongest fit for Corner Store's constraints.

### The Layer Stack

```css
@layer cs-reset, cs-theme, cs-user;
```

1. **`cs-reset`** -- Box model, normalize, baseline. Ships with the package. Users never touch this. Equivalent to what `Base.astro` does today, but extracted to a standalone CSS file.

2. **`cs-theme`** -- The pluggable layer. Defines CSS custom properties and applies styles to semantic HTML elements and component selectors. Corner Store ships a default theme. Users can swap it for a different theme file, or use a community theme.

3. **`cs-user`** -- Empty by convention. Exists so user customizations always win over theme styles without needing higher specificity or `!important`.

Styles written *outside* any layer (e.g., inline styles, unscoped CSS) automatically win over all layers per the CSS cascade spec.

### The Token API

Themes would define a set of CSS custom properties. The set should be small enough to learn quickly but large enough to make distinct themes possible. Based on the classless framework analysis:

**Tier 1 -- Minimum viable theme (~15 tokens):**
Colors (background, text, accent, border, muted), typography (font family, heading weight), spacing (content max-width, gap), interaction (link color, button bg, hover state).

**Tier 2 -- Full theme (~40-50 tokens):**
Everything in Tier 1 plus: card surfaces, shadow values, border radius, secondary/tertiary colors, focus ring, transition durations, image aspect ratios.

The components would consume these tokens via Lea Verou's pseudo-private pattern, providing defaults so everything works without any theme loaded.

### The Distribution Model

```
cornerstore/
  css/
    reset.css          # @layer cs-reset { ... }
    themes/
      default.css      # @layer cs-theme { :root { --cs-*: ... } ... }
      minimal.css      # Alternative theme
    user.css           # @layer cs-user { /* your overrides */ }
```

Users loading via NPM:
```css
@import "cornerstore/css/reset.css";
@import "cornerstore/css/themes/default.css";
/* Optionally: @import "./my-overrides.css"; */
```

Users loading via CDN (self-hosted simple tier):
```html
<link rel="stylesheet" href="https://cdn.example.com/cornerstore/reset.css">
<link rel="stylesheet" href="https://cdn.example.com/cornerstore/themes/default.css">
```

### Open Questions

These emerged from the research and need decisions before implementation:

1. **Variable prefix.** `--cs-` is short and clear. But is it too close to `--bs-` (Bootstrap)? Alternatives: `--corner-`, `--store-`, `--crnr-`.

2. **Scoped styles problem.** Astro's scoped `<style>` tags currently have hardcoded values. These must be converted to consume CSS custom properties. Should components use `is:global` for theme-relevant styles, or should all themeable values be custom properties consumed within scoped styles? The latter is cleaner but requires the pseudo-private pattern in every component.

3. **Dark mode mechanism.** Data attribute (`data-theme`) or media query only? Data attribute is more flexible but requires JS for toggling. Media query is zero-JS but no user control. The research favors data attribute with media query fallback (Pico CSS pattern).

4. **Theme file granularity.** One monolithic theme file or modular imports (reset + colors + typography + components)? Matcha CSS and Tailwind favor modularity. Pico CSS and Simple.css ship as one file. For indie makers, one file is simpler. Modularity can come later.

5. **How much to reset.** Modern-normalize is gentle (fixes inconsistencies). Tailwind's Preflight is aggressive (strips all defaults). For a classless/semantic-HTML approach, gentle normalization preserves useful browser defaults. An aggressive reset requires rebuilding everything from scratch.

6. **Where does `@layer` declaration live?** If the layer order `@layer cs-reset, cs-theme, cs-user;` is declared in `reset.css`, it must be the first CSS loaded. If a user imports theme CSS without reset CSS, the layer order is undefined. This needs to be bulletproof.

---

## Sources

All sources accessed March 2026 unless otherwise noted.

- Pico CSS documentation: picocss.com/docs, picocss.com/docs/css-variables
- Simple.css source: github.com/kevquirk/simple.css (v2.3.7, May 2025)
- new.css source: github.com/xz/new.css
- MVP.css: andybrewer.github.io/mvp
- Water.css: watercss.kognise.dev
- Matcha CSS: matcha.mizu.sh
- Open Props: open-props.style
- Bootstrap 5.3 CSS variables: getbootstrap.com/docs/5.3/customize/css-variables
- Shoelace customizing: shoelace.style/getting-started/customizing
- Radix Themes: radix-ui.com/themes/docs/theme/overview
- shadcn/ui theming: ui.shadcn.com/docs/theming
- Tailwind v4 theme: tailwindcss.com/docs/theme
- Tailwind v4 preflight: tailwindcss.com/docs/preflight
- highlight.js themes: github.com/highlightjs/highlight.js/tree/main/src/styles
- PrismJS themes: github.com/PrismJS/prism-themes
- Shopify theme architecture: shopify.dev/docs/storefronts/themes/architecture
- Jekyll themes: jekyllrb.com/docs/themes
- Hugo theme components: gohugo.io/hugo-modules/theme-components
- Eleventy plugins: 11ty.dev/docs/plugins
- MDN @layer: developer.mozilla.org/en-US/docs/Web/CSS/@layer
- CSS-Tricks cascade layers: css-tricks.com/css-cascade-layers
- Bramus on @layer: bram.us/2021/09/15/the-future-of-css-cascade-layers-css-at-layer
- Lea Verou, custom properties with defaults: lea.verou.me/blog/2021/10/custom-properties-with-defaults
- Sass module system: sass-lang.com/blog/the-module-system-is-launched
- modern-normalize: github.com/sindresorhus/modern-normalize
- The New CSS Reset: github.com/elad2412/the-new-css-reset
- W3C Design Tokens Community Group: w3.org/community/design-tokens (spec v2025.10)
- CUBE CSS: cube.fyi, piccalil.li/blog/cube-css
- Astro styling: docs.astro.build/en/guides/styling
- Classless CSS list: github.com/dbohdan/classless-css
