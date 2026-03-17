# Storefront Restructure

Comprehensive restructure covering markup, CSS architecture, accessibility, content loading, new page scaffolds, and SEO. Each phase leaves the site in a working state.

Target markup templates are in `docs/markup/`. These are the gold standard — implementation works backward from these.

## Decisions Made

- **Microdata over JSON-LD** — structured data belongs in the markup, not in a separate blob. HTML marks up content with meaning. One source of truth.
- **No wrapper divs** — semantic elements are the styling hooks. No `.cs-main`, `.cs-prose`, `.cs-nav` wrappers. `header`, `main`, `footer`, `nav`, `article`, `section` are the selectors.
- **No `<figure>` on product images** — product images are simple `<img>`, not figures. `<figure>` is for content that benefits from a caption.
- **Price markup** — `<span itemprop="priceCurrency" content="USD">$</span><data value="25.00" itemprop="price">25.00</data>`. No sr-only prefix. In a product card, a dollar amount is obviously a price.
- **Availability as visible text** — `<span itemprop="availability" content="https://schema.org/InStock">In stock</span>`. Real content, not hidden metadata.
- **Skip link target** — `id="main-content"` (namespaced to avoid collisions with user themes)
- **`<!DOCTYPE html>`** — obviously
- **Buy button aria-label** — `"Buy Lavender Fields — $25.00"` (dynamic: name + price, no "on Stripe")

## Resolved (from red team review)

- **Status page navigation** — keep minimal. Single "Go to homepage" link. No header/footer.
- **Image placeholder** — `<div class="cs-image-placeholder">`. Empty div, no ARIA needed. Purely visual layout to keep card heights consistent. Screen readers skip it.
- **CSS width strategy** — still open, Phase 1 work. Tokens on semantic elements, no wrapper classes.
- **Nav width shift bug** — still open, Phase 1 work. New markup should resolve by sharing the same max-width on `header`/`main`/`footer`.

## Dependency Graph

```
Phase 0 (Markup Templates) ← IN REVIEW — docs/markup/
    |
Phase 1 (CSS Foundation — rebuild from markup templates)
    |
    +---> Phase 2 (A11y Critical - WCAG A)
    |         |
    |         +---> Phase 3 (A11y High + Medium)
    |
    +---> Phase 4 (Content Collections Migration)
              |
              +---> Phase 5 (New Page Scaffolds)
                        |
                        +---> Phase 6 (SEO + Meta)
                                   |
                                   +---> Phase 7 (E-commerce Polish)
```

Phases 2-3 and Phase 4 can run in parallel after Phase 1.

---

## Phase 0: Markup Templates (IN REVIEW)

Finalize the gold-standard HTML for all page types. These define what the built output must look like. Everything else works backward from here.

**Templates:** `docs/markup/`
- `home.html` — prose + product grid
- `content.html` — pure prose (about, FAQ, policies)
- `content-with-product.html` — prose with embedded single product
- `status.html` — 404/success/cancel

**Status:** Red team review partially complete. Remaining open items listed above.

---

## Phase 1: CSS Foundation

Rebuild styles to match the new markup templates. No wrapper divs means the styling strategy changes entirely.

### Width hierarchy (all via tokens)
- `header`, `main`, `footer` — `max-width: var(--cs-main-width)` + centering + padding
- Prose text elements (`main > p`, `main > h1`, `main > h2`, etc.) — `max-width: var(--cs-prose-width)` (new token)
- Product grid (`main > section[aria-label="Products"]`) — full `main` width
- Nav — shares `header` width, no separate constraint

### Key changes from current CSS
- Delete `.cs-main` utility class — replaced by styles on semantic elements
- Delete `.cs-prose` — prose width applied directly to text elements
- Delete `.cs-nav` — nav layout via `header` flex
- Delete `src/styles/pages/index.css` — dead code
- Remove `./styles/pages/index.css` from package.json exports
- All widths use tokens, no hardcoded values

### Files

| File | Action |
|------|--------|
| `src/styles/defaults.css` | Remove `.cs-main`, add new token `--cs-prose-width`, add styles on `header`/`main`/`footer` |
| `src/styles/pages/index.css` | **Delete** |
| `src/layouts/ContentPage.css` | Rewrite — prose width on text elements, no wrapper selectors |
| `src/layouts/ContentPage.astro` | Remove wrapper divs, match markup templates |
| `src/components/Nav/Nav.astro` | Remove wrapper divs, match markup templates |
| `src/components/Nav/Nav.css` | Rework — style `header` and `nav` directly |
| `src/components/Listings/Listings.css` | Rework grid selectors |
| `src/components/Listing/Listing.css` | Update selectors if class names change |
| `src/layouts/Base.astro` | Add `<!DOCTYPE html>`, add skip link |
| `src/styles/defaults.css` | Add `.cs-skip-link` and `.cs-sr-only` |
| `package.json` | Remove `./styles/pages/index.css` export |

### Tests
None — CSS/Astro only. Visual regression check via build + screenshot comparison.

---

## Phase 2: Accessibility — WCAG Level A (Critical)

Three fixes. Some may already be addressed by Phase 1 markup changes (skip link, list wrapper). Verify and fill gaps.

### 2a: Product listings `<ul>` wrapper (WCAG 1.3.1)

```html
<section aria-label="Products">
  <ul role="list">
    <li><article>...</article></li>
  </ul>
</section>
```

`role="list"` needed because `list-style: none` causes Safari/VoiceOver to strip list semantics.

### 2b: Skip navigation link (WCAG 2.4.1)

First focusable element in `<body>`: `<a href="#main-content" class="cs-skip-link">Skip to main content</a>`. Target: `<main id="main-content">`.

### 2c: Image placeholder gets `role="img"` (WCAG 1.1.1)

For products with no image: `<div role="img" aria-label="No image available for [product name]">`. Without `role`, `aria-label` is ignored.

### Files

| File | Action |
|------|--------|
| `src/components/Listings/Listings.astro` | `<ul>` wrapper, `aria-label` on section |
| `src/components/Listings/Listings.css` | Grid on `<ul>`, list reset |
| `src/layouts/Base.astro` | Skip link (may already be done in Phase 1) |
| `src/layouts/ContentPage.astro` | `id="main-content"` on `<main>` (may already be done in Phase 1) |
| `src/components/StatusPage/StatusPage.astro` | `id="main-content"` on `<main>` |
| `src/components/Listing/Listing.astro` | `role="img"` on placeholder |

### Tests
None — Astro/CSS only.

---

## Phase 3: Accessibility — High + Medium

### 3a: `aria-current="page"` on active nav link

Nav gets `currentPath` prop from `Astro.url.pathname`. Links get `aria-current={item.href === currentPath ? 'page' : undefined}`.

### 3b: Source order — heading before image

DOM order: heading first, image second. CSS `order: -1` on image to position visually above.

### 3c: Price markup

Replace `aria-label` on `<data>` with Microdata markup:
```html
<p itemprop="offers" itemscope itemtype="https://schema.org/Offer">
  <span itemprop="priceCurrency" content="USD">$</span><data value="25.00" itemprop="price">25.00</data>
  <span itemprop="availability" content="https://schema.org/InStock">In stock</span>
</p>
```

No sr-only price prefix. Dollar amount in a product card is self-evident.

### 3d: Status pages use config.name

`404.astro`, `success.astro`, `cancel.astro` use `loadConfig()` and `config.name`.

### 3e: Nav `aria-label` simplified

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

## Phase 4: Content Collections Migration

Replace `loadPages()` + `import.meta.glob` with Astro 5 Content Collections.

### Architecture Change

**Current:** `loadPages()` reads `pages/*.mdx` with `readdir` + `gray-matter`. `import.meta.glob('/pages/*.mdx')` in page templates gets MDX renderer.

**New:** `src/content.config.ts` defines a `pages` collection with `glob()` loader pointing to `./pages/`. `getCollection('pages')` and `render()` replace both.

### Key Details

- `content.config.ts` must live in user's project (scaffolded by init)
- `glob({ pattern: '**/*.mdx', base: './pages' })` points to project-root `pages/` directory
- Zod schema validates frontmatter at build time
- `render()` returns `{ Content }` — component injection via `<Content components={{ Listings, Listing }} />` still works
- Title fallback logic (frontmatter → nav label → slug) needs to live somewhere. Extract a small `resolvePageTitle` utility for testability, or handle inline in templates.

### Breaking Change

`loadPages` removed from public API. `PageData` type removed. Bump to `0.2.0`.

### Files

| File | Action |
|------|--------|
| `src/content.config.ts` | **Create** (also scaffolded by init) |
| `src/pages/index.astro` | Rewrite to use `getCollection`/`render` |
| `src/pages/[slug].astro` | Rewrite to use `getCollection`/`render` |
| `src/lib/storefront/pages.ts` | **Delete** |
| `src/lib/storefront/index.ts` | Remove `loadPages`, `PageData` exports |
| `src/lib/storefront/types.ts` | Remove `PageData` interface |
| `tests/unit/storefront/pages.test.ts` | **Delete** |
| `bin/init.mjs` | Scaffold `content.config.ts`, update page templates |
| `package.json` | Bump to `0.2.0` |

### Tests
- Delete `pages.test.ts`
- TDD for `resolvePageTitle` utility if extracted to `.ts`

### Risk
Highest-risk phase. Feature branch, full build verification before merging.

---

## Phase 5: New Page Scaffolds

### 5a: Privacy Policy (must-have — legal requirement in 20+ US states)

New stub at `bin/stubs/privacy-policy.mdx`. Added to `footerNav` by default.

### 5b: Terms of Service (should-have)

New stub at `bin/stubs/terms-of-service.mdx`. Added to `footerNav` by default.

### 5c: Contact info in footer (must-have)

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

## Phase 6: SEO + Meta

### 6a: Meta description

Add `description` to content schema (Zod). `Base.astro` renders `<meta name="description">` when provided.

### 6b: Stripe preconnect

`<link rel="preconnect" href="https://buy.stripe.com">` in `Base.astro` `<head>`.

### 6c: Open Graph tags

`og:title`, `og:type`, `og:description`, `og:image`, `og:url`. Pinterest Rich Pin meta for product contexts. Auto-generated from existing data.

### Files

| File | Action |
|------|--------|
| `src/layouts/Base.astro` | Add description, OG tags, preconnect |
| `src/layouts/ContentPage.astro` | Pass description prop through |
| `src/content.config.ts` | Add `description` to Zod schema |
| `bin/stubs/*.mdx` | Add `description` frontmatter to all stubs |

### Tests
None — Astro template changes only.

---

## Phase 7: E-commerce Polish

### 7a: Success page

Richer messaging: confirm purchase, set expectations, show contact info from config.

### 7b: Cancel page

Recovery-oriented messaging. Not a dead end.

### Files

| File | Action |
|------|--------|
| `src/components/StatusPage/StatusPage.astro` | Add optional props for richer content |
| `src/components/StatusPage/StatusPage.css` | Style new elements |
| `src/pages/success.astro` | Richer messaging with config.contact |
| `src/pages/cancel.astro` | Recovery-oriented messaging |
| `bin/init.mjs` | Update scaffolded success/cancel pages |

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

## References

- `docs/markup/` — target markup templates
- `docs/research/semantic-structure-and-accessibility.md`
- `docs/research/ecommerce-best-practices.md`
