import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * listings.ts — remove button must not be surfaced by JS.
 *
 * The remove button has a permanent HTML `hidden` attribute. Qty-to-zero
 * is the removal UX (decrement or type 0). The JS must not un-hide the
 * button based on quantity, and must not wire a click handler that depends
 * on it being present.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const listingsTs = join(REPO_ROOT, 'src', 'components', 'Listings', 'listings.ts');
const readSrc = (): string => readFileSync(listingsTs, 'utf8');

describe('listings.ts — remove button is not managed by JS', () => {
  it('does not toggle removeBtn.hidden based on qty', () => {
    expect(readSrc()).not.toMatch(/removeBtn\.hidden\s*=/);
  });

  it('does not wire a .cs-remove-btn click handler', () => {
    expect(readSrc()).not.toMatch(/\.cs-remove-btn/);
  });

  it('updateTableRow does not require removeBtn to update the line total', () => {
    /*
     * The early-return guard must not include removeBtn. If it does, a
     * missing button would silently stop line-total updates from working.
     */
    expect(readSrc()).not.toMatch(/!removeBtn/);
  });
});
