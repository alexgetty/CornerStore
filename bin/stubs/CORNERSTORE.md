# Corner Store Reference

Quick reference for components and config. This file is ignored by the Astro build.

---

## Page Frontmatter

Fields available in any `pages/*.mdx` file:

```md
---
title: Page Title           # shown in <title> and nav
description: Short blurb    # SEO meta description
hasExplicitTitle: true      # set true to suppress the auto-generated <h1>
---
```

---

## Components

### `<Hero>`

```mdx
<Hero image="/images/banner.jpg" imageAlt="Jars of honey on a wooden table">
  ## Welcome to the shop

  We make small-batch hot sauces in Portland, OR.
</Hero>
```

| Prop | Required | Description |
|------|----------|-------------|
| `image` | yes | Path to image, relative to `public/` |
| `imageAlt` | no | Descriptive alt text; defaults to empty |

Slot content renders as markdown inside the hero overlay.

---

### `<Listings>`

Minimal — uses all defaults from config:

```mdx
<Listings />
```

All props:

```mdx
<Listings
  limit={6}
  mode="card"
  toggle={true}
  categories={["Hot Sauce", "Merch"]}
  featured={true}
  sort="name"
  order="asc"
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `limit` | number | Max products to show |
| `mode` | `"card"` \| `"table"` | Active view; must be enabled in `listings.views` |
| `toggle` | boolean | Show card/table toggle button (requires both views enabled in config) |
| `categories` | string[] | Filter by category name; must match catalog exactly |
| `featured` | boolean | Show only products with `Featured` set in catalog |
| `sort` | string | Sort field: `"name"`, `"price"`, or any catalog column |
| `order` | `"asc"` \| `"desc"` | Sort direction; defaults to `"asc"` |

---

### `<Listing>`

Single-product spotlight. Looks up by SKU or name:

```mdx
<Listing product="SAUCE-001" />

<Listing product="ghost-pepper-hot-sauce" />
```

| Prop | Description |
|------|-------------|
| `product` | Exact SKU, exact product name, or hyphenated name slug |

---

### `<Link>`

Generates an `<a>` to an internal page or category. Link text is derived automatically.

```mdx
<Link page="about" />

<Link category="Hot Sauce" />
```

| Prop | Description |
|------|-------------|
| `page` | Slug matching a file in `pages/` (e.g. `"about"` for `pages/about.mdx`) |
| `category` | Exact category name from catalog; links to the auto-generated category page |

---

## Category Page Overrides

By default, each catalog category gets an auto-generated page at `/category/[slug]` that shows all products in that category. Create a file in `pages/category/` to override it with custom content.

The filename must match the category slug (lowercase, hyphens): a category named `"Hot Sauce"` uses `hot-sauce.mdx`.

```mdx
---
title: Hot Sauce           # optional — defaults to title-cased slug
description: All the heat  # optional — SEO meta description
---

Our small-batch hot sauces, made in Portland, OR.

<Listings categories={["Hot Sauce"]} featured={true} />
```

Available components: `<Listings>` and `<Listing>`. Frontmatter follows the same rules as regular pages.

---

## Product Description Overrides

By default, the product description shown on the storefront comes from the `Description` column in `catalog.csv`. Create a markdown file in `products/` to replace it with rich content.

The file must declare the `sku` frontmatter field matching the SKU in your catalog. The CSV description is still used for Stripe.

```md
---
sku: SAUCE-001
image_alts:
  sauce-001-front.jpg: Bottle of ghost pepper hot sauce, front label
  sauce-001-pour.jpg: Hot sauce being poured onto tacos
---

**Ghost Pepper Hot Sauce** is our hottest offering, fermented for 30 days
and finished with a touch of mango.

- Heat level: 9/10
- 5 oz bottle
- Pairs well with anything that can take it
```

| Field | Required | Description |
|-------|----------|-------------|
| `sku` | yes | Must match a SKU in `catalog.csv`; file is skipped if it doesn't |
| `image_alts` | no | Map of image filename to alt text for accessibility |

The markdown body overrides the CSV `Description` field on the storefront. Delete the file to revert to the CSV description.

---

## `cornerstore.config.js`

```js
export default {
  // Required
  name: "My Store",           // store display name
  home: "home",               // which pages/*.mdx is the home page

  // Navigation — each item needs label + one of: page, path, or dropdown
  nav: [
    { label: "Shop",     page: "home" },
    { label: "About",    page: "about" },
    { label: "Blog",     path: "/blog" },                // external or custom path
    { label: "Products", dropdown: "categories" },        // auto-populates from catalog
    { label: "More",     dropdown: ["about", "faq"] },   // manual dropdown list
  ],
  footerNav: [
    { label: "Shipping Policy",  page: "shipping-policy" },
    { label: "Returns Policy",   page: "returns-policy" },
    { label: "FAQ",              page: "faq" },
    { label: "Privacy Policy",   page: "privacy-policy" },
    { label: "Terms of Service", page: "terms-of-service" },
  ],

  // Optional store details
  contact: "hello@mystore.com",    // shown on order PDF
  logo: "/logo.svg",               // path relative to public/

  // Listings
  listings: {
    views: ["card"],               // ["card"], ["table"], or ["card", "table"]
  },

  // Cart / wholesale
  minCartSize: 50,                 // minimum order total in dollars (wholesale)
  wholesaleMargin: 0.5,            // wholesale price = retail × margin (0.5 = 50% off)

  // Shipping
  shippingFlat: 9.99,              // flat shipping rate added at checkout
  shippingFreeThreshold: 100,      // orders above this amount get free shipping

  // Checkout
  checkout: "pdf",                 // "pdf" (email order form) or "stripe"
  checkoutUrl: "https://your-server.example.com/api/checkout",  // stripe only
}
```
