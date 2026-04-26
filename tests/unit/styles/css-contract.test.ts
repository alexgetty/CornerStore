import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * CSS Contract Tests
 *
 * Enforces the package CSS architecture:
 *   1. Every var(--cs-*) reference in package CSS includes a fallback to a
 *      structurally-neutral value. The package never silently breaks when a
 *      consumer omits a token from their theme.
 *   2. Package CSS contains no hex/rgb/hsl color literals outside palette.css.
 *      Colors live in tokens; tokens are theme-overridable.
 *   3. Bare-element selectors (h1, p, main h1, etc.) live in the theme, not
 *      the package. The package owns .cs-* classes and the page-level
 *      semantic zones (body/header/main/footer) for structural rules only.
 *   4. No hardcoded aesthetic values in package CSS. Sizes, weights, gaps,
 *      paddings, radii, shadows, transition durations, and opacities flow
 *      through tokens. Package CSS gets structurally-neutral fallbacks at
 *      the rule site; the theme owns the values.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const PACKAGE_CSS_DIRS = [
  join(REPO_ROOT, 'src', 'styles'),
  join(REPO_ROOT, 'src', 'components'),
  join(REPO_ROOT, 'src', 'layouts'),
];

// reset.css is a structural CSS reset; bare element selectors there ARE the
// contract. palette.css is a token-defaults file; hex literals are the data.
// defaults.css carries the structural a11y utilities (sr-only, skip-link)
// and the page-level padding math. Its specific numeric values (1px / -1px
// for sr-only, 100vh for min-height, the token-fallback math expressions)
// are structural invariants, not aesthetic opinion.
const RESET_FILE = join(REPO_ROOT, 'src', 'styles', 'reset.css');
const PALETTE_FILE = join(REPO_ROOT, 'src', 'styles', 'palette.css');
const DEFAULTS_FILE = join(REPO_ROOT, 'src', 'styles', 'defaults.css');
// Scale presets define typography tokens via internal --cs-text-base
// indirection so consumers can rescale the system with a single override.
// Their bare var(--cs-text-base) references are an authoring-time
// relationship, not a consumer-facing contract that needs a fallback —
// peer to palette.css, which is exempted from the color-literal contract
// because color literals are ITS data.
const SCALES_DIR = join(REPO_ROOT, 'src', 'styles', 'scales');

// Page-level semantic zones are stable contracts per docs/principles.md and
// MAY be selected directly in package CSS for structural rules (layout
// scaffolding, padding math). Typography/color opinion still must not live
// here, which the no-color-literals + fallback rules enforce.
const STABLE_ZONE_SELECTORS = new Set(['body', 'header', 'main', 'footer', 'html']);

function walkCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkCssFiles(full));
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

function allPackageCssFiles(): string[] {
  return PACKAGE_CSS_DIRS.flatMap(walkCssFiles);
}

// Strip CSS block comments so regex matches do not fire on commentary.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('CSS contract: var(--cs-*) fallbacks', () => {
  // A reference is "bare" if there is no comma after the token name inside
  // the same var() call.
  const BARE_VAR_RE = /var\(\s*--cs-[a-z0-9-]+\s*\)/g;

  for (const file of allPackageCssFiles()) {
    if (file.startsWith(SCALES_DIR)) continue;
    const rel = relative(REPO_ROOT, file);
    it(`${rel} has no bare var(--cs-*) references`, () => {
      const css = stripComments(readFileSync(file, 'utf8'));
      const matches = css.match(BARE_VAR_RE) ?? [];
      expect(matches, `bare var() references in ${rel}: ${matches.join(', ')}`).toEqual([]);
    });
  }
});

describe('CSS contract: no color literals outside palette.css', () => {
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
  const FUNC_RE = /\b(?:rgb|rgba|hsl|hsla)\s*\(/g;

  for (const file of allPackageCssFiles()) {
    if (file === PALETTE_FILE) continue;
    const rel = relative(REPO_ROOT, file);
    it(`${rel} contains no color literals`, () => {
      const css = stripComments(readFileSync(file, 'utf8'));
      const hex = css.match(HEX_RE) ?? [];
      const fn = css.match(FUNC_RE) ?? [];
      expect(hex, `hex literals in ${rel}: ${hex.join(', ')}`).toEqual([]);
      expect(fn, `color functions in ${rel}: ${fn.join(', ')}`).toEqual([]);
    });
  }
});

describe('CSS contract: no bare-element selectors in package', () => {
  // Package CSS owns .cs-* classes and may select page-level semantic
  // zones (body/header/main/footer/html) for STRUCTURAL rules only.
  // Anything else is a bare-element selector and belongs in theme.
  //
  // A descendant chain anchored at a stable zone may NOT contain bare
  // typography elements (e.g., "main h1", "main > p") because those leak
  // styling into consumer-authored content. Descendants must be class /
  // attribute / pseudo-based.
  //
  // reset.css and palette.css are exempt.

  const ALLOWED_BARE_HEAD = new Set(['*', ...STABLE_ZONE_SELECTORS]);

  function selectorIsAllowed(selector: string): { ok: boolean; reason?: string } {
    const trimmed = selector.trim();
    if (!trimmed) return { ok: true };

    if (trimmed.startsWith('[') || trimmed.startsWith(':') || trimmed.startsWith('#')) {
      return { ok: true };
    }

    if (trimmed.startsWith('.')) {
      return { ok: true };
    }

    const tokens = trimmed
      .split(/[\s>+~]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return { ok: true };

    const first = tokens[0]!;
    const firstHead = first.split(/[:.[]/)[0] ?? first;

    if (first.startsWith('.') || first.startsWith('[') || first.startsWith(':') || first.startsWith('#')) {
      return { ok: true };
    }

    if (ALLOWED_BARE_HEAD.has(firstHead)) {
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i]!;
        const head = t.split(/[:.[]/)[0] ?? t;
        if (t.startsWith('.') || t.startsWith('[') || t.startsWith(':') || t.startsWith('#')) {
          continue;
        }
        if (head === '' || head === '*') continue;
        return { ok: false, reason: `bare descendant "${t}" of "${firstHead}"` };
      }
      return { ok: true };
    }

    return { ok: false, reason: `bare element "${firstHead}"` };
  }

  function extractSelectorsFromCss(css: string): string[] {
    let stripped = stripComments(css);
    // Strip at-rule headers by replacing "@<name> ... {" with just "{".
    // Block at-rules (@media, @supports, @layer, @keyframes, etc.) can
    // contain nested rules; we want to inspect those nested rules as
    // selectors but ignore the at-rule preamble.
    stripped = stripped.replace(/@[a-zA-Z-]+[^{;]*\{/g, '{');
    // Strip standalone at-statements (e.g. "@layer package, theme;").
    stripped = stripped.replace(/@[a-zA-Z-]+[^;{}]*;/g, '');

    const selectors: string[] = [];
    const ruleRe = /([^{}]+?)\{/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(stripped)) !== null) {
      const head = match[1]!.trim();
      if (!head) continue;
      for (const sel of head.split(',')) {
        const t = sel.trim();
        if (t) selectors.push(t);
      }
    }
    return selectors;
  }

  for (const file of allPackageCssFiles()) {
    if (file === RESET_FILE) continue;
    if (file === PALETTE_FILE) continue;
    const rel = relative(REPO_ROOT, file);
    it(`${rel} contains no bare-element selectors`, () => {
      const css = readFileSync(file, 'utf8');
      const selectors = extractSelectorsFromCss(css);
      const violations = selectors
        .map(sel => ({ sel, check: selectorIsAllowed(sel) }))
        .filter(({ check }) => !check.ok);
      expect(
        violations,
        `bare-element selectors in ${rel}:\n` +
          violations.map(v => `  "${v.sel}" (${v.check.reason})`).join('\n'),
      ).toEqual([]);
    });
  }
});

describe('CSS contract: no hardcoded aesthetic values in package', () => {
  /*
   * Package CSS = structural framework + token references. Aesthetic values
   * (sizes, weights, paddings, radii, shadows, durations, opacities) must
   * flow through `var(--cs-*, <neutral>)` references. The theme owns the
   * concrete values.
   *
   * Structural exempt values: 0, 1, auto, none, inherit, currentColor,
   * transparent, unset, revert, initial, normal. Anything inside a var()
   * call (including nested fallbacks) is fine. Property keywords like
   * solid/dashed/baseline/etc. are fine.
   *
   * For the listed shorthand and longhand properties, a numeric value with
   * or without unit (e.g. `1px`, `0.5rem`, `700`, `0.4`) that appears at
   * the value's top level (outside any var() call) is a violation.
   *
   * reset.css is exempt: it owns the structural reset and the
   * reduced-motion safety value (0.01ms) is a deliberate accessibility
   * invariant, not theme territory.
   */

  // Aesthetic properties that carry a single numeric/length value.
  const AESTHETIC_LONGHAND = new Set([
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-width',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'box-shadow',
    'text-shadow',
    'transition-duration',
    'transition-delay',
    'transition-timing-function',
    'opacity',
    'aspect-ratio',
    'max-width',
    'min-width',
    'width',
    'max-height',
    'min-height',
    'height',
    'outline-width',
    'outline-offset',
    'text-decoration-thickness',
    'text-underline-offset',
  ]);

  // Shorthand properties that may carry an aesthetic numeric width / radius
  // somewhere in the value list. Same rule: top-level numerics not exactly
  // 0/1 are violations.
  const AESTHETIC_SHORTHAND = new Set([
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'transition',
  ]);

  // Property/value combinations the contract permits in the package even
  // though the literal value would otherwise count as aesthetic. These are
  // structural invariants, not visual opinion.
  const STRUCTURAL_ALLOWLIST: Array<{ property: string; value: string; reason: string }> = [
    {
      // Reduced-motion override in reset.css. Deliberate accessibility
      // invariant ensuring animations effectively skip even if a theme
      // defines a long duration.
      property: 'animation-duration',
      value: '0.01ms',
      reason: 'a11y reduced-motion invariant',
    },
    {
      property: 'transition-duration',
      value: '0.01ms',
      reason: 'a11y reduced-motion invariant',
    },
  ];

  // Tokens that resolve to structural neutrals when the theme is absent.
  // Bare numeric values exactly equal to one of these are allowed.
  // 100% / 100vh / 100vw cover the "fill the parent / fill the viewport"
  // structural sizing intent (per the phase 2 spec: max-width: 100% / width:
  // 100% / min-height: 100vh are structural, not aesthetic).
  const NEUTRAL_NUMERICS = new Set(['0', '1', '100%', '100vh', '100vw']);
  const NEUTRAL_KEYWORDS = new Set([
    'auto',
    'none',
    'inherit',
    'currentcolor',
    'transparent',
    'unset',
    'revert',
    'initial',
    'normal',
  ]);

  // Recognises a CSS numeric value (with optional sign, decimal, exponent,
  // unit, percent). Excludes the bare token "0" and "1" (handled separately).
  // Excludes 0/1 followed by a unit (those are 0.5rem-style values).
  const NUMERIC_RE = /^[+-]?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?(?:%|[a-zA-Z]+)?$/;

  // Function-call names that are structural composition primitives. Their
  // arguments are theme tokens (via var()) plus the math/positioning logic
  // around them. We treat the entire call as a black box for the aesthetic
  // check: any aesthetic numeric inside should already be a var() fallback.
  const STRIPPABLE_CALLS = ['var', 'calc', 'max', 'min', 'clamp', 'env', 'minmax'];

  function stripCalls(value: string): string {
    // Replace each balanced strippable call with a placeholder. Walk the
    // string finding any of the call names followed by `(`, then skip past
    // the balanced close-paren accounting for nesting. Calls inside other
    // calls collapse together because the outer call eats them.
    let out = '';
    let i = 0;
    while (i < value.length) {
      let matched = false;
      for (const name of STRIPPABLE_CALLS) {
        const head = name + '(';
        const slice = value.slice(i, i + head.length).toLowerCase();
        if (slice !== head) continue;
        // Confirm the character before is not part of an identifier (so we
        // don't accidentally match "envelope(" if such a thing existed).
        const prev = i === 0 ? '' : value[i - 1]!;
        if (/[A-Za-z0-9_-]/.test(prev)) continue;
        let depth = 1;
        let j = i + head.length;
        while (j < value.length && depth > 0) {
          const c = value[j];
          if (c === '(') depth++;
          else if (c === ')') depth--;
          j++;
        }
        out += ' CALL ';
        i = j;
        matched = true;
        break;
      }
      if (!matched) {
        out += value[i];
        i++;
      }
    }
    return out;
  }

  function tokenize(value: string): string[] {
    // After var() removal, split on whitespace and the comma separator used
    // by some shorthand multi-value lists. Drop empties.
    return value
      .split(/[\s,/]+/)
      .map(t => t.trim())
      .filter(Boolean);
  }

  type Violation = {
    file: string;
    line: number;
    property: string;
    value: string;
    offending: string;
  };

  function lineNumberOfIndex(text: string, idx: number): number {
    let line = 1;
    for (let i = 0; i < idx && i < text.length; i++) {
      if (text[i] === '\n') line++;
    }
    return line;
  }

  function findViolations(file: string): Violation[] {
    const rel = relative(REPO_ROOT, file);
    const raw = readFileSync(file, 'utf8');
    const stripped = stripComments(raw);

    const violations: Violation[] = [];
    // Match `property: value;` declarations at any nesting depth. The value
    // may contain parentheses (var() calls). We capture greedily up to the
    // next semicolon or close-brace at the same nesting level.
    const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]*(?:\([^)]*\)[^;{}]*)*);/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(stripped)) !== null) {
      const property = m[1]!.toLowerCase();
      const rawValue = m[2]!.trim();

      const isLonghand = AESTHETIC_LONGHAND.has(property);
      const isShorthand = AESTHETIC_SHORTHAND.has(property);
      if (!isLonghand && !isShorthand) continue;

      // The structural allowlist exempts specific property/value pairs.
      const allowlisted = STRUCTURAL_ALLOWLIST.some(
        entry => entry.property === property && rawValue === entry.value,
      );
      if (allowlisted) continue;

      const stripped2 = stripCalls(rawValue);
      const tokens = tokenize(stripped2);
      const offending: string[] = [];
      for (const tok of tokens) {
        const lower = tok.toLowerCase();
        if (lower === 'var') continue; // placeholder from stripVarCalls
        if (NEUTRAL_NUMERICS.has(tok)) continue;
        if (NEUTRAL_KEYWORDS.has(lower)) continue;
        // Color literals are caught by the no-color-literals test; ignore here.
        if (tok.startsWith('#')) continue;
        if (NUMERIC_RE.test(tok)) {
          offending.push(tok);
        }
      }

      if (offending.length > 0) {
        const line = lineNumberOfIndex(stripped, m.index);
        violations.push({
          file: rel,
          line,
          property,
          value: rawValue,
          offending: offending.join(', '),
        });
      }
    }

    return violations;
  }

  for (const file of allPackageCssFiles()) {
    if (file === RESET_FILE) continue;
    if (file === PALETTE_FILE) continue;
    // defaults.css owns structural a11y utilities (cs-sr-only, cs-skip-link)
    // and the page-level padding math. Its 1px/-1px (sr-only clipping) and
    // 100vh (full-viewport scaffold) are structural invariants documented at
    // the top of the file; treating them as aesthetic violations would push
    // a11y semantics into the theme.
    if (file === DEFAULTS_FILE) continue;
    const rel = relative(REPO_ROOT, file);
    it(`${rel} contains no hardcoded aesthetic values`, () => {
      const violations = findViolations(file);
      const message =
        violations.length === 0
          ? ''
          : `hardcoded aesthetic values in ${rel}:\n` +
            violations
              .map(
                v =>
                  `  line ${v.line}: ${v.property}: ${v.value}  (offending: ${v.offending})`,
              )
              .join('\n');
      expect(violations, message).toEqual([]);
    });
  }
});
