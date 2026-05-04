import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Cart.astro markup contract — subtotal lives in <tfoot>.
 *
 * The cart subtotal used to render in a sibling `<div class="cs-cart-totals">`
 * directly under the table. That breaks two things:
 *
 *   1. Accessibility — the totals had no programmatic relationship to the
 *      table, so screen readers did not announce the subtotal as the table's
 *      summary.
 *   2. Layout — the value right-aligned to the table's outer edge (past the
 *      Remove column) instead of aligning with the Total column above it.
 *
 * Moving the row into <tfoot> with <th scope="row"> on the label gives us
 * proper summary-row semantics AND uses the actual table column for alignment.
 *
 * Tests assert on the source .astro file because we don't SSR Astro components
 * in unit tests (per docs/todo/cart-listings-test-coverage.md). Selector and
 * structural pins on the source are sufficient — if the markup diverges, the
 * client-side cart.ts selectors would stop finding elements anyway.
 */

const cartAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Cart',
  'Cart.astro',
);

const readCart = (): string => readFileSync(cartAstroPath, 'utf8');

describe('Cart.astro — subtotal renders in <tfoot> inside the cart table', () => {
  it('contains a <tfoot> block', () => {
    const out = readCart();
    expect(out).toMatch(/<tfoot>/);
    expect(out).toMatch(/<\/tfoot>/);
  });

  it('places the subtotal value (.cs-subtotal-value) inside the <tfoot>', () => {
    const out = readCart();
    const tfootMatch = out.match(/<tfoot>[\s\S]*?<\/tfoot>/);
    expect(tfootMatch, 'expected a <tfoot>...</tfoot> block').not.toBeNull();
    expect(tfootMatch![0]).toContain('cs-subtotal-value');
  });

  it('the <tfoot> sits inside the cart table (not a sibling element)', () => {
    const out = readCart();
    // The cart table now uses the same class as the catalog table
    // (.cs-listing-table) since the cart row IS the catalog row. The
    // <tfoot> must live inside that <table>.
    const tableMatch = out.match(
      /<table\s+class="cs-listing-table"[^>]*>[\s\S]*?<\/table>/,
    );
    expect(tableMatch, 'expected .cs-listing-table source block').not.toBeNull();
    expect(tableMatch![0]).toMatch(/<tfoot>[\s\S]*<\/tfoot>/);
  });

  it('subtotal label is a <th> with scope="row" (summary-row a11y)', () => {
    const out = readCart();
    const tfootMatch = out.match(/<tfoot>[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    // Allow attributes in any order; require scope="row" alongside the label.
    expect(tfootMatch![0]).toMatch(
      /<th[^>]*\bscope="row"[^>]*>\s*Subtotal\s*<\/th>|<th[^>]*>\s*Subtotal\s*<\/th>/,
    );
    // Strict: scope="row" present somewhere on the th element wrapping the
    // Subtotal label.
    expect(tfootMatch![0]).toMatch(/<th[^>]*\bscope="row"/);
  });

  it('subtotal label colspan is 4 (covers leading cols, leaves total + remove)', () => {
    const out = readCart();
    const tfootMatch = out.match(/<tfoot>[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    // The cart uses the unified row from ListingRow.astro. After the MOQ
    // and dual-price column collapse, the table is 6 columns in both
    // variants: Image, Product, Price, Qty, Total, Remove. The subtotal
    // label spans the first 4 (Image, Product, Price, Qty), leaving Total
    // and Remove as their own cells. The colspan is therefore a literal
    // 4 — no longer conditional on hasWholesale.
    expect(tfootMatch![0]).toMatch(/colspan=\{\s*4\s*\}/);
    // Pin the absence of the old conditional so a future regression that
    // re-splits the price column into MSRP + Wholesale doesn't silently
    // resurrect a stale colspan formula.
    expect(tfootMatch![0]).not.toMatch(/colspan=\{\s*hasWholesale/);
  });

  it('the subtotal value cell is a <td class="cs-col-total"> so it aligns with the Total column above', () => {
    const out = readCart();
    const tfootMatch = out.match(/<tfoot>[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    // The .cs-col-total class is the same one used in the thead and tbody —
    // shared column class is what gives the value cell column alignment.
    expect(tfootMatch![0]).toMatch(
      /<td[^>]*\bclass="[^"]*\bcs-col-total\b[^"]*"[^>]*>[\s\S]*?cs-subtotal-value/,
    );
  });

  it('includes a trailing remove-column cell so the row spans the full table width', () => {
    const out = readCart();
    const tfootMatch = out.match(/<tfoot>[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    // Without this cell the row would either be short by one column or the
    // total cell would silently span into the remove slot. Pin it explicitly.
    expect(tfootMatch![0]).toMatch(
      /<td[^>]*\bclass="[^"]*\bcs-col-remove\b[^"]*"[^>]*>\s*<\/td>/,
    );
  });

  it('keeps the .cs-totals-row hook on the <tr> element (not on a <div>)', () => {
    const out = readCart();
    // The class survives for theme hooks. If anyone reintroduces the old
    // <div class="cs-totals-row"> that would defeat the whole change.
    expect(out).not.toMatch(/<div\s+class="cs-totals-row"/);
    expect(out).toMatch(/<tr\s+class="cs-totals-row"/);
  });

  it('does NOT contain the legacy .cs-cart-totals wrapper div', () => {
    const out = readCart();
    // Old structure was `<div class="cs-cart-totals"><div class="cs-totals-row">...`
    // Both wrapper divs must be gone. Class hook itself should also vanish:
    // there is no element worth hanging it on now that the totals row is
    // a <tr>.
    expect(out).not.toMatch(/cs-cart-totals/);
  });
});
