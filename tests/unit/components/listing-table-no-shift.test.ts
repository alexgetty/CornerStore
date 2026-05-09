import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Listings table — column-width stability under cart-state transitions.
 *
 * After commit 2123015 (qty + remove collapsed into a single fixed-width
 * controls cell), column widths still drifted by a few pixels on every
 * cart-state interaction (add / remove / qty change). Two residual causes:
 *
 *   1. The table runs under the browser's default `table-layout: auto`.
 *      Cell content drives column widths, so when .cs-col-controls swaps
 *      from "Add to Cart" (small min-content) to the qty stepper (larger
 *      min-content from the fixed-width −/input/+ children), the auto
 *      algorithm rebalances neighbouring columns on every toggle.
 *
 *   2. .cs-col-total has no `font-variant-numeric: tabular-nums`. The line
 *      total updates from $0.00 to real values as users adjust quantities,
 *      and proportional digit widths nudge the column on every change.
 *
 * The fix locks the table to `table-layout: fixed` (column widths come from
 * the first row only, content thereafter cannot reflow them), gives the
 * price column an explicit width via a new --cs-listing-col-price-width
 * token (so it doesn't gobble half the leftover space under fixed mode),
 * and adds tabular-nums to .cs-col-total so its digit width is constant
 * across $0.00 → $9,999.99.
 *
 * Why source-level CSS contract tests, not getBoundingClientRect snapshots:
 * jsdom and happy-dom do not implement CSS layout — they return 0 for
 * getBoundingClientRect() on every element. A "stability" assertion in
 * either environment would be vacuously true (0 === 0) and lie about
 * coverage. The three CSS facts pinned below are mathematically sufficient
 * for column-width stability under fixed table-layout: every column has a
 * fixed width, every changing-content cell uses tabular digits.
 *
 * Real visual confirmation belongs in an E2E pass under a headless browser
 * once the project gains Playwright. Until then, the source contract is
 * the authoritative guard.
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

describe('ListingTable.css — table-layout is fixed (locks columns to first-row widths)', () => {
  it('declares table-layout: fixed inside the .cs-listing-table rule block', () => {
    /*
     * Without table-layout: fixed, the browser's auto algorithm rebalances
     * column widths from cell content on every render. With fixed, widths
     * lock to the first row's declarations and content can no longer
     * reflow them. This is the primary lever for no-shift behaviour.
     */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-listing-table\s*\{[^}]*\}/);
    expect(
      ruleMatch,
      'expected a .cs-listing-table { ... } rule block in ListingTable.css',
    ).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/table-layout:\s*fixed/);
  });
});

describe('ListingTable.css — every column has an explicit width hook', () => {
  /*
   * Under table-layout: fixed, any column without a declared width splits
   * the remaining space proportionally with its peers — and any change
   * to an unfixed column's content nudges its neighbours. Pinning a width
   * on every column class kills that whole class of drift.
   *
   * cs-col-product is intentionally the only exception: it absorbs all
   * leftover horizontal space, which is fine because product copy already
   * wraps inside the cell (no min-content forcing) and shifts in product
   * width are absorbed by its own cell, not propagated outward.
   */

  it('declares a .cs-col-price rule that pins width via --cs-listing-col-price-width', () => {
    /*
     * Before this fix, .cs-col-price had no width declaration at all. Under
     * fixed table-layout that means it would split leftover space evenly
     * with .cs-col-product, which is both ugly and (more importantly) makes
     * the price column's width depend on the product-name length of the
     * first row — the very kind of content-coupled width we are trying
     * to eliminate.
     */
    const css = readCss();
    // Match either inline single-line form or block form.
    const inline = css.match(
      /\.cs-col-price\s*\{[^}]*width:\s*var\(--cs-listing-col-price-width[^}]*\}/,
    );
    expect(
      inline,
      'expected a .cs-col-price rule pinning width via --cs-listing-col-price-width',
    ).not.toBeNull();
  });

  it('keeps .cs-col-image width pinned via --cs-listing-col-image-width', () => {
    /* Regression guard — already in place; pin it so a refactor cannot
     * silently drop the image-column width and reintroduce drift on that
     * column. */
    expect(readCss()).toMatch(
      /\.cs-col-image\s*\{[^}]*width:\s*var\(--cs-listing-col-image-width/,
    );
  });

  it('keeps .cs-col-total width pinned via --cs-listing-col-total-width', () => {
    /* Regression guard — same rationale as the image column above. */
    expect(readCss()).toMatch(
      /\.cs-col-total\s*\{[^}]*width:\s*var\(--cs-listing-col-total-width/,
    );
  });

  it('keeps .cs-col-controls width pinned via --cs-listing-col-controls-width', () => {
    /* Regression guard — the controls column is the original culprit; if
     * its width pin ever regresses the no-shift behaviour collapses.
     * The width is calc(base-token + fluid-inset) so the check looks for
     * the token reference rather than a bare var() at the top level. */
    const css = readCss();
    const ruleMatch = css.match(/\.cs-col-controls\s*\{[^}]*\}/);
    expect(ruleMatch).not.toBeNull();
    expect(ruleMatch![0]).toMatch(/width:\s*var\(--cs-listing-col-controls-width/);
  });
});

describe('ListingTable.css — tabular-nums on every column whose content changes at runtime', () => {
  it('declares font-variant-numeric: tabular-nums for .cs-col-total', () => {
    /*
     * The line-total cell is the one cell whose content actively changes
     * during cart interactions ($0.00 → $12.50 → $125.00 → $1,250.00 as
     * quantity steps up). Proportional digits would shift the column on
     * every change even with table-layout: fixed, because the surrounding
     * cell would still report a min-content based on the new glyph widths
     * if the column ever fell back to auto sizing. Tabular nums removes
     * that dependency outright.
     *
     * .cs-col-price already gets tabular-nums (asserted in
     * listing-table-row-shape.test.ts). This pins the same treatment on
     * the column whose content actually changes at runtime.
     */
    const css = readCss();
    // Match the dedicated single-rule block for .cs-col-total. The width
    // declaration may live in the same block or a separate block; this
    // assertion is scoped to the font-variant-numeric declaration only.
    const blocks = css.match(/\.cs-col-total\s*\{[^}]*\}/g) ?? [];
    expect(
      blocks.length,
      'expected at least one .cs-col-total { ... } rule block',
    ).toBeGreaterThan(0);
    const combined = blocks.join('\n');
    expect(combined).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe('theme.css — --cs-listing-col-price-width default is published', () => {
  it('declares a default value for --cs-listing-col-price-width in :root', () => {
    /*
     * Init parity: the package's CSS reads the token via var(... , <fallback>)
     * but the scaffolded theme is the canonical place for theme-level
     * defaults — that's where consumers see and override them. If the token
     * is referenced by the package but never published in the theme, it
     * shows up as a missing-token gap during onboarding.
     */
    const theme = readTheme();
    expect(theme).toMatch(/--cs-listing-col-price-width:\s*[^;]+;/);
  });

  it('the --cs-listing-col-price-width default sits next to the other listing-table column tokens', () => {
    /*
     * Cohesion: the listing-table column-width tokens are grouped under
     * the "Listing Table" comment block. The new token belongs in that
     * cluster so future readers can audit all column widths in one place.
     * Pin the adjacency to --cs-listing-col-total-width which is the
     * closest semantic neighbour (the only other right-aligned numeric
     * column).
     */
    const theme = readTheme();
    expect(theme).toMatch(
      /--cs-listing-col-(price|total)-width:[^;]+;\s*--cs-listing-col-(total|price)-width:[^;]+;/,
    );
  });
});
