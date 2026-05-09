import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingRow mobile layout (<=560px).
 *
 * The shared <ListingRow> partial renders horizontally as a table row at
 * desktop and as a 2-row CSS grid at mobile. The change is CSS-only, scoped
 * to body rows (`tbody tr.cs-listing-row`) so the cart's <tfoot> subtotal
 * row keeps default table-row layout at every breakpoint.
 *
 * Mobile layout:
 *
 *   ┌─────────────────────────────────────────┐
 *   │ [img] Name of product        $3.50 each │
 *   │ [     full-width control            ]   │
 *   └─────────────────────────────────────────┘
 *
 * Mobile-specific drops: line-total column, SKU, MOQ, description,
 * × remove button, and the table <thead>. The price column (unit price)
 * IS shown at row-1 col-3. The cart subtotal row stays untouched
 * (regression guard below).
 *
 * Why source-string assertions, not getBoundingClientRect snapshots:
 * jsdom and happy-dom do not implement CSS layout — every bounding rect
 * comes back zero, every resolved-style query for layout properties is
 * vacuous. The same rationale called out in listing-table-no-shift.test.ts
 * applies here. Pinning the CSS source contract is the cheap stopgap
 * until the project gains a Playwright harness (see
 * docs/todo/playwright-browser-test-harness.md). The shape pinned below
 * is mathematically sufficient for the spec's mobile invariants:
 * - body rows switch to display: grid with the spec's template areas,
 * - hidden selectors resolve to display: none inside body rows + thead,
 * - the controls cell spans the full mobile row in catalog context,
 * - the price cell is placed at row-1 col-3 (not the total cell),
 * - the tfoot rule never appears under the mobile body-row scope.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const listingCssPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingTable.css',
);
const themeCssPath = join(REPO_ROOT, 'theme', 'theme.css');

const readCss = (): string => readFileSync(listingCssPath, 'utf8');
const readTheme = (): string => readFileSync(themeCssPath, 'utf8');

/*
 * Pull the entire @media (max-width: 560px) { ... } block out of the file.
 * Brace-counting walk so nested rule blocks (each selector inside the media
 * query opens its own { ... }) don't terminate the match early.
 */
function extractMobileMediaBlock(css: string): string {
  const opener = '@media (max-width: 560px)';
  const start = css.indexOf(opener);
  if (start === -1) return '';
  const braceStart = css.indexOf('{', start);
  if (braceStart === -1) return '';
  let depth = 1;
  let i = braceStart + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return '';
  return css.slice(start, i);
}

describe('ListingTable.css — @media (max-width: 560px) block exists inside @layer package', () => {
  it('declares an @media (max-width: 560px) rule', () => {
    expect(readCss()).toMatch(/@media\s*\(\s*max-width:\s*560px\s*\)/);
  });

  it('places the @media block inside the existing @layer package declaration (single closing brace at file end)', () => {
    /*
     * The spec is explicit: the mobile block ships inside the same cascade
     * layer as the rest of the table chrome so specificity stays consistent.
     * Pin that the file still ends with a single @layer-closing brace and
     * the @media keyword sits between the @layer opener and that closer.
     */
    const css = readCss();
    const layerOpenIdx = css.indexOf('@layer package');
    const mediaIdx = css.indexOf('@media (max-width: 560px)');
    expect(layerOpenIdx, 'expected @layer package declaration').toBeGreaterThan(-1);
    expect(mediaIdx, 'expected @media (max-width: 560px) inside ListingTable.css').toBeGreaterThan(layerOpenIdx);
    expect(css.trimEnd().endsWith('}')).toBe(true);
    const lastBraceIdx = css.lastIndexOf('}');
    expect(lastBraceIdx).toBeGreaterThan(mediaIdx);
  });
});

describe('ListingTable.css — body rows switch to a 2-row grid at mobile', () => {
  it('flips .cs-listing-row to display: grid', () => {
    /*
     * The spec's "tbody tr.cs-listing-row" scoping is structurally
     * satisfied by the class itself: .cs-listing-row only sits on body
     * rows in ListingRow.astro, while the cart's tfoot subtotal row uses
     * .cs-totals-row. The package CSS contract forbids bare-element
     * selectors outside the stable-zone allow-list, so the spec's literal
     * selector cannot ship; the class-only form is functionally equivalent
     * and contract-compliant.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block, 'expected @media (max-width: 560px) block').not.toBe('');
    expect(block).toMatch(/\.cs-listing-row\s*\{[^}]*display:\s*grid/);
  });

  it('declares the spec grid template (auto 1fr auto) with image/name/price + control areas', () => {
    /*
     * Row 1 of the catalog mobile layout is image | name | price. The price
     * column (unit price) is visible at mobile to give buyers immediate
     * per-unit context. The line-total column is hidden in the catalog
     * context and re-shown by Cart.css in the cart context.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/grid-template-columns:\s*auto\s+1fr\s+auto/);
    expect(block).toMatch(/grid-template-areas:[\s\S]*?["']\s*image\s+name\s+price\s*["']/);
    expect(block).toMatch(/grid-template-areas:[\s\S]*?["']\s*control\s+control\s+control\s*["']/);
  });

  it('uses the mobile gap tokens for row-gap and column-gap', () => {
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/row-gap:\s*var\(--cs-listing-row-mobile-row-gap/);
    expect(block).toMatch(/column-gap:\s*var\(--cs-listing-row-mobile-col-gap/);
  });

  it('adds row padding via the mobile padding token', () => {
    /*
     * The row card owns the vertical rhythm. Padding is on the row itself,
     * not on individual cells (which get a border/padding reset). The token
     * lets themes tune the card inset without touching the package CSS.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s*\{[^}]*padding:\s*var\(--cs-listing-row-mobile-padding/);
  });

  it('adds a bottom border to the row via border tokens', () => {
    /*
     * The row card has a bottom border to separate it from the next row.
     * Border width and color flow through the existing package tokens so
     * themes that already customise --cs-border-* get the right border
     * on mobile rows for free.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s*\{[^}]*border-bottom-width:\s*var\(--cs-border-width/);
    expect(block).toMatch(/\.cs-listing-row\s*\{[^}]*border-bottom-color:\s*var\(--cs-border-color/);
  });

  it('assigns each body-row cell to its grid area', () => {
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-image\s*\{[^}]*grid-area:\s*image/);
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-product\s*\{[^}]*grid-area:\s*name/);
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-price\s*\{[^}]*grid-area:\s*price/);
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-controls\s*\{[^}]*grid-area:\s*control/);
  });

  it('resets cell padding and borders so the row card owns the vertical rhythm', () => {
    /*
     * Each td inherits padding and border-bottom from the global
     * .cs-listing-table td rule. The mobile grid card moves those visual
     * responsibilities to the row itself; the cell reset prevents double
     * padding/borders inside the card.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+td\s*\{[^}]*padding:\s*0/);
    expect(block).toMatch(/\.cs-listing-row\s+td\s*\{[^}]*border:\s*none/);
  });

  it('shrinks the thumbnail at mobile via the --cs-listing-thumb-size-mobile token', () => {
    /*
     * The mobile rule redefines --cs-listing-thumb-size in terms of the
     * new sibling token so all thumb-sizing rules (.cs-thumb, .cs-no-image)
     * pick it up automatically. Hardcoding 40px here would prevent consumers
     * from tuning the mobile thumbnail without overriding the entire media
     * query block.
     *
     * CSS: --cs-listing-thumb-size: var(--cs-listing-thumb-size-mobile, 40px)
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(
      /\.cs-listing-row\s*\{[^}]*--cs-listing-thumb-size:\s*var\(--cs-listing-thumb-size-mobile/,
    );
  });
});

describe('ListingTable.css — selectors hidden at <=560px inside body rows + thead', () => {
  it('hides .cs-listing-row .cs-col-total (catalog context — no line total in row-1)', () => {
    /*
     * In the catalog mobile layout, the line total is not shown. Row 1
     * ends with the unit price (cs-col-price). The cart context re-shows
     * cs-col-total via Cart.css with higher specificity.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-total\s*\{[^}]*display:\s*none/);
  });

  it('does NOT hide .cs-listing-row .cs-col-price (price is visible at row-1 col-3)', () => {
    /*
     * The price column is the third column in the mobile grid row. It
     * shows the unit price so buyers can scan prices without a cart
     * interaction. The old 480px layout hid this column; the new layout
     * surfaces it.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).not.toMatch(/\.cs-listing-row\s+\.cs-col-price\s*\{[^}]*display:\s*none/);
  });

  it('hides .cs-listing-row .cs-listing-sku', () => {
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-listing-sku\s*\{[^}]*display:\s*none/);
  });

  it('hides .cs-listing-row .cs-listing-moq', () => {
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-listing-moq\s*\{[^}]*display:\s*none/);
  });

  it('hides .cs-listing-row .cs-listing-desc', () => {
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-listing-desc\s*\{[^}]*display:\s*none/);
  });

  it('hides .cs-listing-row .cs-remove-btn', () => {
    /*
     * The remove button is never shown at any viewport. Users remove items
     * by decrementing to 0. The mobile rule enforces this in case a theme
     * inadvertently un-hides the button via a broader selector.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-remove-btn\s*\{[^}]*display:\s*none/);
  });

  it('visually hides .cs-listing-table thead via sr-only clip pattern, not display: none', () => {
    /*
     * display: none removes the element from the accessibility tree entirely.
     * The sr-only clip pattern (position: absolute; width/height: 1px; clip)
     * keeps column headers reachable by screen readers while removing them
     * from the visual layout. The contract test's STRUCTURAL_ALLOWLIST
     * exempts 1px / -1px when used in this a11y context.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-table\s+thead\s*\{[^}]*position:\s*absolute/);
    expect(block).toMatch(/\.cs-listing-table\s+thead\s*\{[^}]*width:\s*1px/);
    expect(block).not.toMatch(/\.cs-listing-table\s+thead\s*\{[^}]*display:\s*none/);
  });
});

describe('ListingTable.css — full-width control in the bottom row (catalog context)', () => {
  it('stretches the controls cell content to fill the mobile row', () => {
    /*
     * The CartControl root (.cs-cart-control) and its qty stepper variant
     * (.cs-cart-control-qty) and the Add-to-Cart button already declare
     * width: 100% in CartControl.css. The mobile cell is a grid item
     * spanning all three columns; pin a width: 100% on the controls cell
     * so the child's 100% has a deterministic basis.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-col-controls\s*\{[^}]*width:\s*100%/);
  });
});

describe('ListingTable.css — controls-cell contents fill the mobile cell', () => {
  it('.cs-cart-control-qty takes full width of the controls cell at <=560px', () => {
    /*
     * .cs-cart-control-qty already declares width: 100% at desktop via
     * CartControl.css, but the table-cell context can constrain it.
     * Pinning it in the mobile block inside .cs-listing-row ensures the
     * stepper container grows to fill the full-width grid cell.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-cart-control-qty\s*\{[^}]*width:\s*100%/);
  });

  it('.cs-cart-control-input flexes to absorb space between the stepper buttons at <=560px', () => {
    /*
     * The desktop rule in ListingTable.css fixes the input at
     * --cs-cart-stepper-cell-input-width with flex: 0 0 auto. On mobile
     * the input must grow to fill whatever space the full-width cell minus
     * the two fixed-size buttons leaves. Set flex: 1 1 auto (grow and
     * shrink freely, take auto basis) and drop the fixed width override.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-cart-control-input\s*\{[^}]*flex:\s*1\s+1\s+auto/);
  });

  it('.cs-cart-control-add takes full width of the controls cell at <=560px', () => {
    /*
     * The Add-to-Cart button (.cs-cart-control-add) already has width: 100%
     * from CartControl.css. Pinning it here inside the mobile .cs-listing-row
     * context guards against a future desktop override in ListingTable.css
     * accidentally constraining the button width.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).toMatch(/\.cs-listing-row\s+\.cs-cart-control-add\s*\{[^}]*width:\s*100%/);
  });
});

describe('ListingTable.css — tfoot regression guard at mobile', () => {
  it('does not include any tfoot rule under the mobile body-row scope', () => {
    /*
     * The tfoot subtotal row is explicitly out of scope for this change.
     * Totals-row mobile styles live in Cart.css. Pin that the @media block
     * in ListingTable.css has no rule that could cascade onto
     * .cs-totals-row or tfoot itself.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).not.toMatch(/\btfoot\b/);
    expect(block).not.toMatch(/cs-totals-row\b/);
  });

  it('does not bare-target tbody/thead/tfoot inside the mobile block (CSS contract)', () => {
    /*
     * The package CSS contract forbids bare-element selectors outside the
     * stable-zone allow-list (body/header/main/footer/html). Pin that this
     * @media block does not regress by introducing a bare `tbody {` or
     * `tfoot {` top-level selector. Class-anchored descendants like
     * `.cs-listing-table thead` short-circuit through the contract's
     * leading-class allow-rule and are fine.
     */
    const block = extractMobileMediaBlock(readCss());
    expect(block).not.toMatch(/(^|[\s,{])tbody\s*[{>+~\s]/);
    expect(block).not.toMatch(/(^|[\s,{])tfoot\b/);
  });
});

describe('theme.css — mobile listing-row tokens are published in the listing-table block', () => {
  it('declares --cs-listing-row-mobile-row-gap with the spec default', () => {
    expect(readTheme()).toMatch(/--cs-listing-row-mobile-row-gap:\s*0\.5rem\s*;/);
  });

  it('declares --cs-listing-row-mobile-col-gap with the spec default', () => {
    expect(readTheme()).toMatch(/--cs-listing-row-mobile-col-gap:\s*0\.75rem\s*;/);
  });

  it('declares --cs-listing-row-mobile-padding in the listing-table block', () => {
    expect(readTheme()).toMatch(/--cs-listing-row-mobile-padding:/);
  });

  it('declares --cs-listing-thumb-size-mobile alongside --cs-listing-thumb-size', () => {
    /*
     * The mobile media query redefines --cs-listing-thumb-size in terms of
     * this sibling token. If the token is never published in the theme,
     * consumers see no knob to tune the mobile thumbnail without touching
     * the package media query. Pin the token exists and sits near its
     * desktop counterpart.
     */
    const theme = readTheme();
    const desktopIdx = theme.indexOf('--cs-listing-thumb-size:');
    const mobileIdx = theme.indexOf('--cs-listing-thumb-size-mobile:');
    expect(desktopIdx, 'expected --cs-listing-thumb-size in theme.css').toBeGreaterThan(-1);
    expect(mobileIdx, 'expected --cs-listing-thumb-size-mobile in theme.css').toBeGreaterThan(-1);
    // Mobile token must appear close to its desktop sibling (within 200 chars).
    expect(Math.abs(mobileIdx - desktopIdx)).toBeLessThan(200);
  });

  it('the mobile tokens sit next to the other --cs-listing-* tokens, not buried elsewhere', () => {
    /*
     * Cohesion guard: the existing column-width tokens cluster under the
     * "Listing Table" comment block. Mobile tokens belong in the same
     * cluster so future readers can audit listing-table tokens in one place.
     */
    const theme = readTheme();
    const clusterEnd = theme.indexOf('--cs-listing-col-controls-width');
    const rowGap = theme.indexOf('--cs-listing-row-mobile-row-gap');
    const colGap = theme.indexOf('--cs-listing-row-mobile-col-gap');
    const padding = theme.indexOf('--cs-listing-row-mobile-padding');
    expect(clusterEnd, 'expected --cs-listing-col-controls-width marker').toBeGreaterThan(-1);
    expect(rowGap).toBeGreaterThan(clusterEnd);
    expect(colGap).toBeGreaterThan(clusterEnd);
    expect(padding).toBeGreaterThan(clusterEnd);
    expect(rowGap - clusterEnd).toBeLessThan(500);
    expect(colGap - clusterEnd).toBeLessThan(500);
    expect(padding - clusterEnd).toBeLessThan(500);
  });
});
