import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * lightbox.ts source-contract test.
 *
 * The lightbox script is heavily DOM-coupled and excluded from coverage (see
 * vitest.config.ts). To make sure the script's structural contract can't drift unnoticed, we
 * pin its key shapes at the source level: idempotency guard, delegated click
 * handler, JSON parse with try/catch + array validation, keyboard switch,
 * and lazy overlay construction (overlay is built on first trigger click,
 * NOT in init()).
 *
 * Source-contract style (regex on the .ts file). Matches cart-component-markup
 * and the listing-table source tests.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const lightboxTsPath = join(
  REPO_ROOT,
  'src',
  'components',
  'Lightbox',
  'lightbox.ts',
);

const readScript = (): string => readFileSync(lightboxTsPath, 'utf8');

describe('lightbox.ts', () => {
  it('exists at src/components/Lightbox/lightbox.ts', () => {
    expect(existsSync(lightboxTsPath)).toBe(true);
  });

  describe('idempotency', () => {
    it('guards re-execution with window.__csLightboxInit', () => {
      // HMR and accidental double imports must not register the click handler
      // twice. The flag lives on window so it survives across module copies.
      expect(readScript()).toMatch(/window\.__csLightboxInit\b/);
    });
  });

  describe('delegated click handler', () => {
    it('registers a click listener on document', () => {
      expect(readScript()).toMatch(/document\.addEventListener\(\s*['"]click['"]/);
    });

    it('matches .cs-listing-image-btn via closest()', () => {
      // Trigger primitive class is package-owned. Pin the selector so a rename
      // can't silently break the wiring. Allows an optional TS type parameter
      // (e.g. closest<HTMLElement>('...')).
      expect(readScript()).toMatch(
        /closest(?:<[^>]+>)?\(\s*['"]\.cs-listing-image-btn['"]\s*\)/,
      );
    });
  });

  describe('data-images parsing', () => {
    it('wraps JSON.parse in try/catch', () => {
      const ts = readScript();
      // try { JSON.parse(...) } catch { ... } pattern. Defensive against
      // malformed JSON in data-images so a bad row never throws and breaks
      // the rest of the page.
      expect(ts).toMatch(/try\s*\{[\s\S]*?JSON\.parse\(/);
      expect(ts).toMatch(/JSON\.parse\([\s\S]*?\}\s*catch\b/);
    });

    it('validates the parsed value with Array.isArray', () => {
      // JSON.parse can return any JSON-typed value. Without isArray, a parsed
      // object or string would be passed downstream and crash.
      expect(readScript()).toMatch(/Array\.isArray\(/);
    });
  });

  describe('keyboard handling', () => {
    it('handles Escape, ArrowLeft, ArrowRight, and Tab', () => {
      const ts = readScript();
      // A switch (or branching block) inside the keydown handler. Each key is
      // explicitly cased so behavior is auditable.
      expect(ts).toMatch(/case\s+['"]Escape['"]/);
      expect(ts).toMatch(/case\s+['"]ArrowLeft['"]/);
      expect(ts).toMatch(/case\s+['"]ArrowRight['"]/);
      expect(ts).toMatch(/case\s+['"]Tab['"]/);
    });
  });

  describe('lazy overlay construction', () => {
    /*
     * The reference implementation built the overlay at init(). We moved
     * construction into the click handler so the overlay DOM exists only
     * after the user has actually clicked an image. Pin the lazy contract
     * so a regression to eager construction is caught at the source level.
     *
     * Implementation detail: init() body must not call buildOverlay(). The
     * call moves into onTriggerClick() (the click handler).
     */
    function extractInitBody(ts: string): string {
      // Tolerate a TS return-type annotation between the parameter list and
      // the opening brace (e.g. `function init(): void {`).
      const match = /function\s+init\s*\([^)]*\)\s*(?::\s*[A-Za-z_$][\w$]*\s*)?\{/.exec(ts);
      if (!match) throw new Error('expected a function init() definition');
      let i = match.index + match[0].length;
      const start = i;
      let depth = 1;
      while (i < ts.length && depth > 0) {
        const c = ts[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        if (depth === 0) return ts.slice(start, i);
        i++;
      }
      throw new Error('unterminated init() body');
    }

    it('init() body does not call buildOverlay() (lazy build pattern)', () => {
      const initBody = extractInitBody(readScript());
      expect(initBody).not.toMatch(/buildOverlay\s*\(/);
    });

    it('init() registers the document click listener', () => {
      // The one thing init() does is wire up the delegated click handler.
      const initBody = extractInitBody(readScript());
      expect(initBody).toMatch(/document\.addEventListener\(\s*['"]click['"]/);
    });
  });
});
