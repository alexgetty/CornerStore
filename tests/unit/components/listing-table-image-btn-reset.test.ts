import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingTable.css - .cs-listing-image-btn reset and lightbox affordance.
 *
 * The table view emits the same trigger primitive (<button class=
 * "cs-listing-image-btn">) as the card view, but its existing reset is more
 * minimal because the surrounding cell already provides layout context.
 * This test pins the existing reset (background/border/padding) AND the new
 * lightbox affordance (cursor: zoom-in, :focus-visible outline) that moved
 * into the package along with the lightbox primitive.
 *
 * Mirrors listing-cards-image-btn-reset.test.ts. Source-contract style.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const listingTableCssPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingTable.css',
);

const readCss = (): string => readFileSync(listingTableCssPath, 'utf8');

/*
 * Extract the body of the .cs-listing-image-btn rule (everything between its
 * opening brace and matching closing brace). Brace matching ignores nesting
 * so the helper works inside @layer { ... }.
 */
function extractImageBtnRuleBody(css: string): string {
  const re = /\.cs-listing-image-btn\s*\{/;
  const match = re.exec(css);
  if (!match) {
    throw new Error('expected a .cs-listing-image-btn rule in ListingTable.css');
  }
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) return css.slice(start, i);
    i++;
  }
  throw new Error('unterminated .cs-listing-image-btn rule body');
}

describe('ListingTable.css - .cs-listing-image-btn reset and affordance', () => {
  it('declares a .cs-listing-image-btn rule', () => {
    expect(readCss()).toMatch(/\.cs-listing-image-btn\s*\{/);
  });

  it('zeroes background/border/padding to neutralize UA button chrome', () => {
    /*
     * The table reset is intentionally minimal: only what's needed so the
     * inner thumb (sized via .cs-thumb) sits in the cell without UA chrome
     * showing through. Pin the existing minimum.
     */
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/background:\s*none\b/);
    expect(body).toMatch(/border:\s*none\b/);
    expect(body).toMatch(/padding:\s*0\b/);
  });

  it('declares cursor zoom-in (lightbox affordance)', () => {
    /*
     * The button now opens the package-owned lightbox. Cursor moves from
     * pointer to zoom-in to communicate the dialog interaction. Mirror the
     * cards reset.
     */
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/cursor:\s*zoom-in\b/);
  });

  it('declares a :focus-visible outline using --cs-focus-color (with currentColor fallback)', () => {
    /*
     * Keyboard users tabbing through table rows need a visible focus ring on
     * the image trigger. Same contract as the card view.
     */
    const css = readCss();
    const re = /\.cs-listing-image-btn:focus-visible\s*\{([\s\S]*?)\}/;
    const match = re.exec(css);
    expect(match, 'expected a .cs-listing-image-btn:focus-visible rule').not.toBeNull();
    const body = match![1]!;
    expect(body).toMatch(/outline:/);
    expect(body).toMatch(/outline-offset:/);
    expect(body).toMatch(/var\(--cs-focus-color,\s*currentColor\)/);
  });
});
