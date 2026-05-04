import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Lightbox.css source-contract test.
 *
 * Pins the package layer wrapper, the structural rules the script depends on,
 * and the token surface (--cs-lightbox-backdrop, --cs-lightbox-control-size,
 * --cs-lightbox-control-icon-size). Tokens are referenced at use sites with
 * var(..., fallback) so consumers don't have to declare anything; matches the
 * convention in defaults.css.
 *
 * Source-contract style (regex on the .css file), matching cart-component-markup
 * and the listing-table CSS tests.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const lightboxCssPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Lightbox',
  'Lightbox.css',
);

const readCss = (): string => readFileSync(lightboxCssPath, 'utf8');

/*
 * Extract the body of the first rule whose selector matches `selectorRe`
 * (everything between its opening brace and matching closing brace). Brace
 * matching ignores nesting depth so this works inside @layer { ... }.
 */
function extractRuleBody(css: string, selectorRe: RegExp): string {
  const match = selectorRe.exec(css);
  if (!match) {
    throw new Error(`expected a rule matching ${selectorRe} in Lightbox.css`);
  }
  // selectorRe must include the trailing `{` in its pattern. Body starts
  // immediately after the matched region.
  let i = match.index + match[0].length;
  const start = i;
  let depth = 1;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) return css.slice(start, i);
    i++;
  }
  throw new Error(`unterminated rule body for ${selectorRe}`);
}

describe('Lightbox.css', () => {
  it('exists at src/components/Lightbox/Lightbox.css', () => {
    expect(existsSync(lightboxCssPath)).toBe(true);
  });

  it('wraps rules in @layer package { ... }', () => {
    expect(readCss()).toMatch(/@layer\s+package\s*\{/);
  });

  describe('.cs-lightbox container', () => {
    it('declares position: fixed', () => {
      const body = extractRuleBody(readCss(), /\.cs-lightbox\s*\{/);
      expect(body).toMatch(/position:\s*fixed\b/);
    });

    it('references --cs-lightbox-backdrop with a palette-backed fallback', () => {
      /*
       * The original spec called for an rgba(0, 0, 0, 0.85) literal as the
       * fallback. The package's CSS contract test (tests/unit/styles/
       * css-contract.test.ts) bans bare rgba()/hex literals outside
       * palette.css — even inside var() fallbacks — because the regex is a
       * straight string match. Resolution: the package default for the
       * backdrop is the palette token --cs-black with `black` as the
       * keyword fallback. Themes can override --cs-lightbox-backdrop to
       * add transparency or any other color; the package itself never
       * embeds a color literal.
       */
      const body = extractRuleBody(readCss(), /\.cs-lightbox\s*\{/);
      expect(body).toMatch(/var\(--cs-lightbox-backdrop\b/);
      expect(body).toMatch(/var\(--cs-lightbox-backdrop,\s*var\(--cs-black,\s*black\)\)/);
    });
  });

  describe('.cs-lightbox-image', () => {
    it('caps the image at the viewport without upscaling', () => {
      const body = extractRuleBody(readCss(), /\.cs-lightbox-image\s*\{/);
      expect(body).toMatch(/max-width:\s*100vw\b/);
      expect(body).toMatch(/max-height:\s*100vh\b/);
      expect(body).toMatch(/width:\s*auto\b/);
      expect(body).toMatch(/height:\s*auto\b/);
    });
  });

  describe('control buttons (close / prev / next)', () => {
    it('reference --cs-lightbox-control-size with a 3rem fallback', () => {
      expect(readCss()).toMatch(/var\(--cs-lightbox-control-size,\s*3rem\)/);
    });

    it('reference --cs-lightbox-control-icon-size with a 1.25rem fallback for inner SVGs', () => {
      expect(readCss()).toMatch(/var\(--cs-lightbox-control-icon-size,\s*1\.25rem\)/);
    });
  });

  describe('single-image mode', () => {
    /*
     * .cs-lightbox[data-single="true"] hides the prev/next/dots surfaces
     * via display: none. Belt-and-braces: the focus trap relies on
     * display: none to make these elements non-focusable, so the rule is
     * load-bearing for keyboard behavior, not just visuals.
     */
    function findSingleHideRules(css: string): string {
      const re = /\.cs-lightbox\[data-single[^\]]*\][^{]*\{([\s\S]*?)\}/g;
      let match: RegExpExecArray | null;
      const bodies: string[] = [];
      while ((match = re.exec(css)) !== null) bodies.push(match[1]!);
      return bodies.join('\n');
    }

    it('declares a .cs-lightbox[data-single="true"] selector', () => {
      expect(readCss()).toMatch(/\.cs-lightbox\[data-single="true"\]/);
    });

    it('hides .cs-lightbox-prev, .cs-lightbox-next, and .cs-lightbox-dots via display: none', () => {
      const css = readCss();
      expect(css).toMatch(/\.cs-lightbox-prev/);
      expect(css).toMatch(/\.cs-lightbox-next/);
      expect(css).toMatch(/\.cs-lightbox-dots/);
      const bodies = findSingleHideRules(css);
      expect(bodies).toMatch(/display:\s*none\b/);
    });
  });

  describe('scroll lock', () => {
    it('locks .cs-page-scroll under body.cs-lightbox-open via overflow: hidden', () => {
      const body = extractRuleBody(
        readCss(),
        /body\.cs-lightbox-open\s+\.cs-page-scroll\s*\{/,
      );
      expect(body).toMatch(/overflow:\s*hidden\b/);
    });
  });
});
