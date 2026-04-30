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

/**
 * Extract a balanced @media block keyed to a single feature/value pair.
 * Used to scope assertions to the mobile or desktop block in Nav.css.
 */
function extractMediaBlock(
  css: string,
  feature: 'max-width' | 'min-width',
  value: string,
): string {
  const escaped = value.replace(/\./g, '\\.');
  const re = new RegExp(
    `@media\\s*\\(\\s*${feature}:\\s*${escaped}\\s*\\)\\s*\\{`,
  );
  const match = css.match(re);
  if (!match || match.index === undefined) {
    throw new Error(
      `expected an @media (${feature}: ${value}) block in Nav.css`,
    );
  }
  let depth = 1;
  let i = match.index + match[0].length;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return css.slice(match.index, i);
}

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

describe('Nav.astro - aria-current contract through the drawer', () => {
  it('plain links keep aria-current="page" when active', () => {
    const out = readAstro();
    // Plain-link branch (no children). The aria-current attribute is
    // applied via a spread when normalizedCurrentPath matches. Pinning
    // the spread expression so the branch can't silently drop the
    // current-page contract during a refactor.
    expect(out).toMatch(
      /<li>\s*<a\s+href=\{item\.href\}[\s\S]*?normalizedCurrentPath === normalizePath\(item\.href \?\? ''\)[\s\S]*?"aria-current": "page"/,
    );
  });

  it('combo-item link keeps aria-current="page" when active inside the drawer', () => {
    const out = readAstro();
    // Combo branch's <a class="cs-nav-dropdown-link"> must carry the same
    // aria-current spread. Drawer wrapping must NOT swallow the contract.
    expect(out).toMatch(
      /<a\s+href=\{item\.href\}\s+class="cs-nav-dropdown-link"[\s\S]*?normalizedCurrentPath === normalizePath\(item\.href\)[\s\S]*?"aria-current": "page"/,
    );
  });

  it('child links inside any dropdown keep aria-current="page" when active', () => {
    const out = readAstro();
    // Inside the dropdown <ul class="cs-nav-dropdown-menu">, each child
    // <a> applies the same aria-current spread keyed off child.href.
    // Both branches (combo + dropdown-only) emit identical child markup,
    // so we expect at least two occurrences.
    const childMatches = out.match(
      /normalizedCurrentPath === normalizePath\(child\.href \?\? ''\)/g,
    ) ?? [];
    expect(childMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Nav.astro - inline script for drawer behavior', () => {
  it('binds a keydown Escape handler that closes .cs-nav-drawer', () => {
    const out = readAstro();
    // Escape closes the open drawer. The handler is scoped to drawers
    // querySelected at script-load time, and only acts when the drawer
    // is open. Match the structural shape: addEventListener('keydown',
    // ...) with an Escape check and drawer.open = false.
    expect(out).toMatch(
      /addEventListener\(\s*['"]keydown['"][\s\S]*?Escape[\s\S]*?drawer\.open\s*=\s*false/,
    );
  });

  it('binds a pointerdown click-outside handler that closes .cs-nav-drawer', () => {
    const out = readAstro();
    // Click-outside on touch + mouse: pointerdown is the unified primitive.
    // The handler must check that the drawer contains() the target before
    // closing - clicks INSIDE the drawer should NOT close it (otherwise
    // tapping a nav link to navigate would close the drawer mid-navigation
    // and feel broken).
    expect(out).toMatch(
      /addEventListener\(\s*['"]pointerdown['"][\s\S]*?drawer\.contains\([^)]+\)[\s\S]*?drawer\.open\s*=\s*false/,
    );
  });

  it('scrolls the drawer into view on open via the toggle event', () => {
    const out = readAstro();
    // When the user opens a long drawer mid-scroll, the open state is
    // visually below the fold. Native <details> does not auto-scroll;
    // we add scrollIntoView({ block: 'nearest' }) on the toggle event.
    // 'nearest' avoids unnecessary jumps when the drawer is already in
    // view.
    expect(out).toMatch(
      /addEventListener\(\s*['"]toggle['"][\s\S]*?drawer\.open[\s\S]*?scrollIntoView\(\s*\{\s*block:\s*['"]nearest['"]\s*\}\s*\)/,
    );
  });

  it('the script lives inline in Nav.astro (not a separate module)', () => {
    const out = readAstro();
    // Tightly coupled to the markup it operates on; keeping it inline
    // makes the contract obvious and avoids a separate file the build
    // would have to ship to the static output. Verify a <script> tag
    // is present and contains the drawer query selector.
    expect(out).toMatch(
      /<script>[\s\S]*?querySelectorAll(?:<[^>]+>)?\(\s*['"]details\.cs-nav-drawer['"]\s*\)[\s\S]*?<\/script>/,
    );
  });
});

describe('Nav.css - mobile breakpoint and desktop bypass', () => {
  it(`includes a (max-width: ${MOBILE_BREAKPOINT_LITERAL}) media query`, () => {
    const css = readCss();
    const escaped = MOBILE_BREAKPOINT_LITERAL.replace('.', '\\.');
    const re = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${escaped}\\s*\\)`);
    expect(css).toMatch(re);
  });

  it('hides the .cs-nav-toggle hamburger button above the breakpoint', () => {
    const css = readCss();
    // Above 40.001rem the drawer is bypassed; the hamburger button must
    // not render. Pin via min-width media query so the rule is unmistakably
    // desktop-scoped.
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-toggle\s*\{[^}]*display:\s*none/,
    );
  });

  it('forces .cs-nav-drawer > nav to display: contents above the breakpoint', () => {
    const css = readCss();
    // display: contents lets the inner <ul.cs-nav-links> participate as a
    // direct flex item of the header, so the desktop layout is structurally
    // identical to the pre-drawer markup.
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-drawer\s*>\s*nav\s*\{[^}]*display:\s*contents/,
    );
  });

  it('hides the .cs-nav-chevron above the breakpoint', () => {
    const css = readCss();
    // Combo items use the chevron only on mobile (Pattern A's separate
    // toggle). On desktop, hover drives the dropdown reveal so the chevron
    // is hidden.
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-chevron\s*\{[^}]*display:\s*none/,
    );
  });

  it('regression: hover/focus-within dropdown reveal is preserved on desktop', () => {
    const css = readCss();
    // The existing desktop dropdown behavior MUST survive the mobile-drawer
    // restructure. Hover and focus-within both reveal the menu via
    // display: flex. Pinned to catch a regression that would silently break
    // every desktop user.
    expect(css).toMatch(
      /\.cs-nav-dropdown:hover\s+\.cs-nav-dropdown-menu[\s\S]*?\.cs-nav-dropdown:focus-within\s+\.cs-nav-dropdown-menu\s*\{[^}]*display:\s*flex/,
    );
  });
});

describe('Nav.css - mobile drawer styling inside the breakpoint', () => {
  it('the mobile media query stacks .cs-nav-links vertically', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-links\s*\{[^}]*flex-direction:\s*column/,
    );
  });

  it('the mobile media query paints .cs-nav-drawer with --cs-nav-drawer-surface', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-drawer\b[^{]*\{[^}]*background-color:\s*var\(--cs-nav-drawer-surface/,
    );
  });

  it('the mobile media query draws the .cs-nav-chevron via mask-image', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    // Mask-image on a token-colored background lets the chevron recolor
    // with --cs-nav-chevron-color and ships zero asset bytes (the SVG is
    // an inline data URI).
    expect(block).toMatch(
      /\.cs-nav-chevron\s*\{[^}]*mask-image:\s*url\(/,
    );
    expect(block).toMatch(
      /\.cs-nav-chevron\s*\{[^}]*background-color:\s*var\(--cs-nav-chevron-color/,
    );
  });

  it('the mobile media query rotates the chevron when its <details> is open', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /details\[open\][^{]*\.cs-nav-chevron\s*\{[^}]*transform:\s*rotate\(180deg\)/,
    );
  });

  it('the mobile media query gives .cs-nav-toggle and .cs-nav-chevron a 44px floor (WCAG 2.5.5)', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    // Tap targets via the tokenized chevron size; the package fallback
    // pins the WCAG floor regardless of theme.
    expect(block).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?width:\s*var\(--cs-nav-chevron-size,\s*2\.75rem\)/,
    );
    expect(block).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?height:\s*var\(--cs-nav-chevron-size,\s*2\.75rem\)/,
    );
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

describe('Nav dropdown menu alignment token', () => {
  it('theme/theme.css declares --cs-nav-dropdown-menu-align with default center', () => {
    // The token controls horizontal placement of the desktop dropdown menu
    // relative to its trigger. Legal values: left | center | right. Default
    // center preserves the historical placement, so existing themes don't
    // shift visually when this token is introduced.
    expect(readTheme()).toMatch(/--cs-nav-dropdown-menu-align:\s*center/);
  });

  it('Nav.css overrides placement for the left keyword via @container style query', () => {
    // Style queries walk the inheritance chain checking the custom property
    // value, so no container-type ancestor is needed. The left override
    // anchors the menu's left edge to the trigger.
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*left\)/,
    );
  });

  it('Nav.css overrides placement for the right keyword via @container style query', () => {
    // Mirror of the left override. Anchors the menu's right edge to the
    // trigger so menus near the right edge of the nav don't clip the
    // viewport.
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*right\)/,
    );
  });
});
