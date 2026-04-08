# Storefront Restructure

Comprehensive restructure covering markup, CSS architecture, accessibility, content loading, new page scaffolds, and SEO. Each phase leaves the site in a working state.

Target markup templates are in `docs/markup/`. These are the gold standard — implementation works backward from these.

## Dependency Graph

```
Phase 0 (Design & Development Principles — document before building)
    |
Phase 1 (Markup Templates) ← IN REVIEW — docs/markup/
    |
Phase 2 (CSS Foundation — rebuild from markup templates)
    |
    +---> Phase 3 (A11y Critical - WCAG A)
    |         |
    |         +---> Phase 4 (A11y High + Medium)
    |
    +---> Phase 5 (Content System Hardening)
              |
              +---> Phase 6 (New Page Scaffolds)
                        |
                        +---> Phase 7 (SEO + Meta)
                                   |
                                   +---> Phase 8 (E-commerce Polish)
```

Phases 3-4 and Phase 5 can run in parallel after Phase 2.

---

## Phase 0: Design & Development Principles (DONE)

See [`docs/principles.md`](../principles.md).

---

## Phase 1: Markup Templates (IN REVIEW)

Finalize the gold-standard HTML for all page types. These define what the built output must look like. Everything else works backward from here.

**Templates:** `docs/markup/`
- `home.html` — prose + product grid
- `content.html` — pure prose (about, FAQ, policies)
- `content-with-product.html` — prose with embedded single product
- `status.html` — 404/success/cancel

**Status:** Red team review partially complete. Remaining open items listed above.

---

## Phase 2: CSS Foundation

Rebuild styles to match the new markup templates. No wrapper divs means the styling strategy changes entirely.

### Layout model
- **Flexbox is the default layout model.** Grid only where it genuinely earns its place (e.g. product grid `auto-fill` columns).
- **Use longhand flex properties** (e.g. `flex-grow: 1`, not `flex: 1`) — cleaner diffs, clearer intent.
- `body` — flex column, `min-height: 100vh`. This is the page-level layout container.
- `header`, `main`, `footer` — `max-width: var(--cs-main-width)` + `align-self: center` (flexbox centering, not `margin: 0 auto`) + `width: 100%` + padding.
- `main` — `flex-grow: 1`. Main is main — it claims all available space. Footer sits where it lands naturally.

### Width hierarchy (all via tokens)
- `header`, `main`, `footer` — `max-width: var(--cs-main-width)` + flexbox centering + padding
- Prose text elements (`main > p`, `main > h1`, `main > h2`, etc.) — `max-width: var(--cs-prose-width)` (new token)
- Product grid (`main > section[aria-label="Products"]`) — full `main` width
- Nav — shares `header` width, no separate constraint

### Key changes from current CSS
- Delete `.cs-main` utility class — replaced by flexbox layout on semantic elements
- Delete `.cs-prose` — prose width applied directly to text elements
- Delete `.cs-nav` — nav layout via `header` flex
- Delete `src/styles/pages/index.css` — dead code
- Remove `./styles/pages/index.css` from package.json exports
- All widths use tokens, no hardcoded values
- `body` becomes a flex column (page-level layout)
- Centering via `align-self: center` instead of `margin: 0 auto`

### Files

| File | Action |
|------|--------|
| `src/styles/defaults.css` | Remove `.cs-main`, add new token `--cs-prose-width`, add styles on `header`/`main`/`footer` |
| `src/styles/pages/index.css` | **Delete** |
| `src/layouts/ContentPage.css` | Rewrite — prose width on text elements, no wrapper selectors |
| `src/layouts/ContentPage.astro` | Remove wrapper divs, match markup templates |
| `src/components/Nav/Nav.astro` | Remove wrapper divs, match markup templates |
| `src/components/Nav/Nav.css` | Rework — class-based selectors per theming principles (component internals use stable class names) |
| `src/components/Listings/Listings.css` | Rework grid selectors |
| `src/components/Listing/Listing.css` | Update selectors if class names change |
| `src/layouts/Base.astro` | Add `<!DOCTYPE html>`, add skip link |
| `src/styles/defaults.css` | Add `.cs-skip-link` and `.cs-sr-only` |
| `package.json` | Remove `./styles/pages/index.css` export |

### Tests
None — CSS/Astro only. Visual regression check via build + screenshot comparison.

---

## Phase 3: Accessibility — WCAG Level A (Critical)

Two fixes. Some may already be addressed by Phase 2 markup changes (skip link, list wrapper). Verify and fill gaps.

### 3a: Product listings `<ul>` wrapper (WCAG 1.3.1)

```html
<section aria-label="Products">
  <ul role="list">
    <li><article>...</article></li>
  </ul>
</section>
```

`role="list"` needed because `list-style: none` causes Safari/VoiceOver to strip list semantics.

### Files

| File | Action |
|------|--------|
| `src/components/Listings/Listings.astro` | `<ul>` wrapper, `aria-label` on section |
| `src/components/Listings/Listings.css` | Grid on `<ul>`, list reset |
| `src/components/StatusPage/StatusPage.astro` | `id="main-content"` on `<main>` |

### Tests
None — Astro/CSS only.

---

## Phase 4: Accessibility — High + Medium

### 4a: `aria-current="page"` on active nav link

Nav gets `currentPath` prop from `Astro.url.pathname`. Links get `aria-current={item.href === currentPath ? 'page' : undefined}`.

### 4b: Source order — heading before image

DOM order: heading first, image second. CSS `order: -1` on image to position visually above.

### 4c: Price markup

Replace `aria-label` on `<data>` with Microdata markup:
```html
<p itemprop="offers" itemscope itemtype="https://schema.org/Offer">
  <span itemprop="priceCurrency" content="USD">$</span><data value="25.00" itemprop="price">25.00</data>
</p>
```

No sr-only price prefix. Dollar amount in a product card is self-evident.

### 4d: Status pages use config.name

`404.astro`, `success.astro`, `cancel.astro` use `loadConfig()` and `config.name`.

### 4e: Nav `aria-label` simplified

`"Main navigation"` → `"Main"`. `"Footer navigation"` → `"Footer"`.

### Files

| File | Action |
|------|--------|
| `src/components/Nav/Nav.astro` | `currentPath` prop, `aria-current="page"`, simplified `aria-label` |
| `src/layouts/ContentPage.astro` | Pass `Astro.url.pathname` to Nav |
| `src/components/Listing/Listing.astro` | DOM reorder, Microdata price markup |
| `src/components/Listing/Listing.css` | `order: -1` on image |
| `src/pages/404.astro` | Use `config.name` |
| `src/pages/success.astro` | Use `config.name` |
| `src/pages/cancel.astro` | Use `config.name` |

### Tests
None — Astro/CSS only.

---

## Phase 5: Content System Hardening

Invest in `loadPages()` as the portable content abstraction. It's vanilla Node (`readdir` + `gray-matter`) — works in Astro, Express, or any future rendering layer. The Astro-specific rendering (`import.meta.glob`) stays in page templates where it belongs. Data loading is portable. Rendering isn't.

### Changes

- Add Zod schema for frontmatter validation (replaces ad hoc type checks)
- Extract `resolvePageTitle` as a standalone testable utility
- Add `description` to `PageData` (optional string — used by Phase 7 for SEO meta)

### Files

| File | Action |
|------|--------|
| `src/lib/storefront/pages.ts` | Zod validation, extract `resolvePageTitle`, add `description` to return data |
| `src/lib/storefront/types.ts` | Add `description` to `PageData` |
| `tests/unit/storefront/pages.test.ts` | TDD: Zod validation, `resolvePageTitle` extraction, `description` field |

### Tests
- TDD for `resolvePageTitle` utility
- TDD for Zod frontmatter validation (valid, missing fields, wrong types)
- TDD for `description` in `PageData`

---

## Phase 6: New Page Scaffolds

### 6a: Privacy Policy (must-have — legal requirement in 20+ US states)

New stub at `bin/stubs/privacy-policy.mdx`. Added to `footerNav` by default.

### 6b: Terms of Service (should-have)

New stub at `bin/stubs/terms-of-service.mdx`. Added to `footerNav` by default.

### 6c: Contact info in footer (must-have)

Add `contact` field to `StoreConfig` (optional email string). Rendered in footer. Init prompts for email.

### Files

| File | Action |
|------|--------|
| `bin/stubs/privacy-policy.mdx` | **Create** |
| `bin/stubs/terms-of-service.mdx` | **Create** |
| `bin/init.mjs` | Add prompts for privacy, terms, contact email |
| `src/lib/storefront/types.ts` | Add `contact` to `StoreConfig` |
| `src/lib/storefront/config.ts` | Parse `contact` field |
| `src/layouts/ContentPage.astro` | Render contact email in footer |
| `src/layouts/ContentPage.css` | Style footer contact |
| `tests/unit/storefront/config.test.ts` | TDD: `contact` parsing tests |
| `cornerstore.config.js` | Dev copy: add `contact` field |

### Tests
TDD for `contact` field in `parseConfig`.

---

## Phase 7: SEO + Meta (DONE)

### 7a: Meta description — DONE

`Base.astro` renders `<meta name="description">` when provided. `ContentPage.astro` passes `description` prop through. All stubs have `description` frontmatter.

### 7b: Stripe preconnect — DONE

`<link rel="preconnect" href="https://buy.stripe.com">` in `Base.astro` `<head>`.

### 7c: Open Graph tags — DONE (partial)

`og:title`, `og:type`, `og:description` rendered in `Base.astro`. Props exist for `og:image` and `og:url` but no pages pass them yet. Deferred: `og:image` (needs logo config), `og:url` (needs `Astro.site`), Pinterest Rich Pin meta.

### Tests
None — Astro template changes only.

---

## Phase 8: E-commerce Polish (DONE)

### 8a: Success page — DONE

Richer messaging with confirmation heading, receipt notice, secondary message, contact email from config.

### 8b: Cancel page — DONE

Recovery-oriented messaging. "No charge was made." with "Continue shopping" link.

### Tests
None — Astro/CSS only.

---

## Not In This Plan

- Product detail pages (separate feature)
- Image optimization pipeline (build-time resize/WebP)
- Collection/drop pages, wholesale, custom orders (nice-to-haves)
- Stripe security badge (needs design decision)
- Mobile responsive improvements (needs design pass)
- Category filtering for `<Listings />` (see `docs/todo/category-filtering.md`)
- Listings directory unification (see `docs/todo/unify-listings-directory.md`)
- Logo config: single `logo` field in config, used in header component and as `og:image` fallback. Needs `Astro.site` for absolute URL resolution.
- `og:url`: plumb `Astro.url` through to `Base.astro` for canonical OG URL
- Pinterest Rich Pin meta for product contexts

## References

- `docs/markup/` — target markup templates
- `docs/research/semantic-structure-and-accessibility.md`
- `docs/research/ecommerce-best-practices.md`
