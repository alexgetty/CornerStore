# Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `<Nav>` so it collapses cleanly below 40rem into a native disclosure pattern, while preserving the desktop dropdowns and keeping link+children combo items unambiguous.

**Architecture:** A top-level `<details>` wraps the nav `<ul>` and acts as the mobile drawer toggle. Per-item dropdowns are also `<details>`. Above 40rem, all `<details>` are forced open and their `<summary>` triggers are visually neutered so the existing hover/focus-within dropdown behavior takes over. Combo items (href + children) follow Pattern A: the visible label is a real `<a>` link; a sibling chevron `<summary>` is the toggle. ESC and click-outside close the top-level drawer via ~10 lines of inline JS.

**Tech Stack:** Astro component, vanilla CSS (`@layer package`), `interpolate-size: allow-keywords` + `transition-behavior: allow-discrete` for height animation, native HTML `<details>`/`<summary>` for state, design tokens following the existing `--cs-thing-property-modifier` convention. Vitest source-level regex tests in the `cart-mobile-stack.test.ts` mold.

---

## Original problem framing (preserved for context)

The current nav is a horizontal link list with CSS-only `:hover` / `:focus-within` dropdowns. On small screens it overflows or wraps awkwardly, dropdowns behave inconsistently on touch, and combo items create tap ambiguity (first tap reveals dropdown, second tap navigates). There is no responsive collapse. The pattern needs to handle plain links, dropdown-only triggers, link+dropdown combos, and the cart widget, while preserving keyboard accessibility and the `@layer package`/`@layer theme` system.

---

## Locked decisions (from the huddle)

1. Disclosure: native `<details>`/`<summary>` accordion, no custom hamburger JS state.
2. Combo items: Pattern A — link text is an `<a>`, chevron is a sibling `<summary>`. Two distinct tap targets.
3. Breakpoint: `40rem` hardcoded in `Nav.css`, matching `Cart.css`. Documented in a comment that mirrors the Cart.css comment.
4. ESC closes the open drawer (inline JS, ~5 lines).
5. Click-outside closes the top-level drawer only (inner per-item accordions auto-close with the parent).
6. Animation: `interpolate-size: allow-keywords` + `transition-behavior: allow-discrete` for open/close height.
7. Exclusive inner accordions (decision below).
8. CartWidget stays in `<header>` next to the disclosure trigger at all sizes.
9. Footer nav: out of scope. Flat list, wraps fine.
10. Light audit on Listings: confirm or flag, do not blow scope.

### Recommendation on locked decision #7: yes, exclusive inner accordions

Use `name="cs-nav-accordion"` on every inner per-item `<details>`. One category dropdown open at a time inside the drawer. Reasoning:

- Drawer height stays bounded. Two long category lists open simultaneously can blow past viewport height on a phone.
- The desktop pattern only ever shows one dropdown at a time (hover is exclusive by nature). Mobile matching desktop is the principle of least surprise.
- Native browser support is shipped (`name` on `<details>` is in all evergreen browsers as of 2024).
- Zero JS cost. The browser handles the exclusivity.
- The `name` attribute is structural, not visual. Theme overrides cannot break it.

Counterargument considered: if a user wants to compare two categories side-by-side. Rejected. They are stacked vertically, not side-by-side. Scrolling to compare is a worse UX than tapping back into the second category.

---

## Listings audit results

- **`ListingCards.css`**: Auto-fill grid with `minmax(var(--cs-listing-minimum-width), 1fr)`. Already responsive end-to-end. No changes needed.
- **`ListingTable.css`**: No mobile collapse. Has the same column-shape problem the cart had pre-collapse (Image, Product, MOQ, Qty stepper, Price, Total, Remove). Below ~40rem the stepper crowds the price/total columns. **Action: file as a follow-up todo at `docs/todo/listing-table-mobile.md`. Do not build in this plan.** See "Init parity check" below for confirmation that this todo is internal-only and does not need init changes.

---

## Init parity check

Nav is fully internal to the package. Consumers import `<Nav>` from the library. No new `StoreConfig` keys, no new `bin/init.mjs` files, no new env vars, no new CSV columns, no new pages.

The `nav: ResolvedNavItem[]` prop shape is unchanged. Existing `nav`/`footerNav` config in `cornerstore.config.js` continues to work as-is. Confirmed by inspection of `bin/init.mjs:113-122`: `nav` is built as `[{ label, page }]` items and passed through to the layout, which resolves them to `ResolvedNavItem` (which already supports both `href`-only and `href` + `children`).

**No `bin/init.mjs` changes required.**

---

## Test list (TDD order)

Tests live at `tests/unit/components/nav-mobile-disclosure.test.ts`, source-level regex on `Nav.astro` and `Nav.css` matching the existing pattern in `cart-mobile-stack.test.ts`.

The test file pins the breakpoint as `MOBILE_BREAKPOINT_LITERAL = '40rem'` and reuses an `extractNavMediaBlock` helper modeled on `extractCartTableMediaBlock`.

Tests in build order:

1. `Nav.astro: top-level <details> wraps the <ul>` — drawer disclosure exists.
2. `Nav.astro: top-level <summary> has aria-label="Menu"` — accessible name on the trigger.
3. `Nav.astro: plain link items render as <li><a>` — unchanged from current.
4. `Nav.astro: dropdown-only items render <li><details><summary>{label}</summary><ul>...</ul></details></li>` — button-only trigger when no href.
5. `Nav.astro: combo items render <a> for the label and a sibling <summary> with class="cs-nav-chevron" inside the <details>` — Pattern A structurally.
6. `Nav.astro: combo item <summary> contains an aria-label="Toggle {label} submenu"` — chevron is announced separately.
7. `Nav.astro: aria-current="page" still applied to the active link inside the drawer` — drawer does not break the existing current-page contract.
8. `Nav.astro: every inner <details> carries name="cs-nav-accordion"` — exclusive accordions.
9. `Nav.astro: top-level <details> does NOT carry a name attribute` — drawer is independent of inner exclusive group.
10. `Nav.css: a (max-width: 40rem) media query exists in Nav.css` — breakpoint pinned.
11. `Nav.css: above 40rem (i.e., outside the media query) the top-level <details> ignores its open state` — desktop bypass via `details.cs-nav-drawer > summary { display: none }` plus a rule that forces the inner content visible (see CSS structure below).
12. `Nav.css: inside the 40rem media query, .cs-nav-drawer[open] > ul transitions height with transition-behavior: allow-discrete` — animation contract.
13. `Nav.css: inside the 40rem media query, an exclusive accordion rule scopes inner <details>` — per-item collapse.
14. `Nav.css: @media (prefers-reduced-motion: reduce) sets transition-duration: 0s on .cs-nav-drawer and inner <details>` — reduced-motion respect.
15. `Nav.css: combo-item chevron <summary> uses ::marker { content: '' } and a background or mask-image chevron` — list-style stripped, chevron drawn from a token.
16. `Nav.astro: inline <script> at end of file binds keydown Escape to close .cs-nav-drawer` — ESC handler exists.
17. `Nav.astro: inline <script> binds pointerdown on document to close .cs-nav-drawer when click is outside the <header>` — click-outside handler exists.
18. `theme/theme.css: declares --cs-nav-chevron-size, --cs-nav-chevron-color, --cs-nav-drawer-surface, --cs-nav-drawer-padding, --cs-nav-drawer-gap, --cs-nav-animation-duration` — token contract.
19. `Regression: existing desktop dropdown behavior is preserved` — assert `.cs-nav-dropdown:hover .cs-nav-dropdown-menu` (or its replacement using `details[open]`) still resolves to a visible menu above 40rem.

Skipped intentionally (out of test budget for source-level testing):

- Live keyboard tab order across the drawer. Native `<details>`/`<summary>` + `<a>` source order gives correct tab sequence by construction. A future Playwright pass can pin it.
- Live animation timing. Source-level pin of the CSS rule is the contract; visual fidelity is a manual / Storybook concern.

---

## File structure

- **Modify:** `src/components/Nav/Nav.astro` — rewrite JSX to the new `<details>`-based structure, append inline `<script>` for ESC and click-outside.
- **Modify:** `src/components/Nav/Nav.css` — add the 40rem media query, restructure desktop rules around the new markup, add reduced-motion and animation rules.
- **Modify:** `theme/theme.css` — add the six new `--cs-nav-*` tokens listed below.
- **Create:** `tests/unit/components/nav-mobile-disclosure.test.ts` — source-level test file pinning the contract.
- **Create:** `docs/todo/listing-table-mobile.md` — short follow-up todo for the listing table mobile collapse.

No `bin/init.mjs` change. No new pages. No new config keys.

---

## HTML structure (the contract)

Representative nav with three item types: a plain link ("About"), a dropdown-only item ("Wholesale" with no href), and a link+children combo ("Shop" with href and category children).

```astro
<header class="cs-header">
  <a href="/" class="cs-store-name">{storeName}</a>

  <details class="cs-nav-drawer">
    <summary class="cs-nav-toggle" aria-label="Menu">
      <span class="cs-nav-toggle-icon" aria-hidden="true"></span>
    </summary>

    <nav aria-label="Main">
      <ul class="cs-nav-links">

        {/* Plain link */}
        <li>
          <a href="/about" aria-current={isCurrent('/about') ? 'page' : undefined}>
            About
          </a>
        </li>

        {/* Dropdown-only (no href on parent) */}
        <li class="cs-nav-dropdown">
          <details name="cs-nav-accordion">
            <summary class="cs-nav-dropdown-trigger">Wholesale</summary>
            <ul class="cs-nav-dropdown-menu">
              <li><a href="/wholesale/apply">Apply</a></li>
              <li><a href="/wholesale/catalog">Catalog</a></li>
            </ul>
          </details>
        </li>

        {/* Link + children combo (Pattern A) */}
        <li class="cs-nav-dropdown cs-nav-dropdown-combo">
          <details name="cs-nav-accordion">
            <a
              href="/shop"
              class="cs-nav-dropdown-link"
              aria-current={isCurrent('/shop') ? 'page' : undefined}
            >
              Shop
            </a>
            <summary class="cs-nav-chevron" aria-label="Toggle Shop submenu"></summary>
            <ul class="cs-nav-dropdown-menu">
              <li><a href="/shop/mugs">Mugs</a></li>
              <li><a href="/shop/totes">Totes</a></li>
            </ul>
          </details>
        </li>

      </ul>
    </nav>
  </details>

  {priceMap && currency && (
    <CartWidget priceMap={priceMap} disabledSkus={disabledSkus} currency={currency} />
  )}
</header>
```

Notes pinned by tests:

- The top-level `<details class="cs-nav-drawer">` has no `name` attribute. It is independent of the inner exclusive group.
- Every inner `<details>` carries `name="cs-nav-accordion"`. The browser enforces that opening one closes the others.
- Combo items put the `<a>` and the `<summary>` as siblings inside `<details>`. The `<a>` is the label; the `<summary>` is a tiny chevron-only tap target. Two distinct hit areas.
- `aria-current="page"` continues to live on the `<a>` link inside the drawer.

---

## CSS structure

All rules live inside `@layer package` per the architecture rule. Tokens use the existing `thing-property-modifier` convention.

### New tokens (declared in `theme/theme.css`)

| Token | Purpose | Suggested default |
|---|---|---|
| `--cs-nav-drawer-surface` | Background of the open drawer panel below 40rem. | `var(--cs-header-surface, transparent)` |
| `--cs-nav-drawer-padding` | Inner padding of the open drawer. | `1rem` |
| `--cs-nav-drawer-gap` | Vertical gap between drawer items. | `0.75rem` |
| `--cs-nav-chevron-size` | Width/height of the combo-item chevron tap target. | `2.75rem` (44px floor) |
| `--cs-nav-chevron-color` | Stroke color of the chevron icon. | `currentColor` |
| `--cs-nav-animation-duration` | Open/close height transition duration. | `0.2s` |

### Selectors and intent (in source order)

```
.cs-nav-drawer                                   /* container details, owns drawer state below 40rem */
.cs-nav-drawer > summary.cs-nav-toggle           /* hamburger button visible only below 40rem */
.cs-nav-toggle-icon                              /* three-line glyph drawn from currentColor borders */
.cs-nav-drawer summary::marker                   /* hide native disclosure arrow on every <summary> */
.cs-nav-drawer summary { list-style: none }      /* belt-and-suspenders for browsers that ignore ::marker */

/* Desktop bypass: above 40rem, the wrapper <details> is structural-only.
   Force its content always-visible and hide the toggle <summary>. */
@media (min-width: 40.001rem) {
  .cs-nav-drawer > .cs-nav-toggle { display: none; }
  .cs-nav-drawer > nav { display: contents; }   /* nav participates in flex parent */
  /* Inner per-item <details>: bypass open/closed state, restore hover dropdowns. */
  .cs-nav-dropdown details { /* details acts as positioning context */
    position: relative;
  }
  .cs-nav-dropdown details > summary { pointer-events: none; }  /* chevron inert on desktop */
  .cs-nav-dropdown details > .cs-nav-dropdown-menu {
    /* Hover/focus-within reveal continues to work because we do not gate on [open]. */
    display: none;
    position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    /* (rest of existing dropdown-menu rules carry over here) */
  }
  .cs-nav-dropdown:hover .cs-nav-dropdown-menu,
  .cs-nav-dropdown:focus-within .cs-nav-dropdown-menu { display: flex; }
  .cs-nav-chevron { display: none; }            /* desktop uses hover, no chevron needed */
}
```

```
/* ------------------------------------------------------------------
 * Mobile collapse: nav links -> native <details> drawer.
 *
 * Why 40rem (640px): matches the cart-table collapse breakpoint in
 * Cart.css. Above 40rem we have the horizontal real estate for a
 * link list with hover dropdowns; below it we collapse to a vertical
 * disclosure stack so links don't wrap or overflow the header.
 *
 * The breakpoint is hardcoded here because CSS @media queries cannot
 * reference custom properties cross-browser (env() is not shipped).
 * The token --cs-nav-* family in theme.css configures the LOOK of the
 * drawer; the trigger width itself is a structural decision pinned by
 * tests/unit/components/nav-mobile-disclosure.test.ts.
 * ------------------------------------------------------------------ */
@media (max-width: 40rem) {

  .cs-nav-drawer                          /* full-width disclosure block in the header */
  .cs-nav-drawer > .cs-nav-toggle         /* visible 44x44 hamburger button */
  .cs-nav-toggle-icon                     /* three-bar glyph */
  .cs-nav-drawer > nav                    /* the panel that animates open */
  .cs-nav-drawer[open] > nav              /* expanded panel: tokenized padding + gap */
  .cs-nav-links                           /* vertical flex list */
  .cs-nav-dropdown                        /* relative wrapper for combo chevron position */
  .cs-nav-dropdown details                /* per-item disclosure, exclusive via name= */
  .cs-nav-dropdown details > summary      /* full-row tap target for dropdown-only items */
  .cs-nav-dropdown-combo details          /* row with link + chevron, flex layout */
  .cs-nav-dropdown-combo .cs-nav-dropdown-link  /* takes remaining space, full tap target */
  .cs-nav-chevron                         /* fixed 2.75rem chevron square, mask-image arrow */
  .cs-nav-chevron::marker                 /* hide native disclosure marker */
  .cs-nav-dropdown details[open] .cs-nav-chevron  /* rotate chevron 180deg when open */
  .cs-nav-dropdown-menu                   /* indented sub-list, vertical layout */

  /* Animation: interpolate-size + transition-behavior: allow-discrete
     unlocks height transitions to/from the auto-keyword and bridges
     the display:none / display:block discrete jump. */
  .cs-nav-drawer > nav,
  .cs-nav-dropdown details > .cs-nav-dropdown-menu {
    interpolate-size: allow-keywords;
    height: 0;
    overflow: hidden;
    transition:
      height var(--cs-nav-animation-duration, 0.2s) ease,
      content-visibility var(--cs-nav-animation-duration, 0.2s) allow-discrete;
  }
  .cs-nav-drawer[open] > nav,
  .cs-nav-dropdown details[open] > .cs-nav-dropdown-menu {
    height: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cs-nav-drawer > nav,
  .cs-nav-dropdown details > .cs-nav-dropdown-menu {
    transition-duration: 0s;
  }
}
```

(The list above is intent-by-selector; the actual rule bodies are filled in during the implementation tasks below using longhand properties only, per the architecture rule.)

---

## JS (inline `<script>` at the end of `Nav.astro`)

Lives inline rather than in a separate module because: (a) it is ~10 lines and tightly coupled to the markup it operates on; (b) Astro inlines script tags by default and the storefront is `output: 'static'` — there is no benefit to a separate file; (c) keeping it next to the markup makes the contract obvious to the next reader.

```html
<script>
  // Close the mobile nav drawer on Escape and click-outside.
  // Scoped to <details class="cs-nav-drawer">; inner per-item <details>
  // are exclusive via name= and auto-close when the parent drawer closes.
  document.querySelectorAll('details.cs-nav-drawer').forEach((drawer) => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.open) drawer.open = false;
    });
    document.addEventListener('pointerdown', (e) => {
      if (drawer.open && !drawer.contains(e.target)) drawer.open = false;
    });
  });
</script>
```

---

## Step-by-step build order

Strict TDD. Red, green, refactor, commit. One test or one rule per cycle.

### Task 1: New token contract in theme.css

**Files:**
- Test: `tests/unit/components/nav-mobile-disclosure.test.ts` (create)
- Modify: `theme/theme.css`

- [ ] **Step 1: Write the failing tokens-exist test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const themePath = join(process.cwd(), 'theme', 'theme.css');
const readTheme = (): string => readFileSync(themePath, 'utf8');

describe('theme/theme.css - nav drawer tokens', () => {
  it.each([
    '--cs-nav-drawer-surface',
    '--cs-nav-drawer-padding',
    '--cs-nav-drawer-gap',
    '--cs-nav-chevron-size',
    '--cs-nav-chevron-color',
    '--cs-nav-animation-duration',
  ])('declares %s', (token) => {
    expect(readTheme()).toMatch(new RegExp(`${token.replace(/-/g, '\\-')}:`));
  });
});
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run tests/unit/components/nav-mobile-disclosure.test.ts`
Expected: 6 failing assertions.

- [ ] **Step 3: Add the six tokens to `theme/theme.css`** with the defaults listed in the table above.

- [ ] **Step 4: Run, watch it pass.**

- [ ] **Step 5: Commit.** Message: `feat(nav): declare mobile-disclosure theme tokens`.

### Task 2: Astro structure — top-level drawer

**Files:**
- Modify: `src/components/Nav/Nav.astro`
- Test: `tests/unit/components/nav-mobile-disclosure.test.ts`

- [ ] **Step 1: Write tests 1, 2, and 9** from the test list (drawer wraps `<ul>`, summary has `aria-label="Menu"`, drawer has no `name=`).

- [ ] **Step 2: Run, watch them fail.**

- [ ] **Step 3: Wrap the existing `<nav>` in `<details class="cs-nav-drawer">` with a `<summary class="cs-nav-toggle" aria-label="Menu"><span class="cs-nav-toggle-icon" aria-hidden="true"></span></summary>` as the first child.** No styling yet. Do not delete the existing dropdown markup — desktop must still work.

- [ ] **Step 4: Run all unit tests** to confirm no regressions in cart/hero markup tests.

- [ ] **Step 5: Commit.** Message: `feat(nav): wrap nav in details/summary disclosure`.

### Task 3: Astro structure — inner exclusive accordion

- [ ] **Step 1: Write tests 4, 5, 6, 8** (dropdown-only renders `<details><summary>`, combo renders `<a>` + sibling `<summary class="cs-nav-chevron">`, chevron has aria-label, every inner details has `name="cs-nav-accordion"`).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Replace the existing dropdown JSX** in `Nav.astro`:
  - For dropdown-only items (`!item.href && item.children`): render `<li class="cs-nav-dropdown"><details name="cs-nav-accordion"><summary class="cs-nav-dropdown-trigger">{label}</summary><ul class="cs-nav-dropdown-menu">...</ul></details></li>`.
  - For combo items (`item.href && item.children`): render `<li class="cs-nav-dropdown cs-nav-dropdown-combo"><details name="cs-nav-accordion"><a class="cs-nav-dropdown-link" href={item.href} aria-current={...}>{label}</a><summary class="cs-nav-chevron" aria-label={\`Toggle ${item.label} submenu\`}></summary><ul class="cs-nav-dropdown-menu">...</ul></details></li>`.

- [ ] **Step 4: Run, pass.**

- [ ] **Step 5: Commit.** Message: `feat(nav): convert dropdowns to exclusive details accordion`.

### Task 4: Astro structure — aria-current preserved

- [ ] **Step 1: Write test 7** (active link inside drawer keeps `aria-current="page"`).

- [ ] **Step 2: Run, pass immediately if Task 3 was implemented correctly.** If it fails, the JSX missed the aria-current branch. Fix.

- [ ] **Step 3: Run, pass. Commit if any change.** Message: `test(nav): pin aria-current contract through drawer`.

### Task 5: ESC + click-outside script

- [ ] **Step 1: Write tests 16, 17** (inline script binds `keydown Escape` and `pointerdown` to close `.cs-nav-drawer`). Tests are regex on `Nav.astro` source.

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Append the `<script>` block** from the JS section above to the end of `Nav.astro`.

- [ ] **Step 4: Run, pass.**

- [ ] **Step 5: Commit.** Message: `feat(nav): close drawer on Escape and click-outside`.

### Task 6: CSS — breakpoint and desktop bypass

- [ ] **Step 1: Write tests 10, 11, 19** (40rem media query exists, desktop bypass forces inner content visible, regression: hover dropdown rule survives).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Restructure `Nav.css`:**
  - Keep the existing `.cs-header`, `.cs-store-name`, `.cs-logo`, `.cs-header-actions`, base `.cs-nav-links` rules.
  - Replace the `.cs-nav-dropdown-menu { display: none }` + `.cs-nav-dropdown:hover` rules with the desktop-scoped variant inside `@media (min-width: 40.001rem)`.
  - Hide `.cs-nav-toggle` and `.cs-nav-chevron` above 40rem; force `.cs-nav-drawer > nav { display: contents }`.
  - Keep all longhand properties. No shorthand. All numeric values via tokens with structural fallbacks.

- [ ] **Step 4: Manual sanity check** in dev: `npm run dev`, resize the viewport across 40rem, confirm desktop dropdowns still hover-open and mobile drawer collapses.

- [ ] **Step 5: Run, pass. Commit.** Message: `feat(nav): scope desktop dropdowns above 40rem`.

### Task 7: CSS — mobile drawer styling

- [ ] **Step 1: Write tests 13, 15** (exclusive accordion rule scoped to inner details, chevron summary uses `::marker` content empty + tokenized chevron icon).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Inside the `@media (max-width: 40rem)` block:**
  - Style `.cs-nav-drawer` as a full-width header item with `--cs-nav-drawer-surface` background.
  - Style `.cs-nav-toggle` as a 44px-min hamburger button. Strip the native marker.
  - Style `.cs-nav-toggle-icon` as a stack of three borders on a transparent box (no SVG, no asset; pure CSS borders).
  - Style `.cs-nav-links` as `flex-direction: column` with `gap: var(--cs-nav-drawer-gap)`.
  - Style `.cs-nav-dropdown-combo details` as a flex row: `.cs-nav-dropdown-link { flex: 1 1 auto }`, `.cs-nav-chevron { flex: 0 0 auto; width: var(--cs-nav-chevron-size); height: var(--cs-nav-chevron-size) }`.
  - Style `.cs-nav-chevron` with `mask-image` of an inline-SVG arrow data URI, `background-color: var(--cs-nav-chevron-color)`. Strip native marker via `::marker { content: '' }` and `list-style: none`.
  - Add `.cs-nav-dropdown details[open] .cs-nav-chevron { transform: rotate(180deg) }`.

- [ ] **Step 4: Run, pass.**

- [ ] **Step 5: Commit.** Message: `feat(nav): style mobile drawer disclosure below 40rem`.

### Task 8: CSS — animation

- [ ] **Step 1: Write tests 12, 14** (height transition with `transition-behavior: allow-discrete` exists; reduced-motion zeroes duration).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Add the `interpolate-size: allow-keywords` + `height: 0` -> `height: auto` transition** to `.cs-nav-drawer > nav` and `.cs-nav-dropdown details > .cs-nav-dropdown-menu`. Add the `@media (prefers-reduced-motion: reduce)` override at the end of the file.

- [ ] **Step 4: Run, pass. Manual check** that the open/close animates and that `prefers-reduced-motion: reduce` (DevTools rendering tab) skips it.

- [ ] **Step 5: Commit.** Message: `feat(nav): animate drawer height with discrete transitions`.

### Task 9: Listings audit follow-up todo

- [ ] **Step 1: Create `docs/todo/listing-table-mobile.md`** with a short problem statement: ListingTable has the same column-collapse problem the cart had pre-mobile-stack, document the column count and the suggested 40rem breakpoint, link to `cart-mobile-stack.test.ts` as the pattern reference. Do not plan it.

- [ ] **Step 2: Commit.** Message: `docs(todo): file listing-table mobile-collapse follow-up`.

### Task 10: Archive this todo

- [ ] **Step 1: When all above tasks are green and shipped**, move this file to `docs/todo/archive/mobile-nav.md` per the project's archive convention.

- [ ] **Step 2: Commit.** Message: `docs(todo): archive mobile-nav (shipped)`.

---

## Open questions

1. **Combo-item chevron icon source.** Plan above proposes a `mask-image` data-URI SVG so the icon recolors with `--cs-nav-chevron-color` and ships zero asset bytes. Alternative: an inline `<span>` with CSS-border triangle. Mask-image is cleaner and themeable but slightly heavier in CSS. Lean: mask-image. **Need confirmation.**

2. **Hamburger glyph.** Plan above proposes a pure-CSS three-border icon (`::before`/`::after` + element) for the same recoloring/zero-asset reason. Alternative: same mask-image SVG approach as the chevron, with a separate `--cs-nav-toggle-icon-color` token. Lean: pure CSS borders for the hamburger (it is structurally three lines, not an arbitrary glyph). **Need confirmation.**

3. **Should the `<summary>` toggle on `Enter`/`Space` ALSO scroll the drawer back to the top?** Native `<details>` does not. If a long drawer is opened mid-scroll, the user sees the open state but might not see the new items. Could add 2 lines to the inline script: on drawer open, `drawer.scrollIntoView({ block: 'nearest' })`. **Lean: yes, opt in.** Adds robustness, no failure mode. **Need confirmation.**

4. **Focus management on drawer open.** Native `<details>` keeps focus on the `<summary>` after open, which is correct keyboard behavior. No JS needed. Confirming this is the intent and that we are NOT trying to move focus into the first link automatically. **Lean: leave native behavior alone.**

5. **CartWidget tab order.** With CartWidget as a sibling of `<details>` in `<header>`, the source order is: store-name, drawer-summary, (drawer contents when open), cart-widget. On mobile this means tabbing goes: store -> hamburger -> [open it] -> nav links -> cart. That is correct. Confirming no preference for cart before nav.

---

## Self-review notes

- Spec coverage: every locked decision (1-10) maps to a test. Decision 7 (exclusive accordion) is decided in-plan with reasoning.
- No placeholders. Every CSS structure step lists actual selectors. Every test step shows actual test code or names a specific assertion. Every JS step shows the full snippet.
- Type consistency: `ResolvedNavItem` shape is unchanged. No new prop types. Class names used consistently (`cs-nav-drawer`, `cs-nav-toggle`, `cs-nav-chevron`, `cs-nav-dropdown-combo`, `cs-nav-dropdown-link`).
- Init parity: confirmed no changes to `bin/init.mjs` are needed; `nav` config shape unchanged.
- TDD: every task starts with a failing test before code.
