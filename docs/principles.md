# Design & Development Principles

## Product Strategy

- Mission: empower indie makers to sell direct without platform fees eating their margins.
- Seller experience comes first. The product serves makers, not developers.
- The product catalog (catalog.csv) is the single source of truth. Stripe is a downstream consumer for checkout.
- The storefront is one channel. The CSV drives the storefront directly. Stripe sync is a separate operation for enabling checkout.
- Zero config works. A CSV with SKU, Name, and Price produces a functional storefront. Images, overrides, and Stripe sync are optional enrichment.
- Static site + Stripe Checkout for single-product transactions. No backend needed.
- Multi-product cart is the one serverless function requirement.
- Storefront components will be built on BigSmall Blocks (shared component library, currently "The Construct"). Not integrated yet — will be introduced when moving from prototype to launch-ready.
- Catalog management is handled by Back Office (separate product, not part of this repo)

### Product Rules

These are non-negotiable. They don't change with scope, timeline, or priorities.

- **No feature gating. Ever.** Self-hosted gets every feature for free, forever. Hosted gets every base feature for free. You only pay commission when you're making money.
- **The architecture IS the pricing model.** Client-side generated URLs can only contain one product at a time. Multi-product cart requires exactly one serverless function. This technical constraint maps to product tiers.
- **Commission-based, not subscription.** Paid features are priced as incremental commission percentages, not flat monthly fees. Cost scales with revenue. Feels fair at every scale.
- **Open source is distribution, not charity.** Every self-hosted storefront is a billboard and proof of concept. The code being open is the growth strategy.
- **Compete on experience, not lock-in.** If someone forks the code and serves makers well, that's a win.
- **Infrastructure, not middleman.** Corner Store provides the technical layer for sellers to run their own stores. We never own the sale itself: no cross-seller carts, no hosted checkout, no order-of-record, no aggregated buyer relationship. Each seller owns their cart, their checkout, their receipt, and their customer relationship. This keeps the seller-buyer connection direct and keeps Corner Store outside marketplace facilitator regulations. The values case and the financial case point the same way.

### Product Tiers

| Tier | Infrastructure | Cart | Cost |
|------|---------------|------|------|
| Self-Hosted Simple | User hosts static site | Single product per checkout | Free forever |
| Self-Hosted Full | User hosts static site + serverless function | Multi-product cart | Free forever |
| Hosted Free | We host everything | Multi-product cart | Free up to $1K/mo revenue |
| Hosted Paid | We host everything | Multi-product cart | Commission-based above threshold |

## Content Architecture

- Prefer semantic elements. Generic wrappers (`div`, `span`) only when a semantic alternative is not available.
- Human and machine readable: Browsers, screen readers, web crawlers, and agents all benefit from well structured information.

### Markup Rules
- `body` is the page-level layout container. `header`, `main`, `footer` are its direct children.
- Annotate with microdata wherever possible.


## CSS Architecture

- Flexbox is the default layout model. Grid only where it earns its place.
- Two layers: `@layer package` (framework), `@layer theme` (user overrides).
- All values via design tokens. No hardcoded magic numbers.
- Token naming: thing first, property second, modifier last (`--cs-listing-border-radius`).
- Longhand properties only — no shorthand. Cleaner diffs, clearer intent.

### Theming

- Page-level semantic zones (`body`, `header`, `main`, `footer`) are selected directly. These are stable contracts.
- Component internals get stable class names as the theming interface. Elements behind them can change without breaking themes.


## Usability

- Keyboard navigation is a first-class input. Skip links, visible focus states, logical tab order.
- Source order follows reading order. CSS handles visual reordering.
- ARIA supplements semantics where browsers fall short.
- Every interactive element communicates its purpose.
- Status pages are minimal. Single action, no chrome.
