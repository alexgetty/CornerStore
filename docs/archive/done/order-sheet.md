# Order Sheet

## Archived — feature removed

Commit `212c53a` removed the OrderSheet component (`src/components/OrderSheet` and `src/pages/order-sheet.astro` deleted). Multi-item purchasing is now handled by the Cart component with PDF or Stripe checkout modes (see `docs/archive/done/cart-system.md` and the `checkout: 'pdf' | 'stripe'` config shipped in commit `2b904b3`). Archived as obsolete.

---

## Background

Wholesale buyers need a way to build custom multi-item orders beyond the curated starter packs on the storefront. The order sheet is a browsable catalog page with an interactive PDF download flow.

## Dependency

Requires the product catalog sync system (`catalog.csv` as source of truth). The order sheet is generated from all CSV rows where `Order Sheet = yes`.

## Design

Generated at build time as an HTML page on the site, styled to match the storefront. The PDF is generated from this same HTML, so print and web versions are always in sync.

**Browsing:** Buyers can browse the order sheet as a page on the site.

**Ordering flow:** The HTML page includes form elements (checkboxes, quantity inputs) so buyers can select items and set quantities, then download a pre-filled PDF order form to email. This is the multi-item ordering flow for wholesale buyers.

## Open Questions

- Client-side PDF generation approach (library choice, bundle size implications)
- Order form delivery method (email, or just download?)
- Order sheet product sorting/grouping (by category? alphabetical?)
