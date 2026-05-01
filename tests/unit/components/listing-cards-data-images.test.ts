import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingCards.astro - data-images attribute on <article class="cs-listing">.
 *
 * Consumers of the card DOM (galleries, lightboxes, hover swaps, etc.) need
 * access to every image for a listing without re-fetching the catalog. The
 * card already renders only `images[0]` inside the <figure>; the rest of the
 * array is dropped on the floor. Surface the full array as a JSON-encoded
 * data attribute on the article element so client code can read
 * `JSON.parse(el.dataset.images)` and build whatever UI it wants.
 *
 * Contract:
 *   - Multi-image listing: data-images is a JSON-stringified array of
 *     {url, alt} objects matching listing.images.
 *   - Single-image listing: data-images is a JSON array of length 1.
 *   - Empty listing.images: attribute is OMITTED entirely. Not the empty
 *     string, not "[]". Astro skips attributes with value `undefined`, so
 *     the source-level pattern is a ternary that yields `undefined` when
 *     the array is empty.
 *
 * Astro caveat (verified): Astro does NOT auto-JSON arrays passed to
 * attributes - it calls String(value), which produces "[object Object],...".
 * The source must call JSON.stringify explicitly.
 *
 * Tests assert on the source .astro file - same approach as
 * cart-component-markup.test.ts and nav-mobile-disclosure.test.ts. We don't
 * SSR Astro components in unit tests (per
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
 * the matching `>` that closes the tag). This is where all the data-*
 * attributes live; scoping assertions to this slice avoids accidental
 * matches inside child markup.
 */
function extractArticleOpenTag(astro: string): string {
  const start = astro.indexOf('<article');
  if (start === -1) {
    throw new Error('expected <article> in ListingCards.astro');
  }
  // Walk forward to the matching `>`, ignoring `>` chars inside attribute
  // expression braces `{...}` (Astro lets JS expressions back into attrs).
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

describe('ListingCards.astro - data-images attribute on <article class="cs-listing">', () => {
  it('the article opening tag carries a data-images attribute', () => {
    const out = readListingCards();
    const tag = extractArticleOpenTag(out);
    expect(tag).toMatch(/\bdata-images=/);
  });

  it('data-images value is built from JSON.stringify(listing.images), not String(...)', () => {
    /*
     * Astro stringifies non-string attribute values via String(value), which
     * for an array of objects produces "[object Object],[object Object]".
     * The source must call JSON.stringify explicitly. Pin that.
     */
    const out = readListingCards();
    const tag = extractArticleOpenTag(out);
    expect(tag).toMatch(
      /\bdata-images=\{[^}]*\bJSON\.stringify\(\s*listing\.images\s*\)/,
    );
  });

  it('data-images is omitted (yields undefined) when listing.images is empty', () => {
    /*
     * Astro skips attributes whose value is `undefined`. The canonical
     * shape is a ternary that returns JSON.stringify(...) for non-empty
     * arrays and `undefined` for the empty case:
     *
     *   data-images={listing.images.length > 0
     *     ? JSON.stringify(listing.images)
     *     : undefined}
     *
     * We pin the structural shape: the ternary's truthy arm calls
     * JSON.stringify, and the falsy arm is the literal `undefined`.
     */
    const out = readListingCards();
    const tag = extractArticleOpenTag(out);
    expect(tag).toMatch(
      /\bdata-images=\{\s*listing\.images\.length\s*>\s*0\s*\?\s*JSON\.stringify\(\s*listing\.images\s*\)\s*:\s*undefined\s*\}/,
    );
  });

  it('regression: data-images is NOT set to an empty string or "[]" for empty arrays', () => {
    /*
     * Guards against two regressions:
     *   1. data-images="" (always-on attribute, parses to empty string).
     *   2. data-images={JSON.stringify(listing.images)} unconditionally
     *      (yields "[]" for empty arrays - parses, but lies about absence).
     * Both would defeat the "absent when empty" half of the contract.
     */
    const out = readListingCards();
    const tag = extractArticleOpenTag(out);
    expect(tag).not.toMatch(/\bdata-images=""/);
    // Reject an unconditional JSON.stringify that has no length-guard.
    // Acceptable forms always pair JSON.stringify with `listing.images.length`
    // somewhere in the same expression. If JSON.stringify(listing.images)
    // appears WITHOUT a length check anywhere in the article tag, fail.
    const hasJsonStringify = /\bJSON\.stringify\(\s*listing\.images\s*\)/.test(
      tag,
    );
    const hasLengthGuard = /listing\.images\.length\s*>\s*0/.test(tag);
    if (hasJsonStringify) {
      expect(hasLengthGuard).toBe(true);
    }
  });

  it('regression: <img src={listing.images[0].url} ...> still renders inside <figure class="cs-listing-image">', () => {
    /*
     * The data-images addition is purely additive. The existing single-
     * image rendering must not change. Pin the shape that already shipped.
     */
    const out = readListingCards();
    expect(out).toMatch(
      /<figure\s+class="cs-listing-image">[\s\S]*?<img\s+src=\{listing\.images\[0\]\.url\}\s+alt=\{listing\.images\[0\]\.alt\}\s+itemprop="image"[\s\S]*?<\/figure>/,
    );
  });

  it('regression: existing data-* attributes (data-sku, data-raw-price, data-currency) survive on the article', () => {
    /*
     * Belt-and-braces: a careless edit could clobber a sibling attribute
     * while adding data-images. Pin the existing contract so the new
     * attribute lands alongside, not in place of.
     */
    const out = readListingCards();
    const tag = extractArticleOpenTag(out);
    expect(tag).toMatch(/\bdata-sku=\{listing\.sku\}/);
    expect(tag).toMatch(/\bdata-raw-price=\{effectiveRaw\}/);
    expect(tag).toMatch(/\bdata-currency=\{listing\.currency\}/);
  });
});
