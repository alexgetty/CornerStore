# E-commerce Best Practices for Indie Storefronts

## Executive Summary

Corner Store's architecture already solves the two biggest conversion killers: page speed (static HTML) and checkout complexity (Stripe handles it). The remaining work is largely about trust, information architecture, and structured data.

Three surprising findings:
1. Privacy policy pages are essentially mandatory for legal compliance in 20+ US states, and we are not scaffolding one.
2. Pinterest is disproportionately important for handmade sellers and requires specific Open Graph markup we can generate automatically from Stripe data.
3. The "about the maker" page may be the single highest-leverage content page for indie stores specifically — more important than any product page optimization.

## Track 1: Architectural Decisions to Bake In

### Page Structure

**MUST HAVE: Privacy Policy page** — 20 US states have comprehensive privacy laws. If a store collects any personal data (Stripe Checkout does), a privacy policy is expected. California specifically requires it.

**MUST HAVE: Contact page or contact information** — NNGroup identifies visible contact info as a core trust signal. Buyers who cannot find contact info assume the store is not legitimate.

**SHOULD HAVE: Terms of Service page** — Protects the seller. Limitation of liability, IP rights for original designs.

| Page | Priority | Status |
|------|----------|--------|
| Home (product grid) | MUST | Exists |
| About | MUST | Exists |
| Shipping Policy | MUST | Exists |
| Returns Policy | MUST | Exists |
| FAQ | SHOULD | Exists |
| Privacy Policy | MUST | MISSING |
| Contact / Contact info | MUST | MISSING |
| Terms of Service | SHOULD | MISSING |

### Trust Signals

- **Stripe badge / secure checkout indicator** — 25% abandon over security concerns (Baymard). Leverage Stripe's brand recognition.
- **Consistent visual presentation** — Fixed aspect-ratio containers with `object-fit: cover` normalize inconsistent photography.
- **Visible policy links in footer** — Most expected location. Signals nothing to hide.

### Product Presentation

- **Fixed aspect ratio product images** — Industry standard 1:1 (square) for grids. 30% abandon if images are poor.
- **Price always visible on product card** — Minimum viable card: image, name, price.
- **Product detail pages** — NNGroup: "one product view is rarely adequate." Generate from Stripe data at build time.
- **Multiple product images** — Stripe allows multiple per product. Display all on detail pages.

### Checkout Flow

Corner Store's advantage: The two biggest abandonment reasons — complex checkout (22%) and account creation (26%) — are eliminated by Stripe Checkout.

- **Zero friction before Stripe redirect** — Buy button goes directly to Stripe. No interstitial, no modal, no login wall.
- **Shipping/returns info visible before checkout** — 48% abandon due to unexpected costs (Baymard). Small text near price/buy button.
- **Meaningful success page** — Confirm purchase, set expectations, provide contact.
- **Meaningful cancel page** — Recovery opportunity, not a dead end.

### Mobile

- **Mobile-first responsive design** — 76-78% of e-commerce traffic is mobile. For indie stores with social media discovery, likely higher.
- **Touch-friendly tap targets** — Minimum 44x44px for buy buttons and navigation.
- **Optimized images for mobile** — Use `<img srcset>` or `<picture>` with multiple sizes.

### Page Speed

Static sites already solve this. Remaining priorities:
- **Image optimization pipeline** — Build-time resize/WebP. Target ~300KB per grid image. `loading="lazy"` on below-fold images.
- **Preconnect to Stripe** — `<link rel="preconnect" href="https://buy.stripe.com">` shaves 100-300ms.
- **System font stack by default** — Custom fonts block render.

### SEO and Structured Data

- **Schema.org Product JSON-LD** — 20-40% higher CTR. Auto-generated from Stripe data.
- **Open Graph + Pinterest Rich Pin meta** — `og:type="product"` with price/currency. Pinterest is the primary discovery platform for handmade/artisan products. Auto-generated from Stripe.
- **Organization schema on homepage** — Brand search visibility.
- **Canonical URLs and meta descriptions** — Auto-generate from Stripe descriptions.

## Track 2: Content Guidance for Makers

### About Page: The Trust Page

For indie stores, the about page IS the primary trust mechanism. Etsy's research: buyers "long for products made by an actual person."

What buyers want: photo of the maker, the origin story, process transparency, evidence of investment in the business.

### Shipping Policy

FTC Mail Order Rule: ship within promised timeframe or within 30 days. Stub should prompt: processing time (critical for made-to-order), methods, costs, domestic vs international, tracking.

### Returns Policy

Clear returns policies increase sales without increasing return volume. 50% of consumers name easy returns as a positive experience signal. California requires clear display.

For handmade: custom items often non-returnable (must state clearly), who pays return shipping, defective/damaged handling.

### FAQ

Pre-populate with common indie store questions: shipping timeline, custom orders, materials, size/color, gift wrapping, international, care instructions, wholesale.

### Product Photography Guidance

Minimum 4 images per product. Square crop (1:1). Minimum 1500x1500px. Consistent lighting. Show scale.

## Track 3: Optional Templates

- **Collection/drop pages** — Stripe metadata field `collection`, build-time grouping. "Sales on a single drop can be 10x an always-on shop."
- **Wholesale inquiry page** — MOQ info, process, email contact. Pure MDX.
- **Custom orders page** — Types accepted, process steps, timeline, pricing guidance.
- **Markets/events page** — Upcoming events, builds credibility.
- **Press/testimonials** — Social proof. For new stores, the about page IS the social proof until reviews accumulate.

## Where Research Contradicts Assumptions

- **"Product reviews are essential"** — For indie stores with 5-50 products, an empty review section damages trust. The about page matters more. Do not build a review system.
- **"A shopping cart is necessary"** — For small catalogs, "Buy Now" outperforms "Add to Cart." 43% of cart abandoners were "just browsing." Direct Payment Link eliminates this.
- **"Free shipping is necessary"** — Transparency matters more. "Unexpected" is the key word in abandonment data. Stating costs clearly beats hidden costs.
- **"SEO structured data is nice-to-have for small stores"** — Proportionally MORE valuable. Rich results are one of the few equalizers against large retailers. And we generate it from Stripe automatically.

## Implementation Priority

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | Schema.org Product JSON-LD | MUST | Low |
| 2 | Open Graph + Pinterest Rich Pin meta | MUST | Low |
| 3 | Privacy policy scaffold | MUST | Low |
| 4 | Image optimization pipeline | MUST | Medium |
| 5 | Contact info in footer | MUST | Low |
| 6 | Fixed aspect-ratio product images | MUST | Low |
| 7 | Stripe security badge | MUST | Low |
| 8 | Mobile-first responsive grid | MUST | Medium |
| 9 | About page stub improvements | MUST | Low |
| 10 | Product detail pages | SHOULD | Medium |
| 11 | Shipping/returns stub improvements | SHOULD | Low |
| 12 | Preconnect to Stripe domains | SHOULD | Trivial |
| 13 | Success/cancel page improvements | SHOULD | Low |
| 14 | Terms of service scaffold | SHOULD | Low |
| 15 | FAQ with FAQPage schema | SHOULD | Medium |
| 16 | Collection/drop pages | NICE | Medium |
| 17 | Press/testimonials template | NICE | Low |
| 18 | Custom orders template | NICE | Low |
| 19 | Wholesale inquiry template | NICE | Low |
| 20 | Events/markets template | NICE | Low |
