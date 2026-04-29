import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Hero.astro markup contract.
 *
 * The Hero is a top-of-page banner: a background image plus a content slot
 * for markdown-authored copy. The package owns the structural primitive only
 * (image + slot, sensible defaults). All visual identity (gradients,
 * typography, sizing) is theme work.
 *
 * Tests assert on the source .astro file because we don't SSR Astro
 * components in unit tests (same approach as cart-component-markup.test.ts).
 * Selector and structural pins on the source are sufficient: if the markup
 * diverges, any consumer styling that targets these classes would break the
 * same way.
 */

const heroAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Hero',
  'Hero.astro',
);

const heroCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Hero',
  'Hero.css',
);

const componentsIndexPath = join(
  process.cwd(),
  'src',
  'components',
  'index.ts',
);

const indexPagePath = join(
  process.cwd(),
  'src',
  'pages',
  'index.astro',
);

const slugPagePath = join(
  process.cwd(),
  'src',
  'pages',
  '[slug].astro',
);

const scaffoldPath = join(
  process.cwd(),
  'bin',
  'scaffold.mjs',
);

const readHero = (): string => readFileSync(heroAstroPath, 'utf8');
const readHeroCss = (): string => readFileSync(heroCssPath, 'utf8');
const readBarrel = (): string => readFileSync(componentsIndexPath, 'utf8');
const readIndexPage = (): string => readFileSync(indexPagePath, 'utf8');
const readSlugPage = (): string => readFileSync(slugPagePath, 'utf8');
const readScaffold = (): string => readFileSync(scaffoldPath, 'utf8');

describe('Hero.astro — file exists', () => {
  it('lives at src/components/Hero/Hero.astro', () => {
    expect(existsSync(heroAstroPath)).toBe(true);
  });

  it('has a sibling Hero.css', () => {
    expect(existsSync(heroCssPath)).toBe(true);
  });
});

describe('Hero.astro — props contract', () => {
  it('declares a Props interface with required image: string', () => {
    const out = readHero();
    expect(out).toMatch(/interface\s+Props\s*\{[\s\S]*?image:\s*string;[\s\S]*?\}/);
  });

  it('declares optional imageAlt?: string on Props', () => {
    const out = readHero();
    expect(out).toMatch(/interface\s+Props\s*\{[\s\S]*?imageAlt\?:\s*string;[\s\S]*?\}/);
  });

  it('destructures Astro.props with imageAlt defaulting to ""', () => {
    const out = readHero();
    // Allow either single or double quotes for the empty default.
    expect(out).toMatch(/const\s*\{\s*image\s*,\s*imageAlt\s*=\s*(""|'')\s*\}\s*=\s*Astro\.props/);
  });
});

describe('Hero.astro — markup contract', () => {
  it('imports its CSS sibling', () => {
    const out = readHero();
    expect(out).toMatch(/import\s+["']\.\/Hero\.css["']/);
  });

  it('renders a <section class="cs-hero"> root', () => {
    const out = readHero();
    expect(out).toMatch(/<section\s+class="cs-hero">/);
    expect(out).toMatch(/<\/section>/);
  });

  it('renders an <img class="cs-hero-image"> bound to the image prop', () => {
    const out = readHero();
    // src must reference {image} — not a hardcoded value.
    expect(out).toMatch(/<img[^>]*\bclass="cs-hero-image"[^>]*\bsrc=\{image\}/);
  });

  it('passes imageAlt through to the image alt attribute', () => {
    const out = readHero();
    expect(out).toMatch(/<img[^>]*\balt=\{imageAlt\}/);
  });

  it('marks the image as eager + high fetchpriority (LCP optimization)', () => {
    const out = readHero();
    // Hero image is above the fold — must NOT lazy-load.
    expect(out).toMatch(/<img[^>]*\bloading="eager"/);
    expect(out).toMatch(/<img[^>]*\bfetchpriority="high"/);
  });

  it('renders a <div class="cs-hero-content"> wrapping a <slot />', () => {
    const out = readHero();
    const contentMatch = out.match(/<div\s+class="cs-hero-content">[\s\S]*?<\/div>/);
    expect(contentMatch, 'expected .cs-hero-content wrapper').not.toBeNull();
    expect(contentMatch![0]).toMatch(/<slot\s*\/>/);
  });

  it('places .cs-hero-content inside the <section class="cs-hero">', () => {
    const out = readHero();
    const sectionMatch = out.match(/<section\s+class="cs-hero">[\s\S]*?<\/section>/);
    expect(sectionMatch, 'expected .cs-hero section block').not.toBeNull();
    expect(sectionMatch![0]).toMatch(/<div\s+class="cs-hero-content">/);
    expect(sectionMatch![0]).toMatch(/class="cs-hero-image"/);
  });
});

describe('Hero.css — defaults', () => {
  it('wraps rules in @layer package (per package CSS architecture)', () => {
    const out = readHeroCss();
    expect(out).toMatch(/@layer\s+package\s*\{/);
  });

  it('declares positioning + flex defaults on .cs-hero', () => {
    const out = readHeroCss();
    // The image is positioned absolute behind the content; the section needs
    // to be a positioning context AND clip overflow.
    expect(out).toMatch(/\.cs-hero\s*\{[\s\S]*?position:\s*relative[\s\S]*?\}/);
    expect(out).toMatch(/\.cs-hero\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?\}/);
  });

  it('absolutely positions .cs-hero-image to fill the section', () => {
    const out = readHeroCss();
    expect(out).toMatch(/\.cs-hero-image\s*\{[\s\S]*?position:\s*absolute[\s\S]*?\}/);
    expect(out).toMatch(/\.cs-hero-image\s*\{[\s\S]*?object-fit:\s*cover[\s\S]*?\}/);
  });

  it('reuses --cs-main-width and --cs-main-padding tokens on .cs-hero-content', () => {
    const out = readHeroCss();
    // Don't invent new tokens — the spec is explicit about reusing these.
    expect(out).toMatch(/\.cs-hero-content\s*\{[\s\S]*?var\(--cs-main-width[\s\S]*?\}/);
    expect(out).toMatch(/\.cs-hero-content\s*\{[\s\S]*?var\(--cs-main-padding[\s\S]*?\}/);
  });

  it('stacks .cs-hero-content above the image via z-index', () => {
    const out = readHeroCss();
    expect(out).toMatch(/\.cs-hero-content\s*\{[\s\S]*?position:\s*relative[\s\S]*?\}/);
    expect(out).toMatch(/\.cs-hero-content\s*\{[\s\S]*?z-index:\s*1[\s\S]*?\}/);
  });
});

describe('components/index.ts — barrel export', () => {
  it('re-exports Hero from ./Hero/Hero.astro', () => {
    const out = readBarrel();
    expect(out).toMatch(
      /export\s*\{\s*default\s+as\s+Hero\s*\}\s*from\s*['"]\.\/Hero\/Hero\.astro['"]/,
    );
  });
});

describe('src/pages/index.astro — MDX components map', () => {
  it('imports Hero from corner-store/components', () => {
    const out = readIndexPage();
    expect(out).toMatch(
      /import\s*\{[^}]*\bHero\b[^}]*\}\s*from\s*['"]corner-store\/components['"]/,
    );
  });

  it('passes Hero into the MDX components prop', () => {
    const out = readIndexPage();
    expect(out).toMatch(/components=\{\{[^}]*\bHero\b[^}]*\}\}/);
  });
});

describe('src/pages/[slug].astro — MDX components map', () => {
  it('imports Hero from corner-store/components', () => {
    const out = readSlugPage();
    expect(out).toMatch(
      /import\s*\{[^}]*\bHero\b[^}]*\}\s*from\s*['"]corner-store\/components['"]/,
    );
  });

  it('passes Hero into the MDX components prop', () => {
    const out = readSlugPage();
    expect(out).toMatch(/components=\{\{[^}]*\bHero\b[^}]*\}\}/);
  });
});

describe('bin/scaffold.mjs — init parity for Hero', () => {
  it('buildIndexPage() emits a template that imports Hero alongside Listings/Listing', () => {
    const out = readScaffold();
    // Locate the buildIndexPage function and assert Hero shows up in the
    // emitted template's import list.
    const fnMatch = out.match(/export\s+function\s+buildIndexPage\s*\([\s\S]*?(?=\n\nexport\s+function\s|\n*$)/);
    expect(fnMatch, 'expected buildIndexPage function').not.toBeNull();
    expect(fnMatch![0]).toMatch(
      /import\s*\{[^}]*\bHero\b[^}]*\}\s*from\s*['"]corner-store\/components['"]/,
    );
  });

  it('buildIndexPage() emits a components map containing Hero', () => {
    const out = readScaffold();
    const fnMatch = out.match(/export\s+function\s+buildIndexPage\s*\([\s\S]*?(?=\n\nexport\s+function\s|\n*$)/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/components=\{\{[^}]*\bHero\b[^}]*\}\}/);
  });

  it('buildSlugPage() emits a template that imports Hero alongside Listings/Listing', () => {
    const out = readScaffold();
    const fnMatch = out.match(/export\s+function\s+buildSlugPage\s*\([\s\S]*?(?=\n\nexport\s+function\s|\n*$)/);
    expect(fnMatch, 'expected buildSlugPage function').not.toBeNull();
    expect(fnMatch![0]).toMatch(
      /import\s*\{[^}]*\bHero\b[^}]*\}\s*from\s*['"]corner-store\/components['"]/,
    );
  });

  it('buildSlugPage() emits a components map containing Hero', () => {
    const out = readScaffold();
    const fnMatch = out.match(/export\s+function\s+buildSlugPage\s*\([\s\S]*?(?=\n\nexport\s+function\s|\n*$)/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/components=\{\{[^}]*\bHero\b[^}]*\}\}/);
  });
});
