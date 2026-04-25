# Order Sheet and Cart

## Archived — feature removed and superseded

Commit `212c53a` removed the OrderSheet component entirely. The multi-item purchasing problem described in Stage 1 is now solved by the Cart component with PDF/Stripe checkout modes: a maker can run `checkout: 'pdf'` to generate downloadable order forms (Stage 1's intent) or `checkout: 'stripe'` for server-backed checkout (Stages 2/3's intent). See the checkout config shipped in commit `2b904b3` and scaffolded in `9b6f330`. Archived as obsolete.

---

Multi-item purchasing for Corner Store. Three stages, each building on the last. Stage 1 is the launch blocker. Stages 2 and 3 are future work.

## The Problem

Every listing links to a Stripe Payment Link. One item, one checkout. Buyers who want multiple items go through checkout multiple times. There's no way to place a bulk order, and no way to browse-then-buy-all-at-once.

## Stage 1: PDF Order Sheet (Launch Blocker)

A downloadable, printable order sheet generated from the Stripe catalog. Buyers fill in quantities, email it to the seller. Seller invoices manually. No server needed. Fits the existing static site architecture.

This is how a lot of makers already work: printed line sheets at markets, PDF catalogs emailed to wholesale accounts. Corner Store just generates it automatically from the same Stripe data that powers the storefront.

### What It Does

- Build-time: `getListings()` data feeds an HTML template styled for print
- The template renders a table: product name, description, unit price, quantity field (blank), line total (blank)
- Subtotal / notes / contact fields at the bottom
- Seller's store name and contact email from config
- Page on the site (e.g. `/order-sheet`) with a "Download Order Sheet" button
- Client-side: HTML-to-PDF generation in the browser. No server.

### Data Flow

```
Stripe catalog
    |
    v
getListings() at build time
    |
    v
Order sheet page (Astro component)
    |
    v
HTML table styled for print (@media print)
    |
    v
Client-side PDF generation (browser print / jsPDF / html2pdf.js)
    |
    v
Buyer downloads, fills in quantities, emails to seller
```

### Design Decisions to Make

1. **PDF generation method.** Options:
   - `window.print()` with `@media print` styles. Zero dependencies. Buyer uses browser print dialog, saves as PDF. Least control over output, but simplest.
   - `html2pdf.js` (wraps html2canvas + jsPDF). Client-side library, ~200KB. Renders the HTML to PDF programmatically. More control, heavier.
   - Build-time PDF generation (Puppeteer, pdf-lib). Generates a static PDF file during build. Clean output, but adds a heavy build dependency.
   
   Recommendation: Start with `@media print` styles + `window.print()`. Zero dependencies. If the output quality isn't good enough, swap in a library later. The HTML template is the same either way.

2. **Order sheet as a page or a standalone file?**
   - As a page: lives at `/order-sheet`, has nav, feels integrated. Print styles hide nav/footer.
   - As a standalone HTML file: no nav, purpose-built for print. Cleaner output.
   
   Recommendation: Page on the site. Print styles handle the rest.

3. **Interactive fields vs. print-and-write?**
   - Interactive: quantity inputs in the browser, JS calculates line totals and subtotal live before printing.
   - Static: blank lines, buyer fills in by hand after printing.
   
   Recommendation: Interactive. It's a small amount of JS, and auto-calculating totals before print is a much better experience. The printed output still has the filled-in values. If someone prints blank, that works too.

### Implementation

#### New files

| File | Purpose |
|------|---------|
| `src/pages/order-sheet.astro` | Page route. Fetches listings, renders table. |
| `src/components/OrderSheet/OrderSheet.astro` | Table component. Product rows, quantity inputs, totals. |
| `src/components/OrderSheet/OrderSheet.css` | Screen and print styles. |
| `src/components/OrderSheet/order-sheet.js` | Client-side JS: quantity change handlers, live total calculation, print trigger. |

#### Order sheet page structure

```html
<main id="main-content">
  <h1>Order Sheet</h1>
  <p>Fill in quantities and print or save as PDF.</p>

  <table class="cs-order-sheet">
    <thead>
      <tr>
        <th>Product</th>
        <th>Unit Price</th>
        <th>Qty</th>
        <th>Line Total</th>
      </tr>
    </thead>
    <tbody>
      <!-- one row per listing -->
      <tr>
        <td>
          <strong>Product Name</strong>
          <span class="cs-order-sheet-description">Short description</span>
        </td>
        <td>$25.00</td>
        <td><input type="number" min="0" value="0" /></td>
        <td class="cs-line-total">$0.00</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Subtotal</td>
        <td class="cs-order-subtotal">$0.00</td>
      </tr>
    </tfoot>
  </table>

  <div class="cs-order-sheet-footer">
    <label>Notes<textarea rows="3"></textarea></label>
    <label>Name<input type="text" /></label>
    <label>Email<input type="email" /></label>
  </div>

  <button class="cs-order-sheet-print" onclick="window.print()">
    Download / Print Order Sheet
  </button>
</main>
```

#### Print styles

```css
@media print {
  /* Hide site chrome */
  header, footer, .cs-skip-link, .cs-order-sheet-print { display: none; }

  /* Add store name and contact to printed header */
  main::before { content: attr(data-store-name); /* ... */ }

  /* Style inputs as plain text for print */
  input, textarea { border: none; background: none; }

  /* Ensure table fits page */
  .cs-order-sheet { width: 100%; }
}
```

#### Client-side JS (minimal)

```js
// order-sheet.js
// Runs on the order sheet page only. No framework, no build step.

document.querySelectorAll('.cs-order-sheet input[type="number"]').forEach(input => {
  input.addEventListener('input', updateTotals);
});

function updateTotals() {
  let subtotal = 0;
  document.querySelectorAll('.cs-order-sheet tbody tr').forEach(row => {
    const price = parseFloat(row.dataset.rawPrice);
    const qty = parseInt(row.querySelector('input').value) || 0;
    const lineTotal = price * qty;
    row.querySelector('.cs-line-total').textContent = formatCurrency(lineTotal);
    subtotal += lineTotal;
  });
  document.querySelector('.cs-order-subtotal').textContent = formatCurrency(subtotal);
}
```

### Config Integration

Add optional `orderSheet` flag to `StoreConfig`:

```js
export default {
  name: 'Corner Store',
  home: 'home',
  contact: 'hello@example.com',
  orderSheet: true, // enables /order-sheet page
  // ...
}
```

When `orderSheet` is true:
- `/order-sheet` page is generated at build time
- Nav could optionally include an "Order Sheet" link (or the seller adds it manually to their nav config)

When false or absent: page is not generated. No dead route.

### What This Doesn't Do

- No payment processing. Buyer emails the sheet, seller invoices manually.
- No server endpoint. Pure static site.
- No saved state. Fill it out, print it, done.
- No account system. Buyer fills in their name/email on the sheet itself.

### Dependencies

- `getListings()` (existing)
- `loadConfig()` (existing, for store name and contact email)
- `formatPrice()` / currency utilities (existing)

### Tests

- Order sheet component renders correct number of rows from listings data
- Line total calculation: price * quantity
- Subtotal calculation: sum of line totals
- Zero quantity rows show $0.00
- Currency formatting matches storefront formatting
- Config flag controls page generation

---

## Stage 2: Client-Side Cart + Stripe Checkout Sessions (Future)

### Goals

- Add-to-cart buttons on listings (replace or supplement payment links)
- Client-side cart state (localStorage or session)
- Cart UI: drawer, mini-cart in header, or dedicated page
- Single server endpoint: takes cart contents, creates a Stripe Checkout Session, returns the session URL
- Both the storefront browse experience AND the order sheet feed into the same cart/checkout
- Order sheet becomes an alternative "bulk entry" interface for the same cart

### Architecture Notes

- One serverless function (Netlify/Vercel/Cloudflare Workers). Takes an array of `{priceId, quantity}`, creates a Checkout Session, returns the URL.
- Stripe Checkout Sessions API replaces Payment Links as the checkout mechanism. Payment Links can remain as a fallback for single items if desired.
- Cart persistence: localStorage with cart ID. No auth required.
- The order sheet's "Submit Order" flow changes from "print and email" to "add all to cart and checkout."

### Not Specced Yet

Implementation details deferred until Stage 1 is shipped and validated.

---

## Stage 3: Quick Reorder (Future)

### Goals

- Populate cart from a previous order with one click
- Useful for repeat wholesale buyers and subscription-style purchasing
- Requires buyer identification (Stripe Customer lookup, email-based, magic link, or similar)

### Not Specced Yet

Scope and implementation deferred. Stage 2 must ship first.
