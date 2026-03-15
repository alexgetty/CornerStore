# Google Font Automation

Automatic Google Font import and weight mapping from a single `--cs-font-family` declaration.

## The Problem

Non-technical makers shouldn't have to manually import Google Fonts, figure out available weights, or map weight values to usage tokens. Setting a font should be as simple as naming it.

## The Vision

Maker writes in their theme file:

```css
:root {
  --cs-font-family: "Inter";
}
```

The system:

1. Recognizes "Inter" as a Google Font
2. Imports it automatically (build-time, via Astro)
3. Queries available weights for that font
4. Assigns sensible defaults to `--cs-text-weight-body`, `--cs-text-weight-emphasis`, `--cs-text-weight-heading`, `--cs-text-weight-thin`

Advanced users can override any or all weight mappings explicitly:

```css
:root {
  --cs-font-family: "Inter";
  --cs-text-weight-body: 300;
  --cs-text-weight-emphasis: 500;
}
```

Only the overridden weights are used; the rest still auto-map.

## Stretch: Weight Requests

```css
:root {
  --cs-font-family: "Inter" 300 500 700 900;
}
```

Maker can optionally request specific weights to import if they know what they want. System imports only those weights and maps them.

## Technical Approach (TBD)

- Astro build step parses theme CSS, extracts `--cs-font-family` value
- Google Fonts API lookup for available weights (or static lookup table bundled with package)
- Generate `<link>` or `@font-face` import in Base.astro
- Default weight mapping heuristic: lightest available → thin, regular (400ish) → body, medium/semibold → emphasis, bold → heading
- Fallback: if font isn't found or offline, system font stack with default weights

## Open Questions

- How to handle fonts not in Google Fonts? (local fonts, Adobe Fonts, self-hosted)
- Should this be a CLI command (`cornerstore font "Inter"`) instead of / in addition to build-time magic?
- Performance: importing all 4 weights by default vs. only what's used
- Variable fonts: single file with weight range vs. discrete weight files

## Dependencies

- Theming system (tokens must exist first)
- CLI init (could generate the font import at scaffold time)
- Build pipeline (Astro integration to parse theme and inject font import)
