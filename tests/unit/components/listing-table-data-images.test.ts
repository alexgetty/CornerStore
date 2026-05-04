import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingRow.astro - data-images attribute on the image-trigger button.
 *
 * Image gallery responsibility belongs to the consumer, not the row markup.
 * The row previously shipped its own single-image lightbox inline (markup,
 * CSS, JS). That's gone. The new contract is a single accessible trigger
 * primitive: when a listing has images, the inline thumbnail is wrapped in a
 * <button class="cs-listing-image-btn" type="button" aria-haspopup="dialog"
 * data-images=...> that exposes the full image array as JSON. Consumers
 * attach their own click handler to that button to build whatever overlay
 * they want.
 *
 * The same primitive is emitted by ListingCards.astro. Two views, one
 * trigger contract.
 *
 * The shared row partial (ListingRow.astro) is composed by both
 * ListingTable.astro (catalog table view) and Cart.astro (cart page).
 * The contract pinned here lives on the row partial because that's where
 * the markup is authored.
 *
 * Contract:
 *   - Multi-image listing: data-images is a JSON-stringified array of
 *     {url, alt} objects matching listing.images. Lives on the button.
 *   - Single-image listing: data-images is a JSON array of length 1.
 *   - Empty listing.images: NO button at all. The cell renders the existing
 *     non-interactive <span class="cs-no-image" aria-hidden="true"> placeholder.
 *     There is no data-images attribute anywhere in the cell.
 *
 * Accessibility:
 *   - type="button" prevents accidental form submission.
 *   - aria-haspopup="dialog" announces "has popup dialog" to AT.
 *   - NO aria-label on the button. The accessible name comes from the inner
 *     <img>'s alt attribute. An aria-label would suppress the alt-derived
 *     name, which is a regression.
 *
 * Removals (also pinned here so a future regression that re-introduces the
 * inline lightbox or the old class name fails loudly):
 *   - No <button class="cs-thumb-btn"> anywhere.
 *   - No data-full-src or data-alt on the button.
 *   - No <div class="cs-lightbox"> overlay markup at the bottom of the section.
 *   - No data-images on the <tr class="cs-order-row"> row element. The row
 *     used to expose images for a previous iteration; the contract surface
 *     is now the button, not the row.
 *
 * Tests assert on the source .astro file, matching cart-component-markup.test.ts,
 * nav-mobile-disclosure.test.ts, and listing-cards-data-images.test.ts.
 */

const listingRowPath = join(
  process.cwd(),
  'src',
  'components',
  'Listings',
  'ListingRow.astro',
);

const readListingTable = (): string => readFileSync(listingRowPath, 'utf8');

/*
 * Extract the <button class="cs-listing-image-btn" ...> opening tag
 * (everything from `<button` through the matching `>` that closes the tag).
 * Scoping assertions to this slice avoids accidental matches inside child
 * markup or sibling buttons (remove button, cart-control buttons, etc.).
 */
function extractImageButtonOpenTag(astro: string): string {
  const marker = 'cs-listing-image-btn';
  const markerIdx = astro.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(
      'expected <button class="cs-listing-image-btn"> in ListingRow.astro',
    );
  }
  // Walk backwards to the opening `<button`.
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
  // Walk forward to the matching `>`, ignoring `>` chars inside attribute
  // expression braces `{...}` (Astro lets JS expressions back into attrs).
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
  throw new Error('unterminated <button> opening tag in ListingTable.astro');
}

/*
 * Extract the <tr class="cs-order-row" ...> opening tag. Used to assert
 * removals (data-images no longer on the row) and the survival of existing
 * data-* attributes there.
 */
function extractOrderRowOpenTag(astro: string): string {
  const fallback = astro.indexOf('class="cs-order-row"');
  if (fallback === -1) {
    throw new Error('expected <tr class="cs-order-row"> in ListingRow.astro');
  }
  let i = fallback;
  while (i >= 0 && !(astro[i] === '<' && astro.slice(i, i + 3) === '<tr')) i--;
  if (i < 0) {
    throw new Error('could not locate <tr opening before cs-order-row class');
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
  throw new Error('unterminated <tr> opening tag in ListingTable.astro');
}

describe('ListingRow.astro - cs-listing-image-btn trigger primitive', () => {
  it('renders <button class="cs-listing-image-btn"> when a listing has an image', () => {
    expect(readListingTable()).toMatch(
      /<button[^>]*class="cs-listing-image-btn"/,
    );
  });

  it('the button declares type="button"', () => {
    const tag = extractImageButtonOpenTag(readListingTable());
    expect(tag).toMatch(/\btype="button"/);
  });

  it('the button declares aria-haspopup="dialog"', () => {
    const tag = extractImageButtonOpenTag(readListingTable());
    expect(tag).toMatch(/\baria-haspopup="dialog"/);
  });

  it('the button does NOT carry an aria-label (alt on the inner <img> is the accessible name)', () => {
    const tag = extractImageButtonOpenTag(readListingTable());
    expect(tag).not.toMatch(/\baria-label=/);
  });

  it('the button carries a data-images attribute', () => {
    const tag = extractImageButtonOpenTag(readListingTable());
    expect(tag).toMatch(/\bdata-images=/);
  });

  it('data-images value is built from JSON.stringify(listing.images), not String(...)', () => {
    /*
     * Astro stringifies non-string attribute values via String(value), which
     * for an array of objects produces "[object Object],[object Object]".
     * The source must call JSON.stringify explicitly. Pin that.
     */
    const tag = extractImageButtonOpenTag(readListingTable());
    expect(tag).toMatch(
      /\bdata-images=\{[^}]*\bJSON\.stringify\(\s*listing\.images\s*\)/,
    );
  });

  it('the inner <img class="cs-thumb"> still carries its alt attribute', () => {
    expect(readListingTable()).toMatch(
      /<img\s+src=\{thumb\.url\}\s+alt=\{thumb\.alt\s*\|\|\s*listing\.name\}\s+class="cs-thumb"/,
    );
  });

  it('the no-image fallback is a non-interactive <span class="cs-no-image" aria-hidden>, not a button', () => {
    const out = readListingTable();
    expect(out).toMatch(/<span\s+class="cs-no-image"\s+aria-hidden="true"\s*>/);
    // No disabled fallback button under either old or new class name.
    expect(out).not.toMatch(
      /<button[^>]*class="cs-listing-image-btn"[^>]*disabled/,
    );
    expect(out).not.toMatch(/<button[^>]*class="cs-thumb-btn"[^>]*disabled/);
  });

  it('removed: no <button class="cs-thumb-btn"> anywhere in the source', () => {
    expect(readListingTable()).not.toMatch(/cs-thumb-btn/);
  });

  it('removed: data-full-src no longer appears anywhere in the source', () => {
    expect(readListingTable()).not.toMatch(/data-full-src/);
  });

  it('removed: data-alt no longer appears on the image-trigger button (alt lives on the inner <img>)', () => {
    expect(readListingTable()).not.toMatch(
      /<button[^>]*class="cs-listing-image-btn"[^>]*data-alt=/,
    );
  });

  it('removed: the inline cs-lightbox overlay markup is gone', () => {
    expect(readListingTable()).not.toMatch(/cs-lightbox/);
  });

  it('removed: data-images is NOT on the <tr class="cs-order-row"> (it lives on the button)', () => {
    /*
     * A previous iteration of this work parked data-images on the row. The
     * new contract puts it on the button so consumers read JSON from one
     * element with no DOM walk. Pin the absence.
     */
    const tag = extractOrderRowOpenTag(readListingTable());
    expect(tag).not.toMatch(/\bdata-images=/);
  });

  it('regression: existing data-* attributes (data-sku, data-raw-price, data-moq) survive on the <tr>', () => {
    /*
     * Belt-and-braces: the row-level cart contract (sku, price, moq) must
     * survive any image-related refactor.
     */
    const tag = extractOrderRowOpenTag(readListingTable());
    expect(tag).toMatch(/\bdata-sku=\{listing\.sku\}/);
    expect(tag).toMatch(/\bdata-raw-price=\{wholesaleRaw\}/);
    expect(tag).toMatch(/\bdata-moq=/);
  });
});
