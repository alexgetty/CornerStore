import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingCards.astro - cs-listing-image-btn trigger primitive.
 *
 * Both ListingCards.astro and ListingTable.astro emit the SAME accessible
 * trigger primitive when a listing has images: the inline <img> is wrapped
 * in <button class="cs-listing-image-btn" type="button" aria-haspopup="dialog"
 * data-images=...>. The package owns the trigger element and its
 * accessibility semantics. The lightbox / dialog UI itself is the consumer's
 * concern.
 *
 * Contract (cards):
 *   - Multi-image listing: <button> wraps <img>. data-images is a JSON-
 *     stringified array of {url, alt} objects matching listing.images.
 *   - Single-image listing: same shape, JSON array of length 1.
 *   - Empty listing.images: NO button. The existing
 *     <div class="cs-listing-placeholder"> fallback renders unchanged. There
 *     is no data-images attribute anywhere in the figure.
 *
 * Accessibility:
 *   - type="button" prevents accidental form submission.
 *   - aria-haspopup="dialog" announces "has popup dialog" to AT.
 *   - NO aria-label on the button. The accessible name comes from the inner
 *     <img>'s alt attribute. An aria-label would suppress the alt-derived
 *     name, which is a regression.
 *
 * Removals:
 *   - data-images is NOT on the <article class="cs-listing"> element. The
 *     contract surface is the button so consumers read JSON from a single
 *     element with no DOM walk.
 *
 * Tests assert on the source .astro file - same approach as
 * cart-component-markup.test.ts and listing-table-data-images.test.ts. We
 * don't SSR Astro components in unit tests (per
 * docs/todo/cart-listings-test-coverage.md).
 */

const listingCardsPath = join(
  process.cwd(),
  'src',
  'components',
  'Listings',
  'ListingCards.astro',
);

const readListingCards = (): string => readFileSync(listingCardsPath, 'utf8');

/*
 * Extract the <article ...> opening tag (everything from `<article` through
 * the matching `>` that closes the tag). Used to assert removal of
 * data-images at the article level and survival of unrelated data-* attrs.
 */
function extractArticleOpenTag(astro: string): string {
  const start = astro.indexOf('<article');
  if (start === -1) {
    throw new Error('expected <article> in ListingCards.astro');
  }
  let depth = 0;
  let i = start;
  while (i < astro.length) {
    const c = astro[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) {
      return astro.slice(start, i + 1);
    }
    i++;
  }
  throw new Error('unterminated <article> opening tag in ListingCards.astro');
}

/*
 * Extract the <button class="cs-listing-image-btn" ...> opening tag. Scoping
 * assertions to this slice avoids accidental matches inside child markup or
 * sibling buttons (cart-control buttons, etc.).
 */
function extractImageButtonOpenTag(astro: string): string {
  const marker = 'cs-listing-image-btn';
  const markerIdx = astro.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(
      'expected <button class="cs-listing-image-btn"> in ListingCards.astro',
    );
  }
  let i = markerIdx;
  while (i >= 0 && !(astro[i] === '<' && astro.slice(i, i + 7) === '<button')) {
    i--;
  }
  if (i < 0) {
    throw new Error(
      'could not locate <button opening before cs-listing-image-btn class',
    );
  }
  const start = i;
  let depth = 0;
  let j = start;
  while (j < astro.length) {
    const c = astro[j];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) {
      return astro.slice(start, j + 1);
    }
    j++;
  }
  throw new Error('unterminated <button> opening tag in ListingCards.astro');
}

describe('ListingCards.astro - cs-listing-image-btn trigger primitive', () => {
  it('renders <button class="cs-listing-image-btn"> when a listing has an image', () => {
    expect(readListingCards()).toMatch(
      /<button[^>]*class="cs-listing-image-btn"/,
    );
  });

  it('the button declares type="button"', () => {
    const tag = extractImageButtonOpenTag(readListingCards());
    expect(tag).toMatch(/\btype="button"/);
  });

  it('the button declares aria-haspopup="dialog"', () => {
    const tag = extractImageButtonOpenTag(readListingCards());
    expect(tag).toMatch(/\baria-haspopup="dialog"/);
  });

  it('the button does NOT carry an aria-label (alt on the inner <img> is the accessible name)', () => {
    const tag = extractImageButtonOpenTag(readListingCards());
    expect(tag).not.toMatch(/\baria-label=/);
  });

  it('the button carries a data-images attribute', () => {
    const tag = extractImageButtonOpenTag(readListingCards());
    expect(tag).toMatch(/\bdata-images=/);
  });

  it('data-images value is built from JSON.stringify(listing.images), not String(...)', () => {
    /*
     * Astro stringifies non-string attribute values via String(value), which
     * for an array of objects produces "[object Object],[object Object]".
     * The source must call JSON.stringify explicitly. Pin that.
     */
    const tag = extractImageButtonOpenTag(readListingCards());
    expect(tag).toMatch(
      /\bdata-images=\{[^}]*\bJSON\.stringify\(\s*listing\.images\s*\)/,
    );
  });

  it('the inner <img> keeps src/alt/itemprop="image" inside the button', () => {
    /*
     * Wrapping the image in a button must not alter the image element
     * itself. itemprop="image" is the schema.org microdata hook and stays
     * on the <img>, not the wrapping button.
     */
    const out = readListingCards();
    expect(out).toMatch(
      /<button[^>]*class="cs-listing-image-btn"[\s\S]*?<img\s+src=\{listing\.images\[0\]\.url\}\s+alt=\{listing\.images\[0\]\.alt[\s\S]*?itemprop="image"[\s\S]*?<\/button>/,
    );
  });

  it('the button is rendered inside <figure class="cs-listing-image">', () => {
    /*
     * The figure is the structural wrapper. The button replaces the bare
     * <img> as the figure's interactive child. Pin that the button lives
     * inside the existing figure, not in some new wrapper.
     */
    const out = readListingCards();
    expect(out).toMatch(
      /<figure\s+class="cs-listing-image">[\s\S]*?<button[^>]*class="cs-listing-image-btn"/,
    );
  });

  it('the no-image fallback is the existing <div class="cs-listing-placeholder">, not a button', () => {
    /*
     * When a listing has no images, no button renders. The existing
     * placeholder div is kept verbatim with its aria-label.
     */
    const out = readListingCards();
    expect(out).toMatch(
      /<div\s+class="cs-listing-placeholder"\s+aria-label=\{`\$\{listing\.name\} product image`\}\s*\/>/,
    );
    // No disabled button fallback.
    expect(out).not.toMatch(
      /<button[^>]*class="cs-listing-image-btn"[^>]*disabled/,
    );
  });

  it('removed: data-images is NOT on the <article class="cs-listing"> element', () => {
    /*
     * The contract surface is the button, not the article. A consumer
     * reading images from the article would walk past sibling cards or
     * miss the no-image case. Pin the absence at the article level.
     */
    const tag = extractArticleOpenTag(readListingCards());
    expect(tag).not.toMatch(/\bdata-images=/);
  });

  it('regression: existing data-* attributes (data-sku, data-raw-price, data-currency) survive on the article', () => {
    /*
     * Belt-and-braces: the article-level cart contract (sku, price, currency)
     * must survive any image-related refactor.
     */
    const tag = extractArticleOpenTag(readListingCards());
    expect(tag).toMatch(/\bdata-sku=\{listing\.sku\}/);
    expect(tag).toMatch(/\bdata-raw-price=\{effectiveRaw\}/);
    expect(tag).toMatch(/\bdata-currency=\{listing\.currency\}/);
  });
});
