import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * When qty === 1, the next decrement would remove the item from the cart.
 * The down button swaps from "-" to "×" to signal this, avoiding the need
 * for a separate remove button. The text and aria-label both update so the
 * affordance is clear to sighted and assistive-technology users alike.
 *
 * updateTableRow already runs on every qty change and on cart hydration, so
 * no additional wiring is needed — the button state is always current.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const cartControlAstro = join(REPO_ROOT, 'src', 'components', 'CartControl', 'CartControl.astro');
const listingsTs = join(REPO_ROOT, 'src', 'components', 'Listings', 'listings.ts');

const readAstro = (): string => readFileSync(cartControlAstro, 'utf8');
const readSrc = (): string => readFileSync(listingsTs, 'utf8');

describe('CartControl.astro — exposes data-name for JS-driven aria-label updates', () => {
  it('publishes data-name on the .cs-cart-control root element', () => {
    /*
     * updateTableRow needs the product name to write a meaningful
     * aria-label ("Remove NAME from cart" vs "Decrease quantity of NAME").
     * data-sku and data-moq are already on the root; data-name follows the
     * same pattern.
     */
    expect(readAstro()).toMatch(/data-name=\{name\}/);
  });
});

describe('listings.ts — down button swaps to × at qty 1', () => {
  it('queries .cs-cart-control-down inside updateTableRow', () => {
    expect(readSrc()).toMatch(/cs-cart-control-down/);
  });

  it('sets down button text to × when the next step would reach 0', () => {
    /*
     * The step is moq ?? 1, not always 1. qty === 1 is wrong when MOQ > 1
     * (e.g. MOQ=5, qty=5: next step = 0, should show ×). The condition
     * must use nextQuantity('down', qty, moq) === 0 so it stays correct
     * for any step size.
     */
    expect(readSrc()).toMatch(/nextQuantity\s*\(\s*['"]down['"]/);
  });

  it('sets down button text to × (the glyph) for the remove state', () => {
    expect(readSrc()).toMatch(/×/);
  });

  it('restores - when the next step would not reach 0', () => {
    expect(readSrc()).toMatch(/['"]-['"]/);
  });

  it('updates aria-label to reflect the remove intent at qty 1', () => {
    expect(readSrc()).toMatch(/Remove.*from cart/);
  });

  it('updates aria-label to reflect decrease intent when qty > 1', () => {
    expect(readSrc()).toMatch(/Decrease quantity/);
  });
});
