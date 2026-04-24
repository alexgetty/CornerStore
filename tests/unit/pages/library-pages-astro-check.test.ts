import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The library's own src/pages/*.astro are dev-only (not in the package `files` field)
// but must pass `astro check` so the repo's CI stays clean. These assertions mirror
// the scaffold-side pins in tests/unit/bin/init.test.ts so library pages stay in
// sync with the fixes made in commit 3bbd12d.

const pagesDir = join(process.cwd(), 'src', 'pages');

const readPage = (relative: string): string =>
  readFileSync(join(pagesDir, relative), 'utf8');

describe('library src/pages/index.astro — astro check safety', () => {
  it('types import.meta.glob so mod.default is not `unknown`', () => {
    const out = readPage('index.astro');
    expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
  });

  it('guards the homeModule lookup before invoking it', () => {
    const out = readPage('index.astro');
    expect(out).toMatch(/if\s*\(\s*homeModule\s*\)/);
  });
});

describe('library src/pages/[slug].astro — astro check safety', () => {
  it('types import.meta.glob so mod.default is not `unknown`', () => {
    const out = readPage('[slug].astro');
    expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
  });

  it('guards the loader lookup before invoking it', () => {
    const out = readPage('[slug].astro');
    expect(out).toMatch(/const\s+loader\s*=\s*mdxModules\[/);
    expect(out).toMatch(/if\s*\(\s*loader\s*\)/);
  });

  it('does NOT directly call mdxModules[...]() without a guard (runtime + TS unsafe)', () => {
    const out = readPage('[slug].astro');
    expect(out).not.toMatch(/await\s+mdxModules\[[^\]]+\]\(\)/);
  });
});

describe('library src/pages/category/[slug].astro — astro check safety', () => {
  it('types import.meta.glob so mod.default is not `unknown`', () => {
    const out = readPage('category/[slug].astro');
    expect(out).toMatch(/import\.meta\.glob<\{\s*default:\s*any\s*\}>\(/);
  });

  it('guards the MDX branch against undefined page in JSX (narrows before use)', () => {
    const out = readPage('category/[slug].astro');
    expect(out).toMatch(/isMdx\s*&&\s*Content\s*&&\s*page\s*\?/);
  });

  it('provides a non-undefined string for the fallback ContentPage title', () => {
    const out = readPage('category/[slug].astro');
    expect(out).not.toMatch(/<ContentPage\s+title=\{\s*categoryName\s*\}/);
  });

  it('provides a string[] (never (string | undefined)[]) for Listings.categories', () => {
    const out = readPage('category/[slug].astro');
    expect(out).not.toMatch(/<Listings\s+categories=\{\s*\[\s*categoryName\s*\]\s*\}/);
  });

  it('does not declare an unused `config` local (ts6133)', () => {
    const out = readPage('category/[slug].astro');
    // Library page's getStaticPaths previously imported and called loadConfig
    // without using the result. Drop both the import and the call.
    expect(out).not.toMatch(/\bloadConfig\b/);
  });
});

describe('library src/pages/cart.astro — scaffold-parity import shape', () => {
  // The scaffolded consumer cart page imports Cart via the package entrypoint
  // (`corner-store/components`) and aliases it to CartPage to avoid the auto-
  // generated-const collision. The library's own cart page must mirror that
  // shape so library edits cannot drift from the scaffolded pattern.
  it('imports Cart as CartPage from corner-store/components', () => {
    const out = readPage('cart.astro');
    expect(out).toContain(
      "import { Cart as CartPage } from 'corner-store/components';",
    );
  });

  it('does not use the legacy relative Cart import', () => {
    const out = readPage('cart.astro');
    expect(out).not.toContain(
      "import CartPage from '../components/Cart/Cart.astro';",
    );
  });
});
