import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Header-row-height contract.
 *
 * Bug: `.cs-header { align-items: center }` centers each flex child to the
 * row, but the row's height is dictated by the tallest child, and the
 * tallest child changes per breakpoint (logo on desktop, hamburger toggle
 * on mobile). When the row's center moves, smaller text re-anchors and
 * cross-breakpoint vertical alignment drifts.
 *
 * Fix: every visual sibling inside the header (logo link, nav drawer, cart
 * widget, hamburger toggle) is forced to the SAME height via a shared token
 * `--cs-header-row-height`. With identical heights, `align-items: center`
 * becomes deterministic and produces visually identical alignment regardless
 * of which siblings exist at any breakpoint.
 *
 * The hamburger toggle is decoupled from `--cs-nav-chevron-size`; that token
 * stays scoped to the mobile drawer chevrons (`.cs-nav-chevron` inside
 * `.cs-nav-row`). Regression guard below pins both behaviors.
 *
 * Tests are source-level (regex on Nav.css and CartWidget.css), matching the
 * style of the sibling test files in this directory.
 */

const navCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'Nav.css',
);

const cartCssPath = join(
  process.cwd(),
  'src',
  'components',
  'CartWidget',
  'CartWidget.css',
);

const themePath = join(process.cwd(), 'theme', 'theme.css');

const readNavCss = (): string => readFileSync(navCssPath, 'utf8');
const readCartCss = (): string => readFileSync(cartCssPath, 'utf8');
const readTheme = (): string => readFileSync(themePath, 'utf8');

/**
 * Find the first balanced rule body for a SOLO selector (i.e., a rule
 * where this selector is the entire selector, not part of a comma list).
 * Returns the contents between the matching braces. Throws if not found.
 *
 * Solo means: preceded by `{`, `}`, or whitespace, followed (after optional
 * whitespace) directly by `{`. A selector that appears in a comma list
 * (e.g., `.cs-header .cs-nav-toggle, .cs-header .cs-cart-widget { ... }`)
 * is intentionally NOT matched by this helper.
 */
function extractSoloRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Anchor: start-of-line OR `{`/`}` OR whitespace, then the selector,
  // then optional whitespace, then `{` directly (no comma).
  const re = new RegExp(`(^|[{}\\s])${escaped}\\s*\\{`, 'm');
  const match = css.match(re);
  if (!match || match.index === undefined) {
    throw new Error(`expected solo selector "${selector}" in CSS`);
  }
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return css.slice(start, i);
}

describe('Nav.css - header row height token', () => {
  it('declares a shared rule that forces every header sibling to height: var(--cs-header-row-height, 2.75rem)', () => {
    /*
     * The four visual siblings inside the header (logo, drawer, cart,
     * toggle) must all resolve to the same height. The cleanest expression
     * is a comma-grouped selector list with a single height declaration.
     * Test asserts the contract by selector + value, not by the exact
     * comma-list ordering.
     */
    const css = readNavCss();
    const selectors = [
      '.cs-header > .cs-store-name',
      '.cs-header .cs-nav-drawer',
      '.cs-header .cs-nav-toggle',
      '.cs-header .cs-cart-widget',
    ];
    for (const selector of selectors) {
      // Each selector must appear (anywhere, in any rule) paired with the
      // shared height declaration. Using a tolerant regex so the rule can
      // be expressed as a single comma-list or as separate rules.
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `${escaped}[^{}]*\\{[^}]*height:\\s*var\\(--cs-header-row-height,\\s*2\\.75rem\\)`,
        's',
      );
      const altRe = new RegExp(
        `${escaped}[^{]*,[^{]*\\{[^}]*height:\\s*var\\(--cs-header-row-height,\\s*2\\.75rem\\)`,
        's',
      );
      // Either the selector is on its own rule, or part of a comma-list.
      const matched = re.test(css) || altRe.test(css);
      expect(matched, `selector ${selector} must resolve to height: var(--cs-header-row-height, 2.75rem)`).toBe(true);
    }
  });

  it('the shared header-row-height rule sets display: flex and align-items: center so internal contents center within the fixed-height box', () => {
    const css = readNavCss();
    // Find any rule that contains "height: var(--cs-header-row-height" and
    // assert it also declares display: flex + align-items: center.
    const ruleMatch = css.match(
      /\{[^}]*height:\s*var\(--cs-header-row-height[^}]*\}/s,
    );
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch![0];
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/align-items:\s*center/);
  });

  it('.cs-nav-toggle uses var(--cs-header-row-height, 2.75rem) for width AND height (NOT --cs-nav-chevron-size)', () => {
    /*
     * The hamburger now scales with the header, not with the drawer-row
     * chevrons. Both width and height must point at --cs-header-row-height.
     * The legacy --cs-nav-chevron-size reference on the toggle must be gone.
     */
    const css = readNavCss();
    const body = extractSoloRuleBody(css, '.cs-nav-toggle');
    expect(body).toMatch(/width:\s*var\(--cs-header-row-height,\s*2\.75rem\)/);
    expect(body).toMatch(/height:\s*var\(--cs-header-row-height,\s*2\.75rem\)/);
    expect(body).not.toMatch(/--cs-nav-chevron-size/);
  });

  it('regression guard: .cs-nav-chevron inside the mobile drawer still uses var(--cs-nav-chevron-size, 2.75rem) for width AND height', () => {
    /*
     * The mobile drawer row chevrons (Nav.css:329-330 region, inside the
     * @media (max-width: 40rem) block) MUST keep using
     * --cs-nav-chevron-size. They have their own ergonomics independent of
     * the header chrome. This is the no-collateral-damage guard.
     */
    const css = readNavCss();
    // Locate the @media (max-width: 40rem) block and inspect the chevron rule.
    const mediaIdxMatch = css.match(/@media\s*\(\s*max-width:\s*40rem\s*\)\s*\{/);
    expect(mediaIdxMatch).not.toBeNull();
    let depth = 1;
    let i = mediaIdxMatch!.index! + mediaIdxMatch![0].length;
    const blockStart = i;
    while (i < css.length && depth > 0) {
      const c = css[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth === 0) break;
      i++;
    }
    const block = css.slice(blockStart, i);
    // Inside the mobile block, find the .cs-nav-chevron rule and confirm
    // both width and height point at --cs-nav-chevron-size.
    const chevronRe = /\.cs-nav-chevron\s*\{[^}]*\}/s;
    const chevronMatch = block.match(chevronRe);
    expect(chevronMatch, 'expected a .cs-nav-chevron rule inside the mobile @media block').not.toBeNull();
    const chevronBody = chevronMatch![0];
    expect(chevronBody).toMatch(/width:\s*var\(--cs-nav-chevron-size,\s*2\.75rem\)/);
    expect(chevronBody).toMatch(/height:\s*var\(--cs-nav-chevron-size,\s*2\.75rem\)/);
  });
});

describe('CartWidget.css - participates in header row-height contract', () => {
  it('the cart widget sets height via the .cs-header .cs-cart-widget scoped selector (not unscoped)', () => {
    /*
     * .cs-cart-widget may be reused outside the header (e.g., on a future
     * cart page). The height contract is header-scoped so a standalone
     * widget is unaffected. This guard rejects an unscoped
     * `.cs-cart-widget { height: ... }` declaration that would leak.
     */
    const css = readCartCss();
    // The unscoped .cs-cart-widget rule must NOT carry a height declaration.
    const navCss = readNavCss();
    // Unscoped rule body in CartWidget.css should not declare height.
    const bodyMatch = css.match(/\.cs-cart-widget\s*\{([^}]*)\}/s);
    expect(bodyMatch, 'expected an unscoped .cs-cart-widget rule in CartWidget.css').not.toBeNull();
    expect(bodyMatch![1]).not.toMatch(/(^|;|\{|\s)height\s*:/);
    // The header-scoped rule lives in Nav.css (alongside the other header
    // siblings) and must include the cart widget selector.
    expect(navCss).toMatch(/\.cs-header\s+\.cs-cart-widget/);
  });
});

describe('theme/theme.css - header row-height token registration', () => {
  it('declares --cs-header-row-height with a 2.75rem default', () => {
    /*
     * The package CSS provides the 2.75rem fallback inside `var(...)`, but
     * the theme is the user-facing tunable layer. Declaring the token in
     * theme.css means a theme author can override the row height in one
     * place to reflow every header sibling, which is the whole point of
     * the indirection.
     */
    const theme = readTheme();
    expect(theme).toMatch(/--cs-header-row-height:\s*2\.75rem/);
  });
});
