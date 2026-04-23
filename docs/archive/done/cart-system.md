# Cart System

Checkout functionality was removed from the order sheet during the listings view toggle merge. These components need to be built to restore the checkout flow.

## Cart Widget (Header)

- Lives in the top right of the header, next to navigation
- Shows item count and subtotal
- Links to the cart page
- Updates reactively on cart changes (listens to `cs:cart-updated` event and storage events)
- Uses the existing cart module (`src/lib/cart/`) for state

## Cart Page

- Dedicated page showing full cart contents
- Item list with quantities, line totals, remove buttons
- Subtotal bar
- Order validation (MOQ per item, minimum cart size)
- Checkout button: POST to Stripe checkout endpoint (same flow as old order sheet)
- PDF fallback: generate PDF via html2pdf.js, show mailto link (same flow as old order sheet)
- Shipping status (free shipping threshold, flat rate display)
- Minimum order status
- Error display for validation failures

## Reference Implementation

All of the checkout, validation, subtotal, and PDF logic existed in the old `OrderSheet` component. The relevant code was in:

- `src/components/OrderSheet/OrderSheet.astro` (lines 137-166: subtotal bar, validation UI, checkout button, PDF fallback, cart summary, lightbox)
- `src/components/OrderSheet/order-sheet.ts` (lines 153-384: updateTotals, validateOrder, attemptCheckout, generatePdf, updateCartSummary)

These files were deleted during the view toggle merge. Their contents are preserved in git history at commit `2441346`.

## Dependencies

- `src/lib/cart/` - cart state (getCart, setItem, CART_STORAGE_KEY, CART_EVENT)
- `src/lib/validation/` - validateQuantity, snapToMoq, calculateLineTotal, calculateSubtotal, validateOrder
- `src/lib/storefront/pricing.ts` - formatPrice, decimalToRawPrice, DEFAULT_CURRENCY
- `html2pdf.js` - PDF generation (dynamic import)
- Config values: minCartSize, contact, storeName, checkoutUrl, shippingFlat, shippingFreeThreshold, wholesaleMargin
