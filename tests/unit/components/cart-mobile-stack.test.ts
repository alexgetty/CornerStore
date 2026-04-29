import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Cart mobile-stack pattern - the cart table collapses to readable cards on
 * narrow viewports.
 *
 * Why this exists
 * ---------------
 * The cart table has 5 (or 6 for wholesale) columns. At phone widths
 * (320 / 375 / 414 px) the table either horizontal-scrolls or breaks layout.
 * Most buyers are on phones, so an unusable cart is a shipped bug. This file
 * pins the responsive pattern so future refactors can't accidentally undo it.
 *
 * Pattern: display-block stack with `data-label` attributes.
 * - Below a documented breakpoint, every row collapses to a card. Each <td>
 *   becomes a flex row with the column label rendered via `::before` from a
 *   `data-label` attribute.
 * - The <thead> is hidden in the mobile collapse - column headers are no
 *   longer relevant once each cell is labeled inline.
 * - Tap targets (stepper, remove, clear) hit WCAG 2.5.5 minimum (44px) at
 *   narrow widths. Desktop sizes remain unchanged.
 * - The <tfoot> subtotal row participates in the same stack: it becomes a
 *   labeled card-like row that reads as the summary of the stack above.
 *
 * Tests are source-level (regex on Cart.astro and Cart.css) because we don't
 * SSR Astro components in unit tests. That's the same approach the rest of
 * the cart component-markup tests use. CSS-rendering coverage is a separate
 * concern (see docs/todo/cart-listings-test-coverage.md).
 */

const cartAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Cart',
  'Cart.astro',
);

const cartCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Cart',
  'Cart.css',
);

const readAstro = (): string => readFileSync(cartAstroPath, 'utf8');
const readCss = (): string => readFileSync(cartCssPath, 'utf8');

// The mobile collapse triggers at this width. Pinned in the test so the
// breakpoint is a documented contract. If the pattern changes width, this
// test must be updated explicitly - it is not allowed to drift silently.
const MOBILE_BREAKPOINT_LITERAL = '40rem';

// WCAG 2.5.5 minimum touch target. The cart's mobile media query must use
// (or fall back to) at least this size for stepper buttons and the remove
// button. Theme can scale up via the token; the package fallback enforces
// the floor.
const TOUCH_TARGET_LITERAL = '44px';

describe('Cart.astro - data-label attributes feed the mobile collapse', () => {
  it('the Price td (default variant) carries data-label="Price"', () => {
    const out = readAstro();
    // The default-variant single price td. In source it currently looks
    // like `<td class="cs-col-price">{listing.price}</td>` - after this
    // change it must include data-label="Price" so ::before can render
    // "Price:" on the mobile stack.
    expect(out).toMatch(
      /<td[^>]*\bclass="cs-col-price"[^>]*\bdata-label="Price"[^>]*>\s*\{listing\.price\}/,
    );
  });

  it('the wholesale variant exposes data-label="MSRP" and data-label="Wholesale"', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<td[^>]*\bclass="cs-col-price cs-msrp"[^>]*\bdata-label="MSRP"|<td[^>]*\bdata-label="MSRP"[^>]*\bclass="cs-col-price cs-msrp"/,
    );
    expect(out).toMatch(
      /<td[^>]*\bclass="cs-col-price"[^>]*\bdata-label="Wholesale"|<td[^>]*\bdata-label="Wholesale"[^>]*\bclass="cs-col-price"/,
    );
  });

  it('the Qty td carries data-label="Qty"', () => {
    const out = readAstro();
    // Qty cell wraps the <CartControl /> - must carry the label attribute
    // on the cell itself (not on the control component).
    expect(out).toMatch(
      /<td[^>]*\bclass="cs-col-qty"[^>]*\bdata-label="Qty"|<td[^>]*\bdata-label="Qty"[^>]*\bclass="cs-col-qty"/,
    );
  });

  it('the Total td carries data-label="Total"', () => {
    const out = readAstro();
    // Per-row total cell. The tfoot subtotal cell does NOT need data-label
    // because the <th scope="row">Subtotal</th> already labels that row.
    expect(out).toMatch(
      /<td[^>]*\bclass="cs-col-total"[^>]*\bdata-label="Total"|<td[^>]*\bdata-label="Total"[^>]*\bclass="cs-col-total"/,
    );
  });

  it('the product cell does NOT carry a data-label (the product itself is the label)', () => {
    const out = readAstro();
    // Product name + thumbnail is self-describing; injecting "Product:"
    // before it would be redundant noise. Pin the absence so a future
    // copy-paste doesn't add it accidentally.
    expect(out).not.toMatch(
      /<td[^>]*\bclass="cs-col-product"[^>]*\bdata-label=/,
    );
  });

  it('the remove cell does NOT carry a data-label (the close button speaks for itself)', () => {
    const out = readAstro();
    expect(out).not.toMatch(
      /<td[^>]*\bclass="cs-col-remove"[^>]*\bdata-label=/,
    );
  });
});

describe('Cart.css - mobile-collapse media query exists at the documented breakpoint', () => {
  it(`includes a (max-width: ${MOBILE_BREAKPOINT_LITERAL}) media query for the cart table`, () => {
    const css = readCss();
    // Match the breakpoint exactly. If the pattern moves to a different
    // width, this test must be updated explicitly.
    const escaped = MOBILE_BREAKPOINT_LITERAL.replace('.', '\\.');
    const re = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${escaped}\\s*\\)`);
    expect(css).toMatch(re);
  });

  it('hides the cart table <thead> at the mobile breakpoint', () => {
    const css = readCss();
    // The thead is hidden because every cell will be labeled via data-label
    // ::before. With display: block on the row layout, the column-header
    // row no longer has a useful position anyway.
    const tableMediaBlock = extractCartTableMediaBlock(css);
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table\s+thead\s*\{[^}]*display:\s*none/,
    );
  });

  it('renders ::before pseudo-elements from data-label on .cs-cart-table cells', () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // The data-label pseudo-element is the visible mobile-only column label.
    // Pinned to the cart-table scope so it doesn't leak into other tables
    // (e.g. the order table in ListingTable).
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table[^{]*\[data-label\][^{]*::before\s*\{[^}]*content:\s*attr\(data-label\)/,
    );
  });

  it('forces .cs-cart-table tr / td onto the block layout (table model collapse)', () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // Each row becomes a card; each cell becomes a labeled row inside it.
    // The display: block / flex transition is the structural heart of the
    // pattern.
    expect(tableMediaBlock).toMatch(/\.cs-cart-table\s+tr\s*\{[^}]*display:\s*block/);
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table\s+t(?:body|foot)\s+td\s*\{[^}]*display:\s*flex/,
    );
  });

  it('the <tfoot> subtotal row participates in the mobile collapse', () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // tfoot tr renders as a label + value pair on one line ("Subtotal
    // ...... $X.YY") - explicit flex layout so it does NOT inherit the
    // default tr -> display: block fallback used for tbody cards.
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table\s+tfoot\s+tr\.cs-totals-row\s*\{[^}]*display:\s*flex/,
    );
    // The trailing remove cell (an empty alignment td on desktop) must
    // be hidden in the stack since there's no column grid to align to.
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table\s+tfoot\s+\.cs-col-remove\s*\{[^}]*display:\s*none/,
    );
    // The subtotal value cell pushes its $-amount to the right edge so
    // it lines up with the value column visually even without a column grid.
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-table\s+tfoot\s+td\.cs-col-total\s*\{[^}]*justify-content:\s*flex-end/,
    );
  });

  it(`stepper buttons hit at least ${TOUCH_TARGET_LITERAL} (WCAG 2.5.5) at the mobile breakpoint`, () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // The stepper down/up buttons inside a cart row must size up to the
    // touch-target floor. The token pulls from theme; the var() fallback
    // guarantees the floor even when the consumer hasn't overridden.
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-row\s+\.cs-cart-control-down,\s*\.cs-cart-row\s+\.cs-cart-control-up\s*\{[^}]*var\(--cs-cart-touch-target,\s*44px\)/,
    );
  });

  it(`stepper input height matches the touch target at the mobile breakpoint`, () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // The number input between the two buttons must match the same height
    // so the stepper reads as a single tap-friendly control.
    expect(tableMediaBlock).toMatch(
      /\.cs-cart-row\s+\.cs-cart-control-input\s*\{[^}]*height:\s*var\(--cs-cart-touch-target,\s*44px\)/,
    );
  });

  it(`remove button hits at least ${TOUCH_TARGET_LITERAL} at the mobile breakpoint`, () => {
    const css = readCss();
    const tableMediaBlock = extractCartTableMediaBlock(css);
    // The close button is small text by default; on phones it needs a real
    // tap target. min-width AND min-height both reach for the token.
    expect(tableMediaBlock).toMatch(
      /\.cs-remove-btn\s*\{[^}]*min-width:\s*var\(--cs-cart-touch-target,\s*44px\)/,
    );
    expect(tableMediaBlock).toMatch(
      /\.cs-remove-btn\s*\{[^}]*min-height:\s*var\(--cs-cart-touch-target,\s*44px\)/,
    );
  });
});

describe('theme/theme.css - token defaults for the mobile cart pattern', () => {
  it('declares --cs-cart-touch-target with WCAG-compliant default', () => {
    const theme = readFileSync(
      join(process.cwd(), 'theme', 'theme.css'),
      'utf8',
    );
    // Default value is 44px (WCAG 2.5.5). Themes can scale up; the package
    // fallback enforces the floor regardless of theme.
    expect(theme).toMatch(/--cs-cart-touch-target:\s*44px/);
  });

  it('declares --cs-cart-mobile-row-padding for the stacked card padding', () => {
    const theme = readFileSync(
      join(process.cwd(), 'theme', 'theme.css'),
      'utf8',
    );
    expect(theme).toMatch(/--cs-cart-mobile-row-padding:/);
  });

  it('declares --cs-cart-mobile-row-gap for the stacked card row gap', () => {
    const theme = readFileSync(
      join(process.cwd(), 'theme', 'theme.css'),
      'utf8',
    );
    expect(theme).toMatch(/--cs-cart-mobile-row-gap:/);
  });

  it('declares --cs-cart-mobile-card-margin for spacing between stacked rows', () => {
    const theme = readFileSync(
      join(process.cwd(), 'theme', 'theme.css'),
      'utf8',
    );
    expect(theme).toMatch(/--cs-cart-mobile-card-margin:/);
  });
});

describe('regression: legacy structures must not return', () => {
  it('the .cs-cart-totals wrapper class stays gone', () => {
    const out = readAstro();
    const css = readCss();
    expect(out).not.toMatch(/cs-cart-totals/);
    expect(css).not.toMatch(/\.cs-cart-totals\b/);
  });
});

/**
 * Extract the @media block scoped to the cart table mobile breakpoint.
 *
 * Why this helper exists: Cart.css already has a `(max-width: 480px)` media
 * query for the order-actions row. We need to scope our assertions to the
 * NEW cart-table mobile block so we don't false-positive against the
 * existing one. We pull out the matching block keyed to the documented
 * breakpoint literal.
 */
function extractCartTableMediaBlock(css: string): string {
  const escaped = MOBILE_BREAKPOINT_LITERAL.replace('.', '\\.');
  const re = new RegExp(
    `@media\\s*\\(\\s*max-width:\\s*${escaped}\\s*\\)\\s*\\{`,
  );
  const match = css.match(re);
  if (!match || match.index === undefined) {
    throw new Error(
      `expected an @media (max-width: ${MOBILE_BREAKPOINT_LITERAL}) block in Cart.css`,
    );
  }
  // Walk balanced braces from the opening { of the media block.
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
