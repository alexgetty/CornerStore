# Mobile Navigation

## Problem

The current nav is a horizontal link list with CSS-only dropdown menus. This works on desktop but has no responsive behavior. On small screens:

- Nav links overflow or wrap awkwardly
- Dropdown menus rely on `:hover` and `:focus-within`, which behave inconsistently on touch devices
- Link+dropdown items (e.g., "Shop" that links to home AND reveals category dropdown) create a tap ambiguity: first tap triggers hover state, second tap navigates
- There's no breakpoint where nav collapses into a mobile-friendly pattern

## Scope

This affects the entire `<Nav>` component, not just category dropdowns. The solution needs to handle:

- Standard nav links
- Dropdown triggers (button-only, no href)
- Link+dropdown combos (href + children)
- Cart widget positioning
- Footer nav (simpler, may not need the same treatment)

## Considerations

- The pattern should be CSS-first to match the existing architecture. JS only where CSS can't solve it (e.g., toggling a hamburger menu).
- Keyboard accessibility must be preserved. Mobile nav patterns often break tab order or trap focus.
- The mobile nav pattern needs to work with the `@layer package` / `@layer theme` system so makers can style it.
- Dropdown children in mobile nav probably become an accordion or nested list rather than a flyout.
- Breakpoint choice: where does the horizontal nav stop working? This depends on how many nav items the maker has configured, which varies per store.
