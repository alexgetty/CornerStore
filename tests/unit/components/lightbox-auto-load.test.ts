import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Lightbox auto-load wiring.
 *
 * Goal: consumers of the listings package get the lightbox for free, with
 * zero extra script imports. The script is side-effect-only and registers a
 * single delegated click handler on document for `.cs-listing-image-btn`.
 *
 * The trigger primitive (<button class="cs-listing-image-btn" data-images>)
 * is emitted in two places:
 *
 *   - ListingCards.astro       — emits the trigger directly for the card view.
 *   - ListingRow.astro         — emits the trigger for the table view AND the
 *                                cart view (Cart.astro composes ListingRow,
 *                                ListingTable.astro composes ListingRow).
 *
 * So the script import goes in those two files. Astro's bundler dedupes
 * script imports across components on the same page, so the table page (cards
 * + table) and the cart page (cart) both end up with exactly one copy. We do
 * NOT add the import to ListingTable.astro or Cart.astro — they get coverage
 * transitively through ListingRow.
 *
 * Tests assert on source (regex on .astro), matching the project's
 * source-contract test convention.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');

const listingCardsPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingCards.astro',
);

const listingRowPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Listings',
  'ListingRow.astro',
);

const readCards = (): string => readFileSync(listingCardsPath, 'utf8');
const readRow = (): string => readFileSync(listingRowPath, 'utf8');

/*
 * Pull the body of every <script>...</script> block out of an Astro file.
 * Astro supports multiple <script> blocks per component; we concatenate so an
 * assertion against "the script imports" is independent of how the file is
 * split into blocks.
 */
function extractScriptBlocks(source: string): string {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  while ((match = re.exec(source)) !== null) {
    parts.push(match[1]!);
  }
  return parts.join('\n');
}

describe('Lightbox auto-load', () => {
  it('ListingCards.astro imports ../Lightbox/lightbox.ts inside a <script> block', () => {
    const scripts = extractScriptBlocks(readCards());
    expect(scripts).toMatch(/import\s+["']\.\.\/Lightbox\/lightbox\.ts["']/);
  });

  it('ListingRow.astro imports ../Lightbox/lightbox.ts inside a <script> block', () => {
    const scripts = extractScriptBlocks(readRow());
    expect(scripts).toMatch(/import\s+["']\.\.\/Lightbox\/lightbox\.ts["']/);
  });
});
