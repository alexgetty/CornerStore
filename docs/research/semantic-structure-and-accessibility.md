# Semantic Page Structure & Accessibility

## 1. Page Landmark Structure

All perceivable content must reside within a landmark. Screen reader users navigate by pulling up a landmark list and jumping between them. Content outside any landmark is invisible to this navigation pattern.

Source: WAI-ARIA Authoring Practices, Landmark Regions

### HTML-to-ARIA Landmark Mapping

| HTML Element | Implicit ARIA Role | Conditions |
|---|---|---|
| `<header>` | `banner` | Only when direct child of `<body>`. Loses role inside `<article>`, `<aside>`, `<main>`, `<nav>`, or `<section>`. |
| `<nav>` | `navigation` | Always. |
| `<main>` | `main` | Always. Must be unique per page. |
| `<footer>` | `contentinfo` | Only when direct child of `<body>`. Same nesting rules as `<header>`. |
| `<aside>` | `complementary` | Always. |
| `<section>` | `region` | Only when it has an accessible name (via `aria-label` or `aria-labelledby`). Without a name, it is semantically equivalent to `<div>`. |

Source: WAI-ARIA Authoring Practices, Landmark Regions; HTML Living Standard

**Rule: Use semantic HTML elements. Do not add redundant ARIA roles.** `<nav>` already has `role="navigation"` implicitly. Writing `<nav role="navigation">` is redundant. ARIA roles are only needed when semantic elements are unavailable or when nesting strips the implicit role.

**Rule: `banner`, `main`, `complementary`, and `contentinfo` must be top-level landmarks.** They should not be nested inside other landmarks (except that `navigation` can live inside `banner`).

## 2. Heading Hierarchy

**Rule: Heading levels must not skip ranks going downward.** An `<h1>` can be followed by `<h2>`, not `<h3>`. Skipping back up when closing a subsection is acceptable.

Source: HTML Living Standard; WCAG 1.3.1 (Level A)

**Rule: At least one heading should be `<h1>`.**

### The Document Outline Algorithm Is Dead

The HTML spec defined an algorithm where each `<section>` would reset heading levels. No browser ever implemented it. No screen reader respects it. Use a flat heading hierarchy based on document-wide nesting depth.

### Site Name vs Page Title

`<h1>` = page title. The store name lives in the header as a link, not a heading. `<h2>` for sections within page content.

**Rule: Heading levels in fixed regions (nav, sidebar, footer) must remain consistent across pages.**

Source: WAI Tutorials, Page Structure: Headings

## 3. Skip Navigation

**Rule: Provide a mechanism to bypass repeated blocks of content. (WCAG 2.4.1, Level A)**

Skip links still matter for sighted keyboard users. Landmarks and headings are navigable via screen reader shortcuts, but sighted keyboard users who do not use a screen reader have no access to those shortcuts.

Source: WebAIM, Skip Navigation Links

### Correct Implementation

```html
<a href="#main-content" class="cs-skip-link">Skip to main content</a>
<header>...</header>
<main id="main-content">...</main>
```

```css
.cs-skip-link {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.cs-skip-link:focus {
  position: fixed;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  padding: 0.75rem 1.5rem;
  background: #fff;
  color: #000;
  z-index: 9999;
  font-weight: 600;
}
```

**Rule: The skip link must be the first focusable element on the page.**

## 4. Navigation Accessibility

**Rule: When a page has multiple `<nav>` elements, each must have a unique accessible name.** Use `aria-label` when no visible heading exists.

**Rule: Do not include the landmark type in the label.** `<nav aria-label="Main navigation">` is announced as "Main navigation, navigation" — redundant. Use `<nav aria-label="Main">` instead.

Source: WAI-ARIA Authoring Practices, Landmark Regions

### Current page indication

**Rule: The link representing the current page must have `aria-current="page"`.** Only one element in a set should carry this attribute.

Source: WAI-ARIA 1.2 specification

### Footer Navigation

If the footer links are a meaningful navigation structure, `<nav>` is appropriate.

### Mobile Considerations

MPA focus resets to the top of the document on every page load — correct default behavior. Touch targets should be at least 24x24 CSS pixels (WCAG 2.5.8, Level AA); 44x44 is the safer AAA baseline.

## 5. Product Listing Accessibility

### Product Cards Need a List Wrapper

**Rule: Product listings should use `<ul>`/`<ol>` as their container.** Screen readers announce "list, 6 items", giving immediate context.

Source: Inclusive Components, Cards; WAI Tutorials, Content Structure

### Source Order: Heading Before Image

**Rule: Place the heading first in source order, before the image.** Use CSS `order` or grid placement to position the image visually above.

Source: Inclusive Components, Cards

### Images

**Rule: Product images are informative images. They must have descriptive alt text.** (WCAG 1.1.1, Level A)

Placeholder div `<div aria-label="...">` with no ARIA role is ignored by most screen readers. Either add `role="img"` or use `aria-hidden="true"` if decorative.

### Price Announcement

`aria-label` on role-less elements is unreliable. Use visually hidden text instead:

```html
<p class="cs-listing-price">
  <span class="cs-sr-only">Price:</span>
  <data value="25.00" itemprop="price">$25.00</data>
  <meta itemprop="priceCurrency" content="USD" />
</p>
```

### Buy Button Labeling

**Rule: Repeated generic link text ("Buy", "Buy", "Buy") fails WCAG 2.4.4 unless context makes each distinguishable.** Use `aria-label` with product name. Consider dropping "on Stripe" — implementation detail, not purchasing decision.

## 6. Content Page Accessibility

### FAQ Structure: Heading/Paragraph Pairs Win

`<details>`/`<summary>` has real problems: inconsistent SR announcements, find-in-page only works in Chromium, questions don't appear in heading navigation.

**Recommendation: Use heading/paragraph pairs.** Zero accessibility gotchas.

Source: Scott O'Hara, Details/Summary Accessibility testing

### Reading Order and Focus Order

**Rule: Focus order must match visual reading order. (WCAG 2.4.3, Level A)** CSS reordering creates mismatches.

## 7. External Links & Focus Management

**Rule: If the link opens in the same window, no special indication is required.** Stripe Checkout is a same-window redirect.

**Rule: If you use `target="_blank"`, indicate it** with text or `aria-label`, plus `rel="noopener"`.

MPA focus management is correct by default. No JavaScript needed.

## 8. Meta & Head

**Rule: Every page must have a unique, descriptive `<title>`. (WCAG 2.4.2, Level A)**

**Rule: Put unique page information first.** "Shipping Policy — Acme Candles" is better than "Acme Candles — Shipping Policy".

**Rule: `<html>` must have `lang` with a valid BCP 47 tag. (WCAG 3.1.1, Level A)**

**Rule: Do not use `user-scalable=no` or `maximum-scale=1`.** (WCAG 1.4.4, Level AA)

## 9. Schema.org Structured Data

Google's Required Properties for Merchant Listings:

| Property | Status |
|---|---|
| `name` | Required |
| `image` | Required |
| `offers.price` | Required |
| `offers.priceCurrency` | Required |
| `offers.url` | Recommended |
| `offers.availability` | Recommended |
| `description` | Recommended |

Google recommends JSON-LD over Microdata.

## 10. Audit Summary

### Critical (WCAG Level A failures)
1. Product listings have no list wrapper — WCAG 1.3.1
2. No skip navigation link — WCAG 2.4.1
3. Placeholder div uses `aria-label` without a role — WCAG 1.1.1

### High
4. No `aria-current="page"` on active nav link
5. Source order: image before heading in product cards
6. Price prefix uses `aria-label` on a role-less element
7. Status pages hardcode "Corner Store" in title

### Medium
8. Nav `aria-label` includes redundant "navigation"
9. Schema.org `offers.url` points to Stripe, not the product page
10. Schema.org availability missing
11. No meta description on any page
12. `<section>` element lacks accessible name
