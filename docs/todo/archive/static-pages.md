# Content Pages

## Context

Storefront needs content pages so makers can build trust, answer buyer questions, and tell their story. MDX files with frontmatter, rendered through a shared layout, with navigation driven by explicit config. Product listings are embedded via components — any page can contain products alongside prose.

## Architecture

### Directory Structure

`pages/` at project root — follows the existing pattern (`bundles/`, `theme/`). Each page is a single `.mdx` file.

```
my-store/
├── bundles/
├── pages/
│   ├── home.mdx
│   ├── about.mdx
│   ├── shipping-policy.mdx
│   ├── returns-policy.mdx
│   └── faq.mdx
├── theme/
├── src/pages/
├── cornerstore.config.js
└── ...
```

### One Page Type

Every page is MDX — markdown with embedded components. There is no distinction between "content pages" and "listings pages." A page that shows products is just a page with a `<Listings />` or `<Listing />` component in it. A page without products is just markdown. Same file format, same template, same routing.

This eliminates the need for separate nav item types, separate routing logic, or separate templates. The content defines what's on the page; the config defines where it lives in navigation.

### Config

```js
export default {
  name: 'My Candle Shop',
  home: 'home',

  nav: [
    { label: 'Shop', page: 'home' },
    { label: 'About', page: 'about' },
  ],

  footerNav: [
    { label: 'Shipping Policy', page: 'shipping-policy' },
    { label: 'Returns Policy', page: 'returns-policy' },
    { label: 'FAQ', page: 'faq' },
  ],
}
```

#### `home`

Top-level property. Names the page file that renders at `/`. This is a routing declaration, not a navigation one — the home page exists at root whether or not it appears in `nav`. A scaffolded `index.astro` reads this value and renders the corresponding MDX file.

#### Navigation

Two arrays: `nav` (main navigation) and `footerNav` (footer links). Array order = display order.

Each nav item is an object with `label` and `page`:
- `page` — resolves to a filename in `pages/` (without `.mdx`). Build-time warning if the file doesn't exist — same pattern as bundles.
- `path` — optional URL override for power users. Defaults to `/<page-value>`.

`getNav()` resolves URLs automatically: if a nav item's `page` matches `config.home`, its link resolves to `/`. Otherwise it resolves to `/<page>`. Labels are purely cosmetic — changing a label never changes a URL.

### Embedded Product Components

Two components ship in the package for embedding products in MDX pages:

**`<Listings />`** — Product grid. Renders multiple products.

```mdx
---
title: Welcome to My Shop
---

Hand-poured candles made in small batches.

<Listings />

Can't find what you're looking for? [Contact us](/contact) for custom orders.
```

Props (all optional):
- `category` — filter by product category
- `limit` — max number of products to display

**`<Listing />`** — Single product card. Embeds one product inline with content.

```mdx
---
title: The One That Started It All
---

I made this candle for my mom's birthday and everyone asked where to buy one.

<Listing product="lavender-fields" />

It's still our best seller two years later.
```

Props:
- `product` — product identifier (required)

Makers place these components anywhere in their markdown. Multiple components per page, in any order, interspersed with prose. The content wraps around the products — not the other way around.

Package components (`<Listings />`, `<Listing />`) are automatically available in all MDX files without imports. The `ContentPage` layout injects them into the MDX rendering pipeline. Makers never write import statements.

### Frontmatter

v1: `title` only. Used for the page heading and `<title>` tag. Nav label comes from config, not the page — this separation is intentional so the label can differ from the page title.

```yaml
---
title: About Us
---
```

### Content Page Template

`ContentPage` layout component. Wraps MDX content in:
- Nav header (store name + nav links from config)
- Content area with good typography defaults
- Footer nav

Style `h2` sections with enough breathing room that both prose pages and FAQ pages work in the same template. No layout variants needed. FAQ uses `## Question` / answer pattern — native markdown structure, no special handling.

CSS lives in `@layer package`. Users override in `@layer theme`.

## Package vs Scaffold Split

| Ships in NPM package | Scaffolded by `cornerstore init` |
|---|---|
| `loadPages()` utility (MDX processing, mirrors bundles pattern) | `pages/` directory with chosen stubs |
| `getNav()` utility (reads config, resolves pages to URLs) | `index.astro` (renders `config.home` page at `/`) |
| Nav component (main nav + footer nav) | `[slug].astro` dynamic route (all other pages) |
| `ContentPage` layout | `cornerstore.config.js` (populated from init answers) |
| Content page styles | |
| `<Listings />` component | |
| `<Listing />` component | |

## Init Flow

After Stripe key prompt, ask each page individually. All default yes.

```
  About page? (Y/n): y
  Shipping Policy? (Y/n): y
  Returns Policy? (Y/n): y
  FAQ? (Y/n): y
```

Each "yes" scaffolds:
1. An MDX stub in `pages/`
2. The corresponding nav entry (About → `nav`, policies + FAQ → `footerNav`)

Home page (`home.mdx`) is always scaffolded with a `<Listings />` component. `config.home` is set to `'home'`.

Init can also inspect the maker's Stripe products — if multiple categories are detected, offer to scaffold category pages with pre-configured `<Listings category="..." />` components.

## Content Stubs

Stubs are content guides written *to* the maker in second person. They coach the maker on what to put on each page. As the maker rewrites the file, the guide text gets replaced — the documentation is the file they're editing.

**Home** — Welcome message, brand intro, and a `<Listings />` component pre-loaded. The maker adds prose around the products to make the storefront feel personal.

**About** — Talk about your brand, how you got started, you as a person, and how it all fits together. Trust-building. The buyer wants to know there's a real human behind this.

**Shipping Policy** — Methods, costs, timelines, regions you ship to (and don't), tracking info. Reduces pre-purchase anxiety.

**Returns Policy** — What's returnable, time window, who pays return shipping, how refunds work. The page people look for when they're almost ready to buy.

**FAQ** — Uses `## Question?` / answer pattern. Suggest categories: ordering, product care, custom orders, wholesale. The stub shows the format and they repeat it.

Content guides will improve over time. The format is stable; the coaching gets better.

## Component Snippet Guide

A reference doc (shipped with the package or hosted in docs) with copy-paste snippets for common patterns. Makers don't need to learn MDX — they find the snippet, paste it in, change the values.

```
Show all products:           <Listings />
Show 6 products:             <Listings limit={6} />
Show one category:           <Listings category="candles" />
Feature a single product:    <Listing product="lavender-fields" />
```

## Dependencies

- `cornerstore.config.js` must be wired up (nothing reads it yet — see `Wire up config` todo)
- `@astrojs/mdx` integration

## Future

- `href` nav item type for external links
- Sub-navigation / grouped nav items
- `description` frontmatter for `<meta>` SEO
- Hero images, layout variants if needed
- Additional embeddable components (contact forms, featured collections, testimonials)
- Auto-scaffolding category pages from Stripe product metadata
