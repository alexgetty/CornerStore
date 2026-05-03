import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingCards.css - .cs-listing-image-btn reset.
 *
 * The card view wraps the inline image in a real button. Without a reset,
 * user-agent button styles (inline-block, padding, light gray background,
 * border, native font) leak into the card layout: the image shrinks, gains
 * a chrome border, and the card grid jiggles. The package ships a minimal
 * reset so the wrapper is layout-transparent. The inner image keeps
 * whatever sizing rules already apply to it (.cs-listing-image img sets
 * width: 100%, aspect-ratio, object-fit).
 *
 * The same class is used by ListingTable, but the table view's existing
 * .cs-listing-image-btn rule (carried forward from .cs-thumb-btn) is
 * already a reset for that context. The cards reset is added separately
 * to avoid coupling the two views resets in one stylesheet.
 *
 * Tests assert on the source CSS file (regex), matching how other
 * component CSS contracts are pinned in this repo.
 */

const listingCardsCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Listings',
  'ListingCards.css',
);

const readCss = (): string => readFileSync(listingCardsCssPath, 'utf8');

/*
 * Extract the body of the .cs-listing-image-btn rule (everything between
 * its opening brace and matching closing brace). Scoping assertions to
 * this slice avoids accidental matches inside neighboring rules.
 */
function extractImageBtnRuleBody(css: string): string {
  const re = /\.cs-listing-image-btn\s*\{/;
  const match = re.exec(css);
  if (!match) {
    throw new Error('expected a .cs-listing-image-btn rule in ListingCards.css');
  }
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) {
      return css.slice(start, i);
    }
    i++;
  }
  throw new Error('unterminated .cs-listing-image-btn rule body');
}

describe('ListingCards.css - .cs-listing-image-btn reset', () => {
  it('declares a .cs-listing-image-btn rule', () => {
    expect(readCss()).toMatch(/\.cs-listing-image-btn\s*\{/);
  });

  it('zeroes padding, margin, border, and background to neutralize UA button chrome', () => {
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/padding:\s*0\b/);
    expect(body).toMatch(/margin:\s*0\b/);
    expect(body).toMatch(/border:\s*0\b/);
    expect(body).toMatch(/background:\s*transparent\b/);
  });

  it('makes the wrapper a layout-transparent block (display block, full width and height)', () => {
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/display:\s*block\b/);
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/height:\s*100%/);
  });

  it('inherits font and color from context', () => {
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/font:\s*inherit\b/);
    expect(body).toMatch(/color:\s*inherit\b/);
  });

  it('declares cursor pointer and appearance none for parity with native buttons', () => {
    const body = extractImageBtnRuleBody(readCss());
    expect(body).toMatch(/cursor:\s*pointer\b/);
    expect(body).toMatch(/appearance:\s*none\b/);
  });
});
