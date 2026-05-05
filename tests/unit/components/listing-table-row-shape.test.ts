import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Listings table — row, thead, and CSS shape after the MOQ + dual-price
 * column collapse.
 *
 * Two columns leave the table:
 *
 *   1. MOQ stops being a column. It is a per-product constraint, not a
 *      comparison axis. It moves into the product cell as identity-adjacent
 *      metadata sitting alongside the SKU. When a listing has no MOQ, no
 *      span is rendered at all (no empty placeholder).
 *
 *   2. MSRP and Wholesale collapse into a single price cell. They are two
 *      views of the same datum (unit price), so a single <td class="cs-col-price">
 *      hosts both: a semantic <s class="cs-msrp"> for the struck retail price
 *      and a <span class="cs-wholesale"> for the effective wholesale price.
 *      When there is no wholesale, the cell renders the price as plain text.
 *
 * Both before and after, the row partial is shared by ListingTable.astro
 * (catalog) and Cart.astro (cart). The cart's subtotal <tfoot> colspan is
 * pinned in cart-component-markup.test.ts; this file scopes itself to the
 * row + thead + CSS contract.
 *
 * Tests assert on the source files directly, matching the rest of this
 * suite (we don't SSR Astro components in unit tests).
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const listingRowPath = join(REPO_ROOT, 'src', 'components', 'Listings', 'ListingRow.astro');
const listingTheadPath = join(REPO_ROOT, 'src', 'components', 'Listings', 'ListingThead.astro');
const listingCssPath = join(REPO_ROOT, 'src', 'components', 'Listings', 'ListingTable.css');

const readRow = (): string => readFileSync(listingRowPath, 'utf8');
const readThead = (): string => readFileSync(listingTheadPath, 'utf8');
const readCss = (): string => readFileSync(listingCssPath, 'utf8');

describe('ListingRow.astro — MOQ moves into the product cell', () => {
  it('does not render a td.cs-col-moq cell anywhere', () => {
    expect(readRow()).not.toMatch(/class="cs-col-moq"/);
  });

  it('renders a <span class="cs-listing-moq"> guarded by listing.moq (omitted when falsy)', () => {
    /*
     * Pin the short-circuit form so nobody reintroduces an unconditional
     * <span class="cs-listing-moq"></span> when MOQ is unset. The empty-span
     * regression is exactly what the move out of a dedicated column was
     * meant to avoid.
     */
    expect(readRow()).toMatch(
      /\{\s*listing\.moq\s*&&\s*<span\s+class="cs-listing-moq">/,
    );
  });

  it('the cs-listing-moq span content reads "Min {listing.moq}"', () => {
    expect(readRow()).toMatch(
      /<span\s+class="cs-listing-moq">Min\s*\{?\s*listing\.moq\s*\}?\s*<\/span>/,
    );
  });

  it('the cs-listing-moq span lives inside the cs-col-product <td> (next to cs-listing-sku)', () => {
    /*
     * Identity-adjacent metadata. If the span migrates back out of the
     * product cell, the columnar comparison-axis story breaks again.
     */
    const out = readRow();
    const productCellMatch = out.match(
      /<td[^>]*class="cs-col-product"[^>]*>[\s\S]*?<\/td>/,
    );
    expect(productCellMatch, 'expected td.cs-col-product block in ListingRow.astro').not.toBeNull();
    expect(productCellMatch![0]).toMatch(/class="cs-listing-moq"/);
    expect(productCellMatch![0]).toMatch(/class="cs-listing-sku"/);
  });
});

describe('ListingRow.astro — single price cell with semantic MSRP/wholesale', () => {
  it('does not emit two adjacent td.cs-col-price cells inside an Astro fragment', () => {
    /*
     * The previous shape wrapped the wholesale branch in a fragment that
     * emitted two adjacent <td class="cs-col-price"> cells (one for MSRP,
     * one for the effective wholesale price). That dual-cell shape is what
     * the refactor collapses. The ternary still has two branches in source
     * (one per wholesale variant) but each branch must render exactly one
     * <td class="cs-col-price">, not a fragment of two.
     */
    const out = readRow();
    expect(out).not.toMatch(
      /<>\s*<td[^>]*class="[^"]*\bcs-col-price\b[\s\S]*?<td[^>]*class="[^"]*\bcs-col-price\b/,
    );
  });

  it('does not put cs-msrp on a <td> (it belongs on an inner <s> wrapper)', () => {
    expect(readRow()).not.toMatch(/<td[^>]*class="[^"]*\bcs-msrp\b/);
  });

  it('emits <s class="cs-msrp"> wrapping the retail price under hasWholesale', () => {
    expect(readRow()).toMatch(
      /<s\s+class="cs-msrp">\s*\{?\s*listing\.price\s*\}?\s*<\/s>/,
    );
  });

  it('emits <span class="cs-wholesale"> wrapping the effective price under hasWholesale', () => {
    expect(readRow()).toMatch(
      /<span\s+class="cs-wholesale">\s*\{?\s*effectivePrice\s*\}?\s*<\/span>/,
    );
  });

  it('still renders a no-wholesale branch that prints the price plainly', () => {
    /*
     * The else-branch keeps {listing.price} as bare text inside
     * td.cs-col-price (no wrappers needed, no fake "wholesale" classname).
     */
    expect(readRow()).toMatch(
      /<td[^>]*class="cs-col-price"[^>]*>\s*\{listing\.price\}\s*<\/td>/,
    );
  });
});

describe('ListingThead.astro — single price column, no MOQ column', () => {
  it('does not declare a th.cs-col-moq', () => {
    expect(readThead()).not.toMatch(/class="cs-col-moq"/);
  });

  it('does not render a literal "MOQ" header label', () => {
    /*
     * The header text "MOQ" was the only thing labelling the dropped column.
     * If it survives, the column survived too — pin the absence.
     */
    expect(readThead()).not.toMatch(/>\s*MOQ\s*</);
  });

  it('does not render a literal "MSRP" header label (collapsed into the price column)', () => {
    expect(readThead()).not.toMatch(/>\s*MSRP\s*</);
  });

  it('renders exactly one th.cs-col-price', () => {
    const matches = readThead().match(/<th[^>]*class="cs-col-price"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('the price th label is "Wholesale" when hasWholesale, "Unit Price" otherwise', () => {
    /*
     * Pin the conditional rather than two literal headers — keeps the
     * intent (hasWholesale toggles between the two labels) inspectable.
     */
    const out = readThead();
    expect(out).toMatch(/hasWholesale\s*\?\s*['"]Wholesale['"]\s*:\s*['"]Unit Price['"]/);
  });
});

describe('ListingRow.astro — qty + remove collapse into a single controls cell', () => {
  /*
   * The remove button used to live in its own trailing <td class="cs-col-remove">.
   * That column reflowed every time a row toggled empty <-> in-cart, causing
   * visible layout shift across all rows. The fix collapses qty + remove into
   * one fixed-width controls cell at the end of the row. The remove button
   * is absolutely positioned inside that cell so toggling its visibility no
   * longer affects layout.
   *
   * Column order is now: image, product, price, total, controls.
   */
  it('contains exactly one <td class="cs-col-controls"> cell', () => {
    const matches = readRow().match(/<td[^>]*class="cs-col-controls"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('does not contain a <td class="cs-col-qty"> cell', () => {
    expect(readRow()).not.toMatch(/<td[^>]*class="cs-col-qty"/);
  });

  it('does not contain a <td class="cs-col-remove"> cell', () => {
    expect(readRow()).not.toMatch(/<td[^>]*class="cs-col-remove"/);
  });

  it('does not reference the dropped cs-col-qty / cs-col-remove names anywhere in the row', () => {
    // Hard-cut: the column class names are gone outright, not aliased.
    const out = readRow();
    expect(out).not.toMatch(/cs-col-qty\b/);
    expect(out).not.toMatch(/cs-col-remove\b/);
  });

  it('renders the remove button inside the cs-col-controls cell, not as a sibling cell', () => {
    /*
     * Pin the structural invariant that powers the no-shift behaviour:
     * the remove button must live inside the controls cell so its
     * visibility toggle doesn't affect the column count.
     */
    const out = readRow();
    const controlsCellMatch = out.match(
      /<td[^>]*class="cs-col-controls"[^>]*>[\s\S]*?<\/td>/,
    );
    expect(
      controlsCellMatch,
      'expected td.cs-col-controls block in ListingRow.astro',
    ).not.toBeNull();
    expect(controlsCellMatch![0]).toMatch(/class="cs-remove-btn"/);
  });

  it('renders CartControl inside the cs-col-controls cell', () => {
    const out = readRow();
    const controlsCellMatch = out.match(
      /<td[^>]*class="cs-col-controls"[^>]*>[\s\S]*?<\/td>/,
    );
    expect(controlsCellMatch).not.toBeNull();
    expect(controlsCellMatch![0]).toMatch(/<CartControl\b/);
  });

  it('keeps the remove button hidden by default (catalog-side default state)', () => {
    /*
     * The shared row partial defaults the remove button to `hidden`. The
     * cart un-hides it via .cs-cart .cs-remove-btn[hidden] in Cart.css.
     * Catalog rows toggle it visible only when the row is in-cart.
     */
    expect(readRow()).toMatch(/<button[^>]*class="cs-remove-btn"[^>]*\bhidden\b/);
  });

  it('places the cs-col-controls cell after cs-col-total (column order: image, product, price, total, controls)', () => {
    const out = readRow();
    const totalIdx = out.indexOf('class="cs-col-total"');
    const controlsIdx = out.indexOf('class="cs-col-controls"');
    expect(totalIdx).toBeGreaterThan(0);
    expect(controlsIdx).toBeGreaterThan(0);
    expect(controlsIdx).toBeGreaterThan(totalIdx);
  });

  it('places cs-col-total between cs-col-price and cs-col-controls', () => {
    /*
     * Full column order pin: image -> product -> price -> total -> controls.
     * Pinning each adjacency catches any regression that reshuffles the
     * row mid-refactor.
     */
    const out = readRow();
    const imageIdx = out.indexOf('class="cs-col-image"');
    const productIdx = out.indexOf('class="cs-col-product"');
    const priceIdx = out.search(/class="cs-col-price"/);
    const totalIdx = out.indexOf('class="cs-col-total"');
    const controlsIdx = out.indexOf('class="cs-col-controls"');
    expect(imageIdx).toBeGreaterThan(0);
    expect(productIdx).toBeGreaterThan(imageIdx);
    expect(priceIdx).toBeGreaterThan(productIdx);
    expect(totalIdx).toBeGreaterThan(priceIdx);
    expect(controlsIdx).toBeGreaterThan(totalIdx);
  });
});

describe('ListingThead.astro — qty + remove collapse into a single controls header', () => {
  it('contains exactly one <th class="cs-col-controls"> cell', () => {
    const matches = readThead().match(/<th[^>]*class="cs-col-controls"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('does not contain a <th class="cs-col-qty"> cell', () => {
    expect(readThead()).not.toMatch(/<th[^>]*class="cs-col-qty"/);
  });

  it('does not contain a <th class="cs-col-remove"> cell', () => {
    expect(readThead()).not.toMatch(/<th[^>]*class="cs-col-remove"/);
  });

  it('does not reference the dropped cs-col-qty / cs-col-remove names anywhere in the thead', () => {
    const out = readThead();
    expect(out).not.toMatch(/cs-col-qty\b/);
    expect(out).not.toMatch(/cs-col-remove\b/);
  });

  it('does not render a literal "Qty" header label', () => {
    /*
     * The Qty/Controls column has no visible label — it wraps an
     * action affordance, not a comparison axis.
     */
    expect(readThead()).not.toMatch(/>\s*Qty\s*</);
  });

  it('places the cs-col-controls header after cs-col-total (matches row column order)', () => {
    const out = readThead();
    const totalIdx = out.indexOf('class="cs-col-total"');
    const controlsIdx = out.indexOf('class="cs-col-controls"');
    expect(totalIdx).toBeGreaterThan(0);
    expect(controlsIdx).toBeGreaterThan(totalIdx);
  });
});

describe('ListingTable.css — controls column anchors the absolutely-positioned remove button', () => {
  it('does not declare a .cs-col-qty rule', () => {
    expect(readCss()).not.toMatch(/\.cs-col-qty\b/);
  });

  it('does not declare a .cs-col-remove rule', () => {
    expect(readCss()).not.toMatch(/\.cs-col-remove\b/);
  });

  it('does not reference the dropped --cs-listing-col-qty-width token', () => {
    expect(readCss()).not.toMatch(/--cs-listing-col-qty-width\b/);
  });

  it('does not reference the dropped --cs-listing-col-remove-width token', () => {
    expect(readCss()).not.toMatch(/--cs-listing-col-remove-width\b/);
  });

  it('declares a .cs-col-controls rule that pins width via --cs-listing-col-controls-width', () => {
    /*
     * The whole point of the controls column is a fixed width that
     * doesn't reflow when the remove button toggles visibility. The
     * width must come from a single token so themes can override.
     */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-col-controls\s*\{[^}]*\}/);
    expect(
      ruleMatch,
      'expected a .cs-col-controls { ... } rule block',
    ).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/width:\s*var\(--cs-listing-col-controls-width/);
  });

  it('positions the .cs-col-controls cell as a positioning context', () => {
    /*
     * The remove button is absolutely positioned relative to the controls
     * cell. That requires the cell to be a positioning ancestor.
     */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-col-controls\s*\{[^}]*\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/position:\s*relative/);
  });

  it('absolutely positions the remove button inside the controls cell with a right offset', () => {
    /*
     * The remove button's visibility toggle must not affect the layout of
     * any other cell. Position: absolute pulls it out of the flow; the
     * right offset bleeds it past the cell edge so it doesn't crowd the
     * stepper in cart context (where both coexist).
     */
    const css = readCss();
    const ruleMatch = css.match(
      /\.cs-col-controls\s+\.cs-remove-btn\s*\{[^}]*\}/,
    );
    expect(
      ruleMatch,
      'expected a .cs-col-controls .cs-remove-btn { ... } rule block',
    ).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/position:\s*absolute/);
    expect(ruleMatch![0]).toMatch(/right:\s*/);
  });
});

describe('ListingTable.css — selectors follow the column collapse', () => {
  it('does not declare a .cs-col-moq rule', () => {
    expect(readCss()).not.toMatch(/\.cs-col-moq\b/);
  });

  it('declares a .cs-listing-moq rule that mirrors .cs-listing-sku treatment', () => {
    /*
     * The MOQ span sits next to the SKU span; both are inline-adjacent
     * metadata under the product name. They should default to the same
     * muted, small, block-level treatment so they read as a stack.
     */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-listing-moq\s*\{[^}]*\}/);
    expect(ruleMatch, 'expected a .cs-listing-moq { ... } rule block').not.toBeNull();
    const rule = ruleMatch![0];
    expect(rule).toMatch(/display:\s*block/);
    expect(rule).toMatch(/font-size:\s*var\(--cs-text-3/);
    expect(rule).toMatch(/color:\s*var\(--cs-muted-text-color/);
  });

  it('keeps .cs-msrp explicitly line-through (not at the mercy of UA resets)', () => {
    const css = readCss();
    const ruleMatch = css.match(/\.cs-msrp\s*\{[^}]*\}/);
    expect(ruleMatch, 'expected a .cs-msrp { ... } rule block').not.toBeNull();
    expect(ruleMatch![0]).toMatch(/text-decoration:\s*line-through/);
    expect(ruleMatch![0]).toMatch(/color:\s*var\(--cs-muted-text-color/);
  });

  it('declares font-variant-numeric: tabular-nums for .cs-col-price', () => {
    /*
     * MSRP and wholesale stack on their own lines inside one cell. Tabular
     * digits keep the two prices column-aligned within the cell and across
     * rows, matching the visual story of "two views of the same datum."
     */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-col-price\s*\{[^}]*\}/);
    expect(ruleMatch, 'expected a .cs-col-price { ... } rule block').not.toBeNull();
    expect(ruleMatch![0]).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});
