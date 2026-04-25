# Vibe Layers — Progressive Theme Customization

## The Idea

A layered customization system in the scaffolded theme file. High-level "vibe" levers at the top produce massive variety from minimal input. Individual token overrides below for fine-tuning. Most makers never leave the top layer.

## Layers

**Layer 1: Vibes** — 3-5 high-level levers. Single integers that proportionally map to many tokens.

```css
:root {
  --cs-brand-color: #c25e30;
  --cs-font-family: "Georgia", serif;
  --cs-roundness: 2;    /* 0=hard 1=subtle 2=soft 3=round 4=bubble */
  --cs-spaciousness: 2; /* 0=compact 1=tight 2=comfortable 3=relaxed 4=airy */
}
```

**Layer 2: Core tokens** — Individual colors, weights, specific overrides.

**Layer 3: Full token set** — Everything else, for power users.

## Confirmed Vibes

- **Roundness** — designed and ready. Single integer (0-4), proportional mapping to all corner radii. Inner radii auto-derive: `max(0px, calc(var(--cs-roundness) * 4px - padding))`.
- **Spaciousness** — controls line-heights, padding, gaps, section spacing proportionally. Scale TBD.
- **Brand color** — single color that flows into button background, highlight text, and other accent usage.

## Technical Approach

Derivation lives in `defaults.css` (package layer). Individual tokens are calc() expressions referencing vibes. CSS custom property resolution is late-binding — package layer calcs see theme layer vibe values. Theme layer overrides of individual tokens bypass the calc entirely. The cascade handles precedence naturally.

## Unsolved Problem

How to present all three layers in one theme file without lower layers conflicting with upper layers when a maker changes vibes. If the scaffolded file shows all tokens with default values, changing a vibe at the top doesn't cascade because the explicit values below override it. Commenting everything out works technically but requires the maker to know token names.

Options to explore:
- Multiple files (vibes.css imports into theme.css, overrides in a separate file)
- A CLI tool that regenerates derived values when vibes change
- Only showing vibes + a curated "common overrides" section, not the full token set
- Interactive theme builder (web tool) that generates the theme file

This needs prototyping, not more planning. Ship basic theming first, learn from usage, then design the vibe layer.

## Dependencies

- Basic theming system (must ship first)
- Token contract (finalized)
- Google Font automation (separate todo — pairs well with font-family vibe)
