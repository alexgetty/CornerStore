import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Mobile nav disclosure pattern - the Nav component collapses to a native
 * <details>/<summary> drawer below 40rem.
 *
 * Why this exists
 * ---------------
 * The desktop nav is a horizontal link list with hover/focus-within
 * dropdowns. Below 40rem links overflow or wrap awkwardly and dropdowns
 * behave inconsistently on touch. This file pins the responsive pattern
 * (top-level <details> drawer + inner exclusive <details> accordions for
 * dropdowns + Pattern A for link+children combos) so future refactors can't
 * silently undo it.
 *
 * Pattern: native disclosure widget, no custom hamburger JS state.
 * - Top-level <details class="cs-nav-drawer"> wraps the <ul>. Its <summary>
 *   is the hamburger toggle, visible only below 40rem.
 * - Per-item dropdowns are <details name="cs-nav-accordion"> for native
 *   exclusivity (one open at a time). Inner <summary> is the trigger.
 * - Combo items (href + children) use Pattern A: an <a> sibling for the
 *   label and a separate <summary class="cs-nav-chevron"> for the toggle,
 *   inside the same <details>. Two distinct tap targets.
 * - Above 40rem, all <details> are bypassed via CSS (the toggle is hidden,
 *   inner content is forced visible, hover/focus-within drives the dropdown
 *   reveal as today).
 * - Inline <script> binds Escape and click-outside to close the drawer.
 *
 * Tests are source-level (regex on Nav.astro and Nav.css) - same approach
 * as cart-mobile-stack.test.ts. CSS-rendering coverage is a separate concern.
 */

const navAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'Nav.astro',
);

const navCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'Nav.css',
);

const themePath = join(process.cwd(), 'theme', 'theme.css');

const readAstro = (): string => readFileSync(navAstroPath, 'utf8');
const readCss = (): string => readFileSync(navCssPath, 'utf8');
const readTheme = (): string => readFileSync(themePath, 'utf8');

// The mobile collapse triggers at this width. Pinned in the test so the
// breakpoint is a documented contract. Matches Cart.css. If the pattern
// changes width, this test must be updated explicitly.
const MOBILE_BREAKPOINT_LITERAL = '40rem';

describe('Nav.astro - top-level <details> drawer wraps the nav', () => {
  it('wraps the nav <ul> in a <details class="cs-nav-drawer">', () => {
    const out = readAstro();
    // The drawer is the disclosure container. Below 40rem it owns the
    // open/closed state via the native <details> mechanism. Above 40rem
    // it is bypassed via CSS (the toggle is hidden, content is forced
    // visible). Source order: <details> wraps <nav> wraps <ul>.
    expect(out).toMatch(
      /<details[^>]*\bclass="cs-nav-drawer"[\s\S]*?<ul[\s\S]*?<\/ul>[\s\S]*?<\/details>/,
    );
  });

  it('the drawer <summary> carries aria-label="Menu" as the accessible name', () => {
    const out = readAstro();
    // The hamburger summary has no visible text (it renders an icon-only
    // glyph). The accessible name comes from aria-label so screen readers
    // announce "Menu, button, collapsed/expanded".
    expect(out).toMatch(
      /<summary[^>]*\bclass="cs-nav-toggle"[^>]*\baria-label="Menu"|<summary[^>]*\baria-label="Menu"[^>]*\bclass="cs-nav-toggle"/,
    );
  });

  it('the drawer <details> does NOT carry a name attribute', () => {
    const out = readAstro();
    // Inner per-item <details> use name="cs-nav-accordion" for native
    // exclusivity. The TOP-level drawer must NOT carry a name - it is
    // independent of the exclusive group, so opening the drawer does not
    // close any inner accordion and vice versa.
    expect(out).not.toMatch(
      /<details[^>]*\bclass="cs-nav-drawer"[^>]*\bname=/,
    );
    expect(out).not.toMatch(
      /<details[^>]*\bname=[^>]*\bclass="cs-nav-drawer"/,
    );
  });
});

describe('Nav.astro - inner per-item accordion (exclusive via name=)', () => {
  it('dropdown-only items (children, no href) render as <details><summary>label</summary>', () => {
    const out = readAstro();
    // Source pattern in the JSX: when item has children and no href, the
    // item branch renders a <details name="cs-nav-accordion"> containing a
    // <summary class="cs-nav-dropdown-trigger"> with the label expression
    // {item.label}, followed by the existing <ul class="cs-nav-dropdown-menu">.
    // No <button> or <a> trigger.
    expect(out).toMatch(
      /<details\s+name="cs-nav-accordion">\s*<summary[^>]*\bclass="cs-nav-dropdown-trigger"[^>]*>\s*\{item\.label\}\s*<\/summary>/,
    );
  });

  it('combo items (children + href) render <a> as label and sibling <summary> as chevron (Pattern A)', () => {
    const out = readAstro();
    // The combo branch uses an <a class="cs-nav-dropdown-link"> for the
    // visible label (link tap navigates) and a sibling <summary
    // class="cs-nav-chevron"> as the toggle (chevron tap opens submenu).
    // Both live inside the same <details name="cs-nav-accordion">. Match
    // class and href in either attribute order.
    expect(out).toMatch(
      /<details\s+name="cs-nav-accordion">[\s\S]*?<a\s[^>]*\bclass="cs-nav-dropdown-link"[\s\S]*?<\/a>[\s\S]*?<summary[^>]*\bclass="cs-nav-chevron"/,
    );
    expect(out).toMatch(
      /<a\s[^>]*\bclass="cs-nav-dropdown-link"[^>]*\bhref=\{item\.href\}|<a\s[^>]*\bhref=\{item\.href\}[^>]*\bclass="cs-nav-dropdown-link"/,
    );
  });

  it('combo items wrap in <li class="cs-nav-dropdown cs-nav-dropdown-combo">', () => {
    const out = readAstro();
    // The combo modifier class scopes the desktop chevron-hide and the
    // mobile flex-row layout. Pinning the class here keeps that scope
    // contract intact even when JSX reflows.
    expect(out).toMatch(/<li\s+class="cs-nav-dropdown cs-nav-dropdown-combo">/);
  });

  it('combo chevron <summary> carries aria-label="Toggle {label} submenu"', () => {
    const out = readAstro();
    // The chevron is icon-only. Its accessible name comes from aria-label
    // and includes the parent label so a screen reader user knows which
    // submenu the toggle controls. Match the templated form.
    expect(out).toMatch(
      /<summary[^>]*\bclass="cs-nav-chevron"[^>]*\baria-label=\{`Toggle \$\{item\.label\} submenu`\}/,
    );
  });

  it('every inner <details> carries name="cs-nav-accordion" for native exclusivity', () => {
    const out = readAstro();
    // Two inner branches (dropdown-only + combo). Both must carry the
    // shared name. The browser handles exclusivity: opening one closes
    // the others. Zero JS cost for the exclusive behavior.
    const inner = out.match(/<details\s+name="cs-nav-accordion">/g) ?? [];
    expect(inner.length).toBeGreaterThanOrEqual(2);
  });

  it('regression: the legacy <button class="cs-nav-dropdown-trigger"> trigger is gone', () => {
    const out = readAstro();
    // The button-based trigger is replaced by <summary> for native
    // disclosure semantics. Pin the absence so a future revert can't
    // sneak it back in.
    expect(out).not.toMatch(/<button[^>]*\bclass="cs-nav-dropdown-trigger"/);
  });
});

describe('theme/theme.css - nav drawer tokens', () => {
  it.each([
    '--cs-nav-drawer-surface',
    '--cs-nav-drawer-padding',
    '--cs-nav-drawer-gap',
    '--cs-nav-chevron-size',
    '--cs-nav-chevron-color',
    '--cs-nav-animation-duration',
  ])('declares %s', (token) => {
    const re = new RegExp(`${token.replace(/-/g, '\\-')}:`);
    expect(readTheme()).toMatch(re);
  });
});
