import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Unified nav-item disclosure pattern.
 *
 * Every parent that has children renders the same DOM shape:
 *   <li class="cs-nav-item [cs-nav-has-children]">
 *     <div class="cs-nav-row">
 *       [label]
 *       [<button class="cs-nav-chevron">]?
 *     </div>
 *     [<ul class="cs-nav-dropdown-menu">]?
 *   </li>
 *
 * The label tag is the only thing that varies, and only because HTML
 * semantics force it: <a> for navigable, <button> for unlinked-with-children
 * (toggles the disclosure), <span> for the inert childless edge case.
 *
 * Chevron is ALWAYS a real <button class="cs-nav-chevron">. Never a
 * pseudo-element. The previous .cs-nav-dropdown-trigger::after chevron is
 * deleted entirely.
 *
 * Tests are source-level (regex on NavItem.astro, Nav.astro, Nav.css) -
 * same approach as cart-mobile-stack.test.ts.
 */

const navItemAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'NavItem.astro',
);

const navAstroPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'Nav.astro',
);

const navCssPath = join(
  process.cwd(),
  'src',
  'components',
  'Nav',
  'Nav.css',
);

const themePath = join(process.cwd(), 'theme', 'theme.css');

const readNavItem = (): string => readFileSync(navItemAstroPath, 'utf8');
const readAstro = (): string => readFileSync(navAstroPath, 'utf8');
const readCss = (): string => readFileSync(navCssPath, 'utf8');
const readTheme = (): string => readFileSync(themePath, 'utf8');

const MOBILE_BREAKPOINT_LITERAL = '40rem';

function extractMediaBlock(
  css: string,
  feature: 'max-width' | 'min-width' | 'prefers-reduced-motion',
  value: string,
): string {
  const escaped = value.replace(/\./g, '\\.');
  const re = new RegExp(
    `@media\\s*\\(\\s*${feature}:\\s*${escaped}\\s*\\)\\s*\\{`,
  );
  const match = css.match(re);
  if (!match || match.index === undefined) {
    throw new Error(
      `expected an @media (${feature}: ${value}) block in Nav.css`,
    );
  }
  let depth = 1;
  let i = match.index + match[0].length;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return css.slice(match.index, i);
}

describe('Nav.astro - hamburger toggle controls drawer visibility', () => {
  it('renders a <button class="cs-nav-toggle"> with aria-expanded="false" by default', () => {
    const out = readAstro();
    expect(out).toMatch(
      /<button[\s\S]*?\bclass="cs-nav-toggle"[\s\S]*?\baria-expanded="false"/,
    );
  });

  it('the toggle button carries aria-controls pointing to the nav id', () => {
    const out = readAstro();
    expect(out).toMatch(/<button[\s\S]*?\baria-controls="cs-nav-main"/);
    expect(out).toMatch(/<nav[\s\S]*?\bid="cs-nav-main"/);
  });

  it('the toggle button carries aria-label="Menu" as the accessible name', () => {
    const out = readAstro();
    expect(out).toMatch(/<button[\s\S]*?\baria-label="Menu"/);
  });

  it('the drawer is a <nav class="cs-nav-drawer"> sibling of the toggle inside .cs-header-actions', () => {
    const out = readAstro();
    // DOM order is drawer -> cart -> toggle; siblinghood is via the shared
    // .cs-header-actions parent rather than adjacency. Both elements must
    // exist; the dedicated DOM-order describe block locks in the order.
    expect(out).toMatch(/<nav[^>]*\bclass="cs-nav-drawer"/);
    expect(out).toMatch(/<button[\s\S]*?\bclass="cs-nav-toggle"/);
  });
});

describe('Nav.astro - .cs-header-actions DOM order matches visual order', () => {
  /*
   * Visual order target:
   *   Desktop (drawer inline, hamburger display:none):  [logo] [nav links] [cart]
   *   Mobile  (drawer overlay, hamburger visible):      [logo] [cart] [hamburger]
   *
   * DOM order inside .cs-header-actions must be:
   *   1. <nav class="cs-nav-drawer">
   *   2. <CartWidget> -> rendered as <... class="cs-cart-widget" ...> markup
   *   3. <button class="cs-nav-toggle">
   *
   * That single DOM order produces both visual orders without any CSS
   * `order` property: the drawer's display:none on mobile collapses it out
   * of the flex flow, leaving [cart][hamburger]; on desktop the hamburger
   * gets display:none, leaving [drawer][cart]. Tab order follows DOM order
   * at every breakpoint -> no WCAG 1.3.2 concern.
   */

  function extractHeaderActionsBlock(astro: string): string {
    const anchor = astro.indexOf('<div class="cs-header-actions">');
    if (anchor === -1) {
      throw new Error('expected <div class="cs-header-actions"> in Nav.astro');
    }
    // Walk forward to the matching </div>. The block contains nested <nav>,
    // <button>, and the <CartWidget /> tag; nested tags don't include their
    // own "</div>" so simple counting of <div ...> opens vs </div> closes is
    // sufficient given the current Nav.astro shape.
    let depth = 1;
    let i = anchor + '<div class="cs-header-actions">'.length;
    while (i < astro.length && depth > 0) {
      if (astro.startsWith('<div', i)) {
        depth++;
        i += 4;
        continue;
      }
      if (astro.startsWith('</div>', i)) {
        depth--;
        i += 6;
        if (depth === 0) break;
        continue;
      }
      i++;
    }
    return astro.slice(anchor, i);
  }

  it('drawer (cs-nav-drawer) appears before CartWidget, which appears before the hamburger toggle (cs-nav-toggle)', () => {
    const out = readAstro();
    const block = extractHeaderActionsBlock(out);

    const drawerIdx = block.indexOf('class="cs-nav-drawer"');
    const cartIdx = block.indexOf('<CartWidget');
    const toggleIdx = block.indexOf('class="cs-nav-toggle"');

    expect(drawerIdx).toBeGreaterThan(-1);
    expect(cartIdx).toBeGreaterThan(-1);
    expect(toggleIdx).toBeGreaterThan(-1);

    expect(drawerIdx).toBeLessThan(cartIdx);
    expect(cartIdx).toBeLessThan(toggleIdx);
  });

  it('Nav.css declares no `order:` property anywhere (DOM order = visual order is the contract)', () => {
    const css = readCss();
    // Match the `order:` declaration but not other tokens that share the
    // substring (e.g. `border:`, `border-color:`, `border-width:`,
    // `flex-order` would not; `border` is the realistic collision).
    // Anchor on a non-letter, non-hyphen boundary before `order` to exclude
    // `border-...` and `flex-shorthand: ... order` is invalid CSS so the
    // narrow declaration form is the right thing to check.
    expect(css).not.toMatch(/(^|[^a-zA-Z-])order\s*:/);
  });
});

describe('Nav.astro - delegates each item to NavItem.astro', () => {
  it('imports NavItem from ./NavItem.astro', () => {
    const out = readAstro();
    expect(out).toMatch(/import\s+NavItem\s+from\s+["']\.\/NavItem\.astro["']/);
  });

  it('renders one <NavItem> per item in nav, passing item + normalizedCurrentPath', () => {
    const out = readAstro();
    expect(out).toMatch(
      /nav\.map\(\s*\(\s*item(?:\s*,\s*index)?\s*\)\s*=>\s*\(\s*<NavItem[\s\S]*?item=\{item\}[\s\S]*?normalizedCurrentPath=\{normalizedCurrentPath\}/,
    );
  });

  it('does not contain the legacy three-way branch (cs-nav-dropdown / cs-nav-dropdown-combo / cs-nav-dropdown-trigger)', () => {
    const out = readAstro();
    expect(out).not.toMatch(/cs-nav-dropdown-combo/);
    expect(out).not.toMatch(/cs-nav-dropdown-trigger/);
    expect(out).not.toMatch(/class="cs-nav-dropdown-link"/);
    expect(out).not.toMatch(/class="cs-nav-dropdown"/);
  });

  it('regression: legacy <details>/<summary> markup is gone', () => {
    const out = readAstro();
    expect(out).not.toMatch(/<details/);
    expect(out).not.toMatch(/<summary/);
  });
});

describe('NavItem.astro - unified DOM shape', () => {
  it('exists at src/components/Nav/NavItem.astro', () => {
    expect(() => readNavItem()).not.toThrow();
  });

  it('imports ResolvedNavItem from the storefront lib', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /import\s+type\s+\{[^}]*\bResolvedNavItem\b[^}]*\}\s+from\s+["']\.\.\/\.\.\/lib\/storefront["']/,
    );
  });

  it('declares item, currentPath, normalizedCurrentPath props on the Props interface', () => {
    const out = readNavItem();
    expect(out).toMatch(/item\s*:\s*ResolvedNavItem/);
    // currentPath / normalizedCurrentPath are optional inputs from Nav.astro.
    expect(out).toMatch(/normalizedCurrentPath\s*\?\s*:\s*string/);
  });

  it('wraps every variant in <li class="cs-nav-item">', () => {
    const out = readNavItem();
    // class:list is the Astro idiom for conditional classes; cs-nav-item is
    // the always-on root class.
    expect(out).toMatch(/<li[\s\S]*?\bclass:list=\{\[\s*["']cs-nav-item["']/);
  });

  it('adds cs-nav-has-children when the item has children', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /["']cs-nav-has-children["']\s*:\s*hasChildren|hasChildren\s*&&\s*["']cs-nav-has-children["']/,
    );
  });

  it('wraps the label + chevron in <div class="cs-nav-row">', () => {
    const out = readNavItem();
    expect(out).toMatch(/<div\s+class="cs-nav-row">/);
  });

  it('linked label is <a class="cs-nav-label" href={item.href}>', () => {
    const out = readNavItem();
    // Either attribute order acceptable.
    expect(out).toMatch(
      /<a\s[^>]*\bclass="cs-nav-label"[^>]*\bhref=\{href\}|<a\s[^>]*\bhref=\{href\}[^>]*\bclass="cs-nav-label"/,
    );
  });

  it('unlinked-with-children label is <button type="button" class="cs-nav-label" aria-expanded="false" aria-controls={menuId}>', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /<button[\s\S]*?\btype="button"[\s\S]*?\bclass="cs-nav-label"[\s\S]*?\baria-expanded="false"[\s\S]*?\baria-controls=\{menuId\}/,
    );
  });

  it('childless unlinked edge case renders <span class="cs-nav-label">', () => {
    const out = readNavItem();
    expect(out).toMatch(/<span\s+class="cs-nav-label">/);
  });

  it('chevron is always <button type="button" class="cs-nav-chevron"> when children exist', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /<button[\s\S]*?\btype="button"[\s\S]*?\bclass="cs-nav-chevron"[\s\S]*?\baria-expanded="false"[\s\S]*?\baria-controls=\{menuId\}[\s\S]*?\baria-label=\{`Toggle \$\{[^}]*label\} submenu`\}/,
    );
  });

  it('children render inside <ul id={menuId} class="cs-nav-dropdown-menu">', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /<ul\s+id=\{menuId\}\s+class="cs-nav-dropdown-menu">/,
    );
  });

  it('does not produce a chevron for childless items', () => {
    const out = readNavItem();
    // The chevron must be guarded by hasChildren so it never renders for
    // leaf items. The simplest expression of this is that the chevron
    // markup appears only inside a hasChildren conditional block.
    const chevronGuard = /\{\s*hasChildren\s*&&[\s\S]*?<button[\s\S]*?\bclass="cs-nav-chevron"/;
    expect(out).toMatch(chevronGuard);
  });

  it('aria-current="page" is applied to the linked label when href matches normalizedCurrentPath', () => {
    const out = readNavItem();
    expect(out).toMatch(
      /normalizedCurrentPath\s*===\s*normalizePath\([^)]*\)[\s\S]*?["']aria-current["']\s*:\s*["']page["']/,
    );
  });

  it('aria-current="page" is applied to matching submenu links', () => {
    const out = readNavItem();
    // Child links use the same predicate against child.href.
    expect(out).toMatch(
      /child\.href[\s\S]*?normalizedCurrentPath\s*===\s*normalizePath[\s\S]*?["']aria-current["']\s*:\s*["']page["']/,
    );
  });
});

describe('NavItem.astro - DOM shape parity across linked / unlinked / childless variants', () => {
  it('every variant lives inside a <li class:list={["cs-nav-item", ...]}>', () => {
    const out = readNavItem();
    // Single shared <li> opening, not duplicated per branch. Counted via
    // the cs-nav-item class literal occurrence: the file should use it
    // once on the root <li>.
    const matches = out.match(/<li[\s\S]*?\bclass:list=\{\[\s*["']cs-nav-item["']/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('every variant routes through one <div class="cs-nav-row">', () => {
    const out = readNavItem();
    const matches = out.match(/<div\s+class="cs-nav-row">/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('the <ul class="cs-nav-dropdown-menu"> appears outside the .cs-nav-row, after it closes', () => {
    const out = readNavItem();
    // Source order: <div class="cs-nav-row">...</div> then optional <ul>.
    expect(out).toMatch(
      /<\/div>[\s\S]*?<ul\s+id=\{menuId\}\s+class="cs-nav-dropdown-menu">/,
    );
  });
});

describe('Nav.astro - inline script for drawer + dropdown behavior', () => {
  it('the script lives inline in Nav.astro', () => {
    const out = readAstro();
    expect(out).toMatch(/<script>[\s\S]*?<\/script>/);
  });

  it('selects every disclosure toggle: chevron buttons + label-buttons with aria-expanded', () => {
    const out = readAstro();
    // Both .cs-nav-chevron and any .cs-nav-label[aria-expanded] participate
    // in toggling. Selector must include both.
    expect(out).toMatch(
      /querySelectorAll[\s\S]*?\.cs-nav-chevron[\s\S]*?\.cs-nav-label\[aria-expanded\]/,
    );
  });

  it('binds a click handler that toggles the drawer toggle aria-expanded', () => {
    const out = readAstro();
    expect(out).toMatch(
      /toggle\.addEventListener\(\s*['"]click['"][\s\S]*?setExpanded\(toggle/,
    );
  });

  it('binds Escape to close the drawer (aria-expanded -> false)', () => {
    const out = readAstro();
    expect(out).toMatch(
      /addEventListener\(\s*['"]keydown['"][\s\S]*?Escape[\s\S]*?setExpanded\(toggle,\s*false\)/,
    );
  });

  /*
   * Helper: extract the hamburger toggle.addEventListener('click', ...)
   * handler body so the symmetric-close assertions can scope to that block
   * only and not leak into the per-disclosure click loop further down. We
   * bracket-walk from the first `{` after the `() =>` arrow to its matching
   * close brace.
   */
  function extractHamburgerClickBody(astro: string): string {
    const anchor = astro.indexOf("toggle.addEventListener('click'");
    if (anchor === -1) {
      throw new Error("expected toggle.addEventListener('click', ...) in Nav.astro");
    }
    const arrow = astro.indexOf('=>', anchor);
    const open = astro.indexOf('{', arrow);
    let depth = 1;
    let i = open + 1;
    while (i < astro.length && depth > 0) {
      const c = astro[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    return astro.slice(open, i);
  }

  function extractEscapeKeydownBody(astro: string): string {
    const anchor = astro.indexOf("addEventListener('keydown'");
    if (anchor === -1) {
      throw new Error("expected addEventListener('keydown', ...) in Nav.astro");
    }
    const arrow = astro.indexOf('=>', anchor);
    const open = astro.indexOf('{', arrow);
    let depth = 1;
    let i = open + 1;
    while (i < astro.length && depth > 0) {
      const c = astro[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    return astro.slice(open, i);
  }

  it('opens all per-item disclosure toggles when the drawer opens (regression guard)', () => {
    /*
     * The hamburger force-opens every disclosure toggle on open. With the
     * symmetric close behavior in place, the same forEach drives both
     * directions: setExpanded(btn, next). So `next === true` (open) still
     * fires aria-expanded="true" across every disclosure toggle.
     */
    const body = extractHamburgerClickBody(readAstro());
    expect(body).toMatch(
      /disclosureToggles\.forEach\([\s\S]*?setExpanded\([^,]+,\s*next\s*\)/,
    );
  });

  it('hamburger close collapses every disclosure toggle (symmetry with open)', () => {
    /*
     * Bug: clicking the hamburger to close left every chevron + label-button
     * at aria-expanded="true". The drawer hides them visually, but the next
     * open re-fires the force-open and DOM state is semantically dishonest
     * in between. Fix: the same forEach that force-opens on open must also
     * force-close on close. The canonical shape is a single
     * `disclosureToggles.forEach((btn) => setExpanded(btn, next))` inside
     * the click handler, with no `if (next)` guard around it.
     */
    const body = extractHamburgerClickBody(readAstro());
    // Reject the asymmetric `if (next)` guard around the disclosure forEach.
    expect(body).not.toMatch(
      /if\s*\(\s*next\s*\)\s*\{?\s*disclosureToggles\.forEach/,
    );
    // Reject hard-coded `true` literal that would skip the close-path reset.
    expect(body).not.toMatch(
      /disclosureToggles\.forEach\([\s\S]*?setExpanded\([^,]+,\s*true\s*\)/,
    );
    // Lock in the symmetric form: forEach drives by `next`, not a literal.
    expect(body).toMatch(
      /disclosureToggles\.forEach\([\s\S]*?setExpanded\([^,]+,\s*next\s*\)/,
    );
  });

  it('Escape collapses every disclosure toggle in addition to the hamburger', () => {
    /*
     * Bug: Escape only flipped the hamburger to aria-expanded="false". Every
     * disclosure toggle stayed expanded, so the next open looked correct
     * (force-opened again) but the off-screen state between presses lied.
     * Fix: the keydown/Escape branch must also reset every disclosureToggle
     * to aria-expanded="false".
     */
    const body = extractEscapeKeydownBody(readAstro());
    expect(body).toMatch(/Escape/);
    expect(body).toMatch(/setExpanded\(toggle,\s*false\)/);
    expect(body).toMatch(
      /disclosureToggles\.forEach\([\s\S]*?setExpanded\([^,]+,\s*false\s*\)/,
    );
  });

  it('click handler syncs sibling toggles that share the same aria-controls', () => {
    const out = readAstro();
    // When a chevron toggles, its sibling label-button (if any) inside the
    // same .cs-nav-row must flip together. Single source of state across
    // every participating button.
    expect(out).toMatch(/aria-controls/);
    expect(out).toMatch(
      /querySelectorAll(?:<[^>]+>)?\(\s*[`'"]\s*\[aria-controls=/,
    );
  });
});

describe('Nav.astro - desktop-entry reset of stuck disclosure state', () => {
  /*
   * Bug: opening the hamburger on mobile force-opens every chevron and
   * label-button (sets aria-expanded="true" so the drawer renders all
   * submenus expanded). The desktop CSS reveal selector also keys off
   * aria-expanded="true" on chevrons, so resizing INTO desktop without
   * closing the drawer leaves every dropdown popped open.
   *
   * Fix: a matchMedia listener bound to the same breakpoint as the CSS
   * (min-width: 40.001rem). When the viewport crosses INTO desktop, reset
   * the hamburger toggle and every disclosure toggle to aria-expanded="false".
   * Crossing INTO mobile must NOT reset, since the hamburger handler force-
   * opens all toggles when the drawer is opened.
   */

  it('subscribes to the desktop media query at (min-width: 40.001rem)', () => {
    const out = readAstro();
    expect(out).toMatch(
      /window\.matchMedia\(\s*['"`]\(min-width:\s*40\.001rem\)['"`]\s*\)/,
    );
  });

  it('binds a change listener on that media query', () => {
    const out = readAstro();
    // Either pattern is acceptable: storing the MQL in a variable then
    // attaching a change listener, or chaining directly.
    expect(out).toMatch(
      /matchMedia\([\s\S]*?\)[\s\S]*?\.addEventListener\(\s*['"`]change['"`]/,
    );
  });

  it('on desktop entry (matches=true), resets the hamburger toggle aria-expanded to false', () => {
    const out = readAstro();
    // The handler must call setExpanded(toggle, false) (or equivalently
    // setAttribute('aria-expanded','false')) when matches is truthy.
    // We assert the structural shape: a matches-guarded block that resets
    // the toggle.
    expect(out).toMatch(
      /matches[\s\S]{0,400}?setExpanded\(\s*toggle\s*,\s*false\s*\)/,
    );
  });

  it('on desktop entry, resets every disclosure toggle aria-expanded to false', () => {
    const out = readAstro();
    expect(out).toMatch(
      /matches[\s\S]{0,400}?disclosureToggles\.forEach\([\s\S]{0,200}?setExpanded\([^,]+,\s*false\s*\)/,
    );
  });

  it('does NOT reset on mobile entry (early-return on !matches guards the reset)', () => {
    const out = readAstro();
    // Lock in the asymmetry: when matches is false (mobile entry), the
    // handler must short-circuit before touching aria-expanded. The
    // canonical shape is `if (!matches) return;` immediately inside the
    // handler. We assert it appears, and we reject the inverse anti-
    // pattern `if (matches) return;` which would flip the bug back on.
    expect(out).toMatch(/if\s*\(\s*!\s*matches\s*\)\s*return/);
    expect(out).not.toMatch(/if\s*\(\s*matches\s*\)\s*return/);
  });
});

describe('Nav.css - mobile breakpoint and desktop behavior', () => {
  it(`includes a (max-width: ${MOBILE_BREAKPOINT_LITERAL}) media query`, () => {
    const css = readCss();
    const escaped = MOBILE_BREAKPOINT_LITERAL.replace('.', '\\.');
    const re = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${escaped}\\s*\\)`);
    expect(css).toMatch(re);
  });

  it('hides .cs-nav-toggle above the breakpoint', () => {
    const css = readCss();
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-toggle\s*\{[^}]*display:\s*none/,
    );
  });

  it('makes .cs-nav-chevron a non-interactive visual on desktop', () => {
    const css = readCss();
    expect(css).toMatch(
      /@media\s*\(\s*min-width:\s*40\.001rem\s*\)[\s\S]*?\.cs-nav-chevron\s*\{[^}]*pointer-events:\s*none/,
    );
  });

  it('regression: the legacy .cs-nav-dropdown-trigger::after pseudo-chevron is gone', () => {
    const css = readCss();
    expect(css).not.toMatch(/\.cs-nav-dropdown-trigger::after/);
    expect(css).not.toMatch(/\.cs-nav-dropdown-trigger/);
  });

  it('regression: the legacy .cs-nav-dropdown-combo flex-wrap rules are gone', () => {
    const css = readCss();
    expect(css).not.toMatch(/cs-nav-dropdown-combo/);
  });

  it('declares a flex .cs-nav-row layout', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-row\s*\{[\s\S]*?display:\s*flex[\s\S]*?\}/,
    );
  });

  it('hides .cs-nav-drawer by default below the breakpoint', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-drawer\s*\{[^}]*display:\s*none/,
    );
  });

  it('reveals .cs-nav-drawer when the toggle is aria-expanded="true"', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    // DOM order is drawer -> cart -> toggle inside .cs-header-actions, so
    // adjacency selectors no longer work. The reveal is parent-relative via
    // :has() on the shared .cs-header-actions container.
    expect(block).toMatch(
      /\.cs-header-actions:has\(\.cs-nav-toggle\[aria-expanded="true"\]\)\s+\.cs-nav-drawer\s*\{[^}]*display:\s*block/,
    );
  });

  it('reveals .cs-nav-dropdown-menu when its chevron sibling is aria-expanded="true"', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-chevron\[aria-expanded="true"\]\s*~\s*\.cs-nav-dropdown-menu|\.cs-nav-row:has\(\.cs-nav-chevron\[aria-expanded="true"\]\)\s*\+\s*\.cs-nav-dropdown-menu/,
    );
  });

  it('preserves desktop hover / focus-within reveal of the dropdown menu via .cs-nav-has-children', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-has-children:hover\s+\.cs-nav-dropdown-menu[\s\S]*?\.cs-nav-has-children:focus-within\s+\.cs-nav-dropdown-menu/,
    );
  });

  it('rotates the chevron 180deg when its aria-expanded is true at mobile width', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-chevron\[aria-expanded="true"\]\s*\{[^}]*transform:\s*rotate\(180deg\)/,
    );
  });

  it('rotates the chevron on desktop hover / focus-within of the parent', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-has-children:hover\s+\.cs-nav-chevron[\s\S]*?\.cs-nav-has-children:focus-within\s+\.cs-nav-chevron[\s\S]*?transform:\s*rotate\(180deg\)/,
    );
  });

  it('the chevron is drawn via mask-image so it recolors via --cs-nav-chevron-color', () => {
    const css = readCss();
    expect(css).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?mask-image:\s*url\(/,
    );
    expect(css).toMatch(
      /\.cs-nav-chevron\s*\{[\s\S]*?background-color:\s*var\(--cs-nav-chevron-color/,
    );
  });

  it('.cs-nav-label[aria-controls] resets browser button chrome to match the link variant visually', () => {
    const css = readCss();
    // The unlinked-parent label is a <button> (it is the only label
    // variant that carries aria-controls). To render identically to the
    // <a> sibling it needs background:transparent, border:0, padding:0,
    // font:inherit, cursor:pointer, text-align:left. We scope via the
    // attribute selector to avoid bare-element rules in the package per
    // tests/unit/styles/css-contract.test.ts.
    expect(css).toMatch(
      /\.cs-nav-label\[aria-controls\]\s*\{[\s\S]*?background[-\w]*:\s*transparent[\s\S]*?border[-\w]*:\s*0[\s\S]*?cursor:\s*pointer/,
    );
  });

  it('mobile: .cs-nav-label fills the row via flex: 1 1 auto', () => {
    const css = readCss();
    const block = extractMediaBlock(css, 'max-width', MOBILE_BREAKPOINT_LITERAL);
    expect(block).toMatch(
      /\.cs-nav-label\s*\{[\s\S]*?flex:\s*1\s+1\s+auto/,
    );
  });

  it('desktop: .cs-nav-label[aria-controls] has cursor: default (button is inert under hover/focus-within reveal)', () => {
    /*
     * The unlinked-parent variant is a <button class="cs-nav-label">
     * carrying aria-controls. On desktop, hover and focus-within open the
     * submenu via CSS; clicking the button is a no-op for visible state.
     * The base rule sets cursor: pointer which is dishonest at desktop
     * width. Override to cursor: default inside the desktop media block.
     * Using `default` (forced arrow) rather than `auto` (browser decides,
     * could surface an I-beam over the text).
     */
    const css = readCss();
    const block = extractMediaBlock(css, 'min-width', '40.001rem');
    expect(block).toMatch(
      /\.cs-nav-label\[aria-controls\]\s*\{[^}]*cursor:\s*default/,
    );
  });

  it('desktop: regression - .cs-nav-label[aria-controls] does NOT carry cursor: pointer inside the desktop block', () => {
    /*
     * Guard against the implicit pointer leaking through. The base rule
     * `.cs-nav-label[aria-controls] { ... cursor: pointer; }` lives outside
     * the media block; the desktop override must be the authoritative
     * cursor for that selector inside this block. Reject any rule inside
     * the desktop block that pairs the same selector with cursor: pointer.
     */
    const css = readCss();
    const block = extractMediaBlock(css, 'min-width', '40.001rem');
    expect(block).not.toMatch(
      /\.cs-nav-label\[aria-controls\]\s*\{[^}]*cursor:\s*pointer/,
    );
  });

  it('desktop: does NOT add pointer-events: none on .cs-nav-label[aria-controls] (keep keyboard interaction intact)', () => {
    /*
     * The button must remain focusable and clickable for keyboard users:
     * pressing Enter while focused flips aria-expanded, and the
     * focus-within selector opens the menu. Only the cursor changes; the
     * button stays interactive.
     */
    const css = readCss();
    const block = extractMediaBlock(css, 'min-width', '40.001rem');
    expect(block).not.toMatch(
      /\.cs-nav-label\[aria-controls\]\s*\{[^}]*pointer-events:\s*none/,
    );
  });

  it('prefers-reduced-motion zeroes the chevron transition duration', () => {
    const css = readCss();
    const reduce = extractMediaBlock(css, 'prefers-reduced-motion', 'reduce');
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms/);
  });
});

describe('theme/theme.css - nav drawer tokens', () => {
  it.each([
    '--cs-nav-drawer-surface',
    '--cs-nav-drawer-padding',
    '--cs-nav-drawer-gap',
    '--cs-nav-chevron-size',
    '--cs-nav-chevron-color',
    '--cs-nav-animation-duration',
  ])('declares %s', (token) => {
    const re = new RegExp(`${token.replace(/-/g, '\\-')}:`);
    expect(readTheme()).toMatch(re);
  });
});

describe('Nav dropdown menu alignment token', () => {
  it('theme/theme.css declares --cs-nav-dropdown-menu-align with default center', () => {
    expect(readTheme()).toMatch(/--cs-nav-dropdown-menu-align:\s*center/);
  });

  it('Nav.css overrides placement for the left keyword via @container style query', () => {
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*left\)/,
    );
  });

  it('Nav.css overrides placement for the right keyword via @container style query', () => {
    expect(readCss()).toMatch(
      /@container\s+style\(--cs-nav-dropdown-menu-align:\s*right\)/,
    );
  });
});
