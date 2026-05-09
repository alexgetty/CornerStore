import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Cart mobile layout (<=560px).
 *
 * At mobile widths, Cart.css extends the catalog grid layout defined by
 * ListingTable.css with three overrides:
 *
 *   1. Cart rows: re-show .cs-col-total (at row-2 col-3) and .cs-remove-btn,
 *      shrink .cs-col-controls to span cols 1–2 so it sits beside the total.
 *   2. Totals row: convert .cs-totals-row from broken table-row to a flex
 *      row (label left, value right), reset cell padding/borders, and hide
 *      the empty controls spacer.
 *   3. Cart actions: stack buttons in column-reverse so Checkout lands on
 *      top; stretch each button to full-width tap targets.
 *
 * Cart mobile layout (rows):
 *
 *   ┌────────────────────────────────────────────┐
 *   │ [img] Name of product          $3.50 each  │  ← row 1 (same as catalog)
 *   │ [  qty stepper  ]              $1,050.00   │  ← row 2: controls + total
 *   └────────────────────────────────────────────┘
 *
 * Why source-string assertions: see listing-row-mobile-layout.test.ts.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const cartCssPath = join(REPO_ROOT, 'src', 'components', 'Cart', 'Cart.css');

const readCartCss = (): string => readFileSync(cartCssPath, 'utf8');

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

describe('Cart.css — @media (max-width: 560px) block exists inside @layer package', () => {
  it('declares an @media (max-width: 560px) rule', () => {
    expect(readCartCss()).toMatch(/@media\s*\(\s*max-width:\s*560px\s*\)/);
  });

  it('places the @media block inside the @layer package declaration', () => {
    const css = readCartCss();
    const layerOpenIdx = css.indexOf('@layer package');
    const mediaIdx = css.indexOf('@media (max-width: 560px)');
    expect(layerOpenIdx, 'expected @layer package in Cart.css').toBeGreaterThan(-1);
    expect(mediaIdx, 'expected @media (max-width: 560px) inside Cart.css').toBeGreaterThan(layerOpenIdx);
    const lastBraceIdx = css.lastIndexOf('}');
    expect(lastBraceIdx).toBeGreaterThan(mediaIdx);
  });
});

describe('Cart.css — cart listing rows re-show total and size controls at mobile', () => {
  it('re-shows .cs-col-total inside .cs-cart .cs-listing-row', () => {
    /*
     * ListingTable.css hides .cs-col-total in the catalog context. Cart.css
     * overrides this with a more specific selector (.cs-cart .cs-listing-row
     * .cs-col-total) so the line total is visible in the cart at mobile.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-cart\s+\.cs-listing-row\s+\.cs-col-total\s*\{[^}]*display:\s*block/,
    );
  });

  it('places .cs-col-total at grid-column 3 in cart rows', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-cart\s+\.cs-listing-row\s+\.cs-col-total\s*\{[^}]*grid-column:\s*3/,
    );
  });

  it('places .cs-col-total at grid-row 2 in cart rows', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-cart\s+\.cs-listing-row\s+\.cs-col-total\s*\{[^}]*grid-row:\s*2/,
    );
  });

  it('limits .cs-col-controls to grid-column 1 / 3 in cart rows', () => {
    /*
     * The catalog mobile rule places .cs-col-controls at grid-area: control
     * (all 3 columns). The cart override narrows it to cols 1–2 so col 3
     * is available for the re-shown line-total cell.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-cart\s+\.cs-listing-row\s+\.cs-col-controls\s*\{[^}]*grid-column:\s*1\s*\/\s*3/,
    );
  });

  it('does not re-show .cs-remove-btn inside .cs-cart .cs-listing-row at mobile', () => {
    /*
     * The remove button is never shown — users remove items by decrementing
     * to 0. Cart.css must not override the hidden attribute in mobile context.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).not.toMatch(/\.cs-remove-btn\s*\{[^}]*display:\s*inline-block/);
  });
});

describe('Cart.css — .cs-totals-row is a flex row at mobile', () => {
  it('sets .cs-totals-row to display: flex', () => {
    /*
     * The tfoot totals row uses table-row layout at desktop. On mobile,
     * with the table rows collapsing to grid, the subtotal row also needs
     * explicit layout. Flex gives label-left / value-right in one line.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-totals-row\s*\{[^}]*display:\s*flex/);
  });

  it('aligns .cs-totals-row items to center (vertical)', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-totals-row\s*\{[^}]*align-items:\s*center/);
  });

  it('distributes .cs-totals-row label and value with space-between', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-totals-row\s*\{[^}]*justify-content:\s*space-between/);
  });

  it('hides the empty .cs-col-controls spacer in the totals row', () => {
    /*
     * At desktop the totals row has a third cell (.cs-col-controls) that
     * aligns to the controls column. In the mobile flex row, that spacer
     * serves no purpose and would break the label–value pair.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-totals-row\s+\.cs-col-controls\s*\{[^}]*display:\s*none/,
    );
  });

  it('resets padding on .cs-totals-row th and td to 0', () => {
    /*
     * The global .cs-listing-table td rule adds padding. Inside the flex
     * totals row each cell is a flex item; cell padding would create
     * unwanted inset. Reset to 0 so only the row's own padding applies.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-totals-row\s+(?:th|td)[^}]*\{[^}]*padding:\s*0/);
  });

  it('removes borders from .cs-totals-row th and td', () => {
    /*
     * Each td in the global rule has border-bottom. The totals row flex
     * container draws its own bottom border; cell borders would double it.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-totals-row\s+(?:th|td)[^}]*\{[^}]*border:\s*none/);
  });

  it('gives .cs-totals-row a bottom border matching the body-row card pattern', () => {
    /*
     * Body rows have border-bottom-width via --cs-border-width. The totals
     * row should match so the flex subtotal line visually closes the card
     * list on the same rhythm.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-totals-row\s*\{[^}]*border-bottom-width:\s*var\(--cs-border-width/,
    );
  });
});

describe('Cart.css — cart actions stack vertically at mobile', () => {
  it('applies flex-direction: column-reverse to .cs-cart-actions', () => {
    /*
     * column-reverse stacks children bottom-to-top: since the submit
     * button is the last child in the DOM, it appears on top — the primary
     * action gets the top slot at mobile.
     */
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(
      /\.cs-cart-actions\s*\{[^}]*flex-direction:\s*column-reverse/,
    );
  });

  it('applies align-items: stretch to .cs-cart-actions so buttons fill the width', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-cart-actions\s*\{[^}]*align-items:\s*stretch/);
  });

  it('makes the submit button take full width via flex: 1 1 100%', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-cart-actions\s*>\s*\.cs-submit-btn\s*\{[^}]*flex:/);
  });

  it('makes .cs-cart-actions-secondary take full width via flex', () => {
    const block = extractMobileMediaBlock(readCartCss());
    expect(block).toMatch(/\.cs-cart-actions-secondary\s*\{[^}]*flex:/);
  });
});

describe('Cart.css — desktop layout is unchanged (>560px regression guard)', () => {
  it('Cart.css has no bare @media (max-width: 480px) block leftover', () => {
    expect(readCartCss()).not.toMatch(/@media\s*\(\s*max-width:\s*480px\s*\)/);
  });
});
