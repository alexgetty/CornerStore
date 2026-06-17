import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Category page auto-generated template must pass `toggle` to <Listings>
 * so it inherits the site-wide `listings.views` config, matching the home
 * page behavior.
 */

const categoryPagePath = join(
  process.cwd(),
  'src',
  'pages',
  'category',
  '[slug].astro',
);

const readSrc = (): string => readFileSync(categoryPagePath, 'utf8');

describe('category [slug].astro — auto-generated template passes toggle to Listings', () => {
  it('includes a <Listings toggle ... /> in the non-MDX (auto-generated) branch', () => {
    const src = readSrc();
    // The auto-generated branch is the else branch (isMdx is false).
    // It must pass the `toggle` boolean prop so the view switcher appears
    // when listings.views has 2+ entries in site config.
    expect(src).toMatch(/<Listings\s[^>]*\btoggle\b[^>]*categories=/);
  });
});
