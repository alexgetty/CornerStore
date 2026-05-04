import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ListingTable: inline lightbox is removed end-to-end.
 *
 * The table view used to ship a single-image lightbox inline (markup, CSS, JS).
 * That responsibility has moved out of the library: the table now exposes a
 * single accessible trigger primitive (<button class="cs-listing-image-btn"
 * type="button" aria-haspopup="dialog" data-images=...>) and consumers own
 * the overlay UI. These tests pin the removal at every layer so it cannot
 * creep back in:
 *
 *   - ListingTable.astro: no <div class="cs-lightbox">, no data-full-src,
 *                         no cs-thumb-btn (renamed to cs-listing-image-btn).
 *   - ListingTable.css:   no .cs-lightbox{,-backdrop,-img} rule blocks, no
 *                         .cs-thumb-btn rule, no --cs-lightbox-* custom props.
 *   - listings.ts:        no querySelector for .cs-lightbox*, no wireTableExtras
 *                         logic that touches lightbox elements, no references
 *                         to the old .cs-thumb-btn class.
 *   - theme/theme.css:    no --cs-lightbox-* token definitions.
 *
 * Tests are source-level (regex on the files), matching cart-mobile-stack.test.ts
 * and the other listing-table source tests. The image-trigger button stays
 * (under its new class name) because the consumer wires its own overlay onto
 * it.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');

// The image-trigger markup now lives in the shared ListingRow partial that
// both ListingTable.astro (catalog table view) and Cart.astro compose. The
// inline-lightbox removal contract follows the markup to ListingRow.astro.
const listingRowAstroPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingRow.astro',
);
const listingTableAstroPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingTable.astro',
);
const listingTableCssPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingTable.css',
);
const listingsTsPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'listings.ts',
);
const themeCssPath = join(REPO_ROOT, 'theme', 'theme.css');

const readRowAstro = (): string => readFileSync(listingRowAstroPath, 'utf8');
const readTableAstro = (): string => readFileSync(listingTableAstroPath, 'utf8');
const readCss = (): string => readFileSync(listingTableCssPath, 'utf8');
const readTs = (): string => readFileSync(listingsTsPath, 'utf8');
const readTheme = (): string => readFileSync(themeCssPath, 'utf8');

describe('ListingTable inline-lightbox removal', () => {
  describe('ListingRow.astro (shared row markup)', () => {
    it('does not contain any cs-lightbox markup', () => {
      expect(readRowAstro()).not.toMatch(/cs-lightbox/);
    });

    it('does not contain the old cs-thumb-btn class anywhere', () => {
      expect(readRowAstro()).not.toMatch(/cs-thumb-btn/);
    });

    it('does not carry data-full-src on the image-trigger button (or anywhere)', () => {
      expect(readRowAstro()).not.toMatch(/data-full-src/);
    });

    it('keeps the cs-listing-image-btn click target intact for consumer-wired overlays', () => {
      // Removal is scoped: the button stays (under the unified class name),
      // only the inline overlay leaves.
      expect(readRowAstro()).toMatch(
        /<button[^>]*class="cs-listing-image-btn"/,
      );
    });
  });

  describe('ListingTable.astro (chrome around the shared row)', () => {
    it('does not contain any cs-lightbox markup at the table chrome level', () => {
      // The table chrome (header, grouping, table element) must also remain
      // free of any reintroduced inline lightbox overlay.
      expect(readTableAstro()).not.toMatch(/cs-lightbox/);
    });
  });

  describe('ListingTable.css', () => {
    it('does not declare a .cs-lightbox rule block', () => {
      expect(readCss()).not.toMatch(/\.cs-lightbox\b/);
    });

    it('does not declare a .cs-thumb-btn rule block (renamed to .cs-listing-image-btn)', () => {
      expect(readCss()).not.toMatch(/\.cs-thumb-btn\b/);
    });

    it('does not reference any --cs-lightbox-* custom property', () => {
      expect(readCss()).not.toMatch(/--cs-lightbox-/);
    });

    it('keeps --cs-thumb-border-radius (still used by .cs-thumb)', () => {
      // Sanity: removal is scoped. The thumb radius token stays. .cs-thumb
      // and .cs-no-image both reference it. If this fails, the cleanup
      // overshot and a separate consumer-visible token vanished.
      expect(readCss()).toMatch(/--cs-thumb-border-radius/);
    });
  });

  describe('listings.ts', () => {
    it('does not query for .cs-lightbox, .cs-lightbox-img, or .cs-lightbox-backdrop', () => {
      const ts = readTs();
      expect(ts).not.toMatch(/\.cs-lightbox\b/);
      expect(ts).not.toMatch(/\.cs-lightbox-img/);
      expect(ts).not.toMatch(/\.cs-lightbox-backdrop/);
    });

    it('does not reference the old .cs-thumb-btn class (renamed to .cs-listing-image-btn)', () => {
      expect(readTs()).not.toMatch(/\.cs-thumb-btn\b/);
    });

    it('does not read btn.dataset.fullSrc or btn.dataset.alt anywhere', () => {
      const ts = readTs();
      expect(ts).not.toMatch(/dataset\.fullSrc/);
      // dataset.alt is the deserialized form of data-alt on the thumb button.
      // The inner <img alt> is a real attribute, not a dataset read, so this
      // pattern is safe.
      expect(ts).not.toMatch(/dataset\.alt\b/);
    });

    it('keeps the broken-image fallback that swaps a failed .cs-thumb for .cs-no-image', () => {
      // The fallback stays. It is unrelated to the lightbox and is still
      // useful. Pin it explicitly so the cleanup can't accidentally drop it.
      // The fallback's closest() lookup must use the new class name.
      const ts = readTs();
      expect(ts).toMatch(/\.cs-thumb\b/);
      expect(ts).toMatch(/cs-no-image/);
      expect(ts).toMatch(/addEventListener\(\s*['"]error['"]/);
      expect(ts).toMatch(/closest\(\s*['"]\.cs-listing-image-btn['"]\s*\)/);
    });
  });

  describe('theme/theme.css', () => {
    it('does not define any --cs-lightbox-* tokens', () => {
      // The consumer's scaffolded theme.css is a verbatim copy of this file
      // (see bin/init.mjs). Orphan tokens here would mislead consumers into
      // thinking the lightbox still exists.
      expect(readTheme()).not.toMatch(/--cs-lightbox-/);
    });
  });
});
