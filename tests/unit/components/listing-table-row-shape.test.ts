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
