import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Mobile nav disclosure pattern.
 *
 * Above 40rem the nav renders as a horizontal link list with hover /
 * focus-within dropdowns. Below 40rem it collapses to a hamburger button
 * + sibling <nav> drawer, with each per-item dropdown its own
 * <button aria-expanded> + sibling <ul> menu. ESC, click-outside, and
 * one-open-at-a-time exclusivity are handled by an inline <script>.
 *
 * Combo items (children + href) follow Pattern A: the visible label is
 * an <a href> link; the toggle is a separate <button class=cs-nav-chevron>
 * sibling. Two distinct tap targets.
 *
 * Tests are source-level (regex on Nav.astro and Nav.css) - same approach
 * as cart-mobile-stack.test.ts.
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

const MOBILE_BREAKPOINT_LITERAL = '40rem';

function extractMediaBlock(
  css: string,
  feature: 'max-width' | 'min-width' | 'prefers-reduced-motion',
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

describe('Nav.astro - hamburger toggle controls drawer visibility', () => {
  it('renders a <button class="cs-nav-toggle"> with aria-expanded="false" by default', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-toggle"[\s\S]*?\baria-expanded="false"/,
    );
  });

  it('the toggle button carries aria-controls pointing to the nav id', () => {
    const out = readAstro();
    // aria-controls names the drawer the button toggles. Must match the
    // <nav> element's id so screen readers announce the relationship.
    expect(out).toMatch(/<button[\s\S]*?\baria-controls="cs-nav-main"/);
    expect(out).toMatch(/<nav[\s\S]*?\bid="cs-nav-main"/);
  });

  it('the toggle button carries aria-label="Menu" as the accessible name', () => {
    const out = readAstro();
    // The hamburger button has no visible text (it renders an icon-only
    // glyph), so aria-label supplies the accessible name.
    expect(out).toMatch(/<button[\s\S]*?\baria-label="Menu"/);
  });

  it('the drawer is a <nav class="cs-nav-drawer"> sibling of the toggle', () => {
    const out = readAstro();
    // <button class=cs-nav-toggle> immediately followed by <nav class=cs-nav-drawer>
    // - the adjacent-sibling CSS rule
    // .cs-nav-toggle[aria-expanded="true"] + .cs-nav-drawer drives mobile
    // visibility.
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-toggle"[\s\S]*?<\/button>\s*<nav[^>]*\bclass="cs-nav-drawer"/,
    );
  });
});

describe('Nav.astro - per-item dropdown buttons', () => {
  it('dropdown-only items render <button class="cs-nav-dropdown-trigger" aria-expanded="false">', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-dropdown-trigger"[\s\S]*?\baria-expanded="false"/,
    );
  });

  it('dropdown-only items: trigger label is {item.label}', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-dropdown-trigger"[\s\S]*?>\s*\{item\.label\}\s*<\/button>/,
    );
  });

  it('combo items render <a class="cs-nav-dropdown-link"> for the label', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<a\s[^>]*\bhref=\{item\.href\}[\s\S]*?\bclass="cs-nav-dropdown-link"|<a\s[^>]*\bclass="cs-nav-dropdown-link"[^>]*\bhref=\{item\.href\}/,
    );
  });

  it('combo items render a sibling <button class="cs-nav-chevron" aria-expanded="false">', () => {
    const out = readAstro();
    // Pattern A: the chevron is a separate button sibling of the link, so
    // the link tap navigates and the button tap toggles the submenu. Two
    // distinct tap targets.
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-chevron"[\s\S]*?\baria-expanded="false"/,
    );
  });

  it('combo chevron carries aria-label="Toggle {label} submenu"', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-chevron"[\s\S]*?\baria-label=\{`Toggle \$\{item\.label\} submenu`\}/,
    );
  });

  it('combo items wrap in <li class="cs-nav-dropdown cs-nav-dropdown-combo">', () => {
    const out = readAstro();
    expect(out).toMatch(/<li\s+class="cs-nav-dropdown cs-nav-dropdown-combo">/);
  });

  it('regression: legacy <details>/<summary> markup is gone', () => {
    const out = readAstro();
    expect(out).not.toMatch(/<details/);
    expect(out).not.toMatch(/<summary/);
  });
});

describe('Nav.astro - aria-current contract preserved', () => {
  it('plain links keep aria-current="page" when active', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<li>\s*<a\s+href=\{item\.href\}[\s\S]*?normalizedCurrentPath === normalizePath\(item\.href \?\? ''\)[\s\S]*?"aria-current": "page"/,
    );
  });

  it('combo-item link keeps aria-current="page" when active', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<a\s+href=\{item\.href\}\s+class="cs-nav-dropdown-link"[\s\S]*?normalizedCurrentPath === normalizePath\(item\.href\)[\s\S]*?"aria-current": "page"/,
    );
  });

  it('child links inside any dropdown keep aria-current="page" when active', () => {
    const out = readAstro();
    const childMatches = out.match(
      /normalizedCurrentPath === normalizePath\(child\.href \?\? ''\)/g,
    ) ?? [];
    expect(childMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Nav.astro - inline script for drawer + dropdown behavior', () => {
  it('the script lives inline in Nav.astro', () => {
    const out = readAstro();
    expect(out).toMatch(/<script>[\s\S]*?<\/script>/);
  });

  it('binds a click handler that toggles the drawer toggle aria-expanded', () => {
    const out = readAstro();
    // The toggle button click flips aria-expanded between true and false
    // via the setExpanded / isExpanded helpers.
    expect(out).toMatch(
      /toggle\.addEventListener\(\s*['"]click['"][\s\S]*?setExpanded\(toggle/,
    );
  });

  it('binds Escape to close the drawer (aria-expanded -> false)', () => {
    const out = readAstro();
    expect(out).toMatch(
      /addEventListener\(\s*['"]keydown['"][\s\S]*?Escape[\s\S]*?setExpanded\(toggle,\s*false\)/,
    );
  });

  it('binds pointerdown click-outside to close the drawer', () => {
    const out = readAstro();
    expect(out).toMatch(
      /addEventListener\(\s*['"]pointerdown['"][\s\S]*?contains\([^)]+\)[\s\S]*?setExpanded\(toggle,\s*false\)/,
    );
  });

  it('scrolls the drawer into view when the toggle expands', () => {
    const out = readAstro();
    expect(out).toMatch(
      /scrollIntoView\(\s*\{\s*block:\s*['"]nearest['"]\s*\}\s*\)/,
    );
  });

  it('per-item dropdown clicks close all other dropdowns (one-open-at-a-time)', () => {
    const out = readAstro();
    // Exclusivity: when one dropdown opens, all others get aria-expanded=false.
    // This replaces the native name= mechanism we used with <details>.
    expect(out).toMatch(
      /dropdowns\.forEach\([\s\S]*?other !== btn[\s\S]*?setExpanded\(other,\s*false\)/,
    );
  });
});

describe('Nav.css - mobile breakpoint and desktop behavior', () => {
  it(`includes a (max-width: ${MOBILE_BREAKPOINT_LITERAL}) media query`, () => {
    const css = readCss();
    const escaped = MOBILE_BREAKPOINT_LITERAL.replace('.', '\\.');
    const re = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${escaped}\\s*\\)`);
    expect(css).toMatch(re);
  });

  it('hides .cs-nav-toggle above the breakpoint', () => {
    const css = readCss();
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-toggle\s*\{[^}]*display:\s*none/,
    );
  });

  it('hides .cs-nav-chevron above the breakpoint', () => {
    const css = readCss();
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-chevron\s*\{[^}]*display:\s*none/,
    );
  });

  it('hides .cs-nav-drawer by default below the breakpoint', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-drawer\s*\{[^}]*display:\s*none/,
    );
  });

  it('reveals .cs-nav-drawer when the toggle is aria-expanded="true"', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-toggle\[aria-expanded="true"\]\s*\+\s*\.cs-nav-drawer\s*\{[^}]*display:\s*block/,
    );
  });

  it('reveals .cs-nav-dropdown-menu when its trigger or chevron is aria-expanded="true"', () => {
    const css = readCss();
    // This rule lives outside any media query so the same aria toggle
    // works at every viewport (sticks the menu open on click). Hover and
    // focus-within still also reveal on desktop.
    expect(css).toMatch(
      /\.cs-nav-dropdown-trigger\[aria-expanded="true"\]\s*\+\s*\.cs-nav-dropdown-menu/,
    );
    expect(css).toMatch(
      /\.cs-nav-chevron\[aria-expanded="true"\]\s*\+\s*\.cs-nav-dropdown-menu/,
    );
  });

  it('preserves desktop hover / focus-within reveal of the dropdown menu', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-dropdown:hover\s+\.cs-nav-dropdown-menu[\s\S]*?\.cs-nav-dropdown:focus-within\s+\.cs-nav-dropdown-menu/,
    );
  });

  it('rotates the chevron 180deg when its aria-expanded is true at mobile width', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-chevron\[aria-expanded="true"\]\s*\{[^}]*transform:\s*rotate\(180deg\)/,
    );
  });

  it('the chevron is drawn via mask-image so it recolors via --cs-nav-chevron-color', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?mask-image:\s*url\(/,
    );
    expect(css).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?background-color:\s*var\(--cs-nav-chevron-color/,
    );
  });

  it('prefers-reduced-motion zeroes the chevron transition duration', () => {
    const css = readCss();
    const reduce = extractMediaBlock(css, 'prefers-reduced-motion', 'reduce');
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms/);
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
    expect(readTheme()).toMatch(/--cs-nav-dropdown-menu-align:\s*center/);
  });

  it('Nav.css overrides placement for the left keyword via @container style query', () => {
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*left\)/,
    );
  });

  it('Nav.css overrides placement for the right keyword via @container style query', () => {
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*right\)/,
    );
  });
});
