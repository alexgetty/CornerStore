import {
  validateQuantity,
  snapToMoq,
  calculateLineTotal,
} from '../../lib/validation/index.js';
import type { ValidationItem } from '../../lib/validation/types.js';
import { formatPrice, decimalToRawPrice, DEFAULT_CURRENCY } from '../../lib/storefront/pricing.js';
import { getCart, setItem, removeItem, clear, CART_STORAGE_KEY, CART_EVENT } from '../../lib/cart/store.js';

const root = document.querySelector<HTMLElement>('.cs-cart');
if (root) init(root);

function init(root: HTMLElement) {
  const currency = root.dataset.currency ?? 'usd';
  const minCartSizeRaw = root.dataset.minCartSizeRaw ? Number(root.dataset.minCartSizeRaw) : null;
  const contact = root.dataset.contact ?? '';
  const storeName = root.dataset.storeName ?? '';
  const checkoutEnabled = root.dataset.checkoutEnabled === 'true';
  const checkoutUrl = root.dataset.checkoutUrl || '/api/checkout';

  const emptyEl = root.querySelector('.cs-cart-empty') as HTMLElement;
  const contentEl = root.querySelector('.cs-cart-content') as HTMLElement;
  const rows = root.querySelectorAll<HTMLElement>('.cs-cart-row');
  const subtotalEl = root.querySelector('.cs-subtotal-value') as HTMLElement;
  const submitBtn = root.querySelector('.cs-submit-btn') as HTMLButtonElement;
  const errorsEl = root.querySelector('.cs-order-errors') as HTMLElement;
  const mailtoSection = root.querySelector('.cs-mailto-section') as HTMLElement;
  const mailtoLink = root.querySelector('.cs-mailto-link') as HTMLAnchorElement;
  const checkoutError = root.querySelector('.cs-checkout-error') as HTMLElement;
  const checkoutFallback = root.querySelector('.cs-checkout-fallback') as HTMLElement;
  const retryBtn = root.querySelector('.cs-retry-btn') as HTMLButtonElement;
  const pdfBtn = root.querySelector('.cs-pdf-btn') as HTMLButtonElement;
  const cartSummary = root.querySelector('.cs-cart-summary') as HTMLElement;
  const shippingStatus = root.querySelector('.cs-shipping-status') as HTMLElement;
  const minimumStatus = root.querySelector('.cs-minimum-status') as HTMLElement;
  const banner = root.querySelector('.cs-cart-unavailable-banner') as HTMLElement;
  const clearUnavailableBtn = root.querySelector('.cs-clear-unavailable') as HTMLButtonElement | null;
  const unavailableNotice = root.querySelector('.cs-unavailable-notice') as HTMLElement | null;
  const clearCartBtn = root.querySelector('.cs-clear-cart') as HTMLButtonElement | null;
  const clearCartConfirm = root.querySelector('.cs-clear-cart-confirm') as HTMLElement | null;
  const clearCartYesBtn = root.querySelector('.cs-clear-cart-yes') as HTMLButtonElement | null;
  const clearCartCancelBtn = root.querySelector('.cs-clear-cart-cancel') as HTMLButtonElement | null;

  // Module-scoped list of unavailable SKUs currently in the cart. Updated by
  // hydrateFromCart. Drives the submit-gating + the "Remove unavailable items"
  // button click handler.
  let unavailableSkus: string[] = [];

  const rowMap = new Map<string, HTMLElement>();
  rows.forEach((row) => rowMap.set(row.dataset.sku ?? '', row));

  let allNames: Record<string, string> = {};
  fetch('/product-names.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      allNames = data;
      hydrateFromCart();
    })
    .catch(() => { /* fall back to SKU in banner */ });

  const shippingFlatDecimal = root.dataset.shippingFlat ? Number(root.dataset.shippingFlat) : null;
  const shippingFreeThresholdDecimal = root.dataset.shippingFreeThreshold ? Number(root.dataset.shippingFreeThreshold) : null;
  const shippingFlatRaw = shippingFlatDecimal != null ? decimalToRawPrice(shippingFlatDecimal, DEFAULT_CURRENCY) : null;
  const shippingFreeThresholdRaw = shippingFreeThresholdDecimal != null ? decimalToRawPrice(shippingFreeThresholdDecimal, DEFAULT_CURRENCY) : null;

  // --- Cart hydration ---

  function hydrateFromCart() {
    const cart = getCart('wholesale');
    let hasItems = false;
    const unavailableItems: string[] = [];
    const nextUnavailableSkus: string[] = [];

    rows.forEach((row) => {
      row.hidden = true;
      row.classList.remove('cs-cart-unavailable');
      row.removeAttribute('aria-disabled');
    });

    for (const item of cart.items) {
      const row = rowMap.get(item.sku);
      if (!row) {
        // Hidden or deleted product: no row in DOM. Use name from fetched map, fall back to SKU.
        unavailableItems.push(allNames[item.sku] ?? item.sku);
        nextUnavailableSkus.push(item.sku);
        continue;
      }

      const status = row.dataset.status;
      if (status) {
        // Status product: row exists but product is unavailable
        row.hidden = false;
        row.classList.add('cs-cart-unavailable');
        row.setAttribute('aria-disabled', 'true');
        hasItems = true;
        unavailableItems.push(row.dataset.name || item.sku);
        nextUnavailableSkus.push(item.sku);
        continue;
      }

      row.hidden = false;
      hasItems = true;

      const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
      input.value = String(item.quantity);
      updateRow(row);
    }

    unavailableSkus = nextUnavailableSkus;

    // Show/hide unavailable banner. Preserve the static .cs-clear-unavailable
    // button that lives inside the banner markup (wired once at mount).
    if (unavailableItems.length > 0 && banner) {
      const p = document.createElement('p');
      p.textContent = 'Some items in your cart are no longer available:';
      const ul = document.createElement('ul');
      for (const name of unavailableItems) {
        const li = document.createElement('li');
        li.textContent = name;
        ul.appendChild(li);
      }
      // Remove any previously injected <p>/<ul>, keep the button.
      banner.querySelectorAll(':scope > p, :scope > ul').forEach((el) => el.remove());
      // Insert the new content before the button so the button stays as the
      // last focusable element in reading order.
      if (clearUnavailableBtn) {
        banner.insertBefore(ul, clearUnavailableBtn);
        banner.insertBefore(p, ul);
      } else {
        banner.append(p, ul);
      }
      banner.hidden = false;
      hasItems = true;
    } else if (banner) {
      banner.querySelectorAll(':scope > p, :scope > ul').forEach((el) => el.remove());
      banner.hidden = true;
    }

    emptyEl.hidden = hasItems;
    contentEl.hidden = !hasItems;

    if (hasItems) updateTotals();
  }

  // --- Quantity controls ---
  //
  // Status rows render a status label instead of qty controls (see
  // Cart.astro), so they have no .cs-qty-input, .cs-qty-down, or .cs-qty-up
  // elements to wire. Guard on row.dataset.status and bail early. The remove
  // button is wired separately below so unavailable rows can still be cleared.

  rows.forEach((row) => {
    if (row.dataset.status) return;

    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const downBtn = row.querySelector('.cs-qty-down') as HTMLButtonElement;
    const upBtn = row.querySelector('.cs-qty-up') as HTMLButtonElement;
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const sku = row.dataset.sku ?? '';

    downBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'down');
      input.value = String(next);
      updateRow(row);
      if (next === 0) {
        removeItem(sku, 'wholesale');
      } else {
        setItem(sku, next, 'wholesale');
      }
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'up');
      input.value = String(next);
      updateRow(row);
      setItem(sku, next, 'wholesale');
    });

    input.addEventListener('change', () => {
      const val = Math.max(0, parseInt(input.value) || 0);
      input.value = String(val);
      updateRow(row);
      if (val === 0) {
        removeItem(sku, 'wholesale');
      } else {
        setItem(sku, val, 'wholesale');
      }
    });
  });

  // --- Remove buttons ---
  //
  // Second pass wires remove buttons on every row, including status/unavailable
  // rows, so users can always clear dead items.

  rows.forEach((row) => {
    const removeBtn = row.querySelector<HTMLButtonElement>('.cs-remove-btn');
    if (!removeBtn) return;
    const sku = row.dataset.sku ?? '';

    removeBtn.addEventListener('click', () => {
      const input = row.querySelector<HTMLInputElement>('.cs-qty-input');
      if (input) input.value = '0';
      removeItem(sku, 'wholesale');
    });
  });

  // --- Row + totals helpers ---

  function updateRow(row: HTMLElement) {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement;
    const rawPrice = Number(row.dataset.rawPrice);
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const qty = parseInt(input.value) || 0;

    lineTotalEl.textContent = formatPrice(calculateLineTotal(rawPrice, qty), currency);
    input.classList.toggle('cs-invalid', !validateQuantity(qty, moq));
  }

  function getVisibleItems(): ValidationItem[] {
    return Array.from(rows)
      .filter((row) => !row.hidden && !row.classList.contains('cs-cart-unavailable'))
      .map((row) => {
        const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
        return {
          sku: row.dataset.sku ?? '',
          name: row.querySelector('strong')?.textContent ?? '',
          rawPrice: Number(row.dataset.rawPrice),
          moq: row.dataset.moq ? Number(row.dataset.moq) : null,
          quantity: parseInt(input.value) || 0,
        };
      });
  }

  function updateTotals() {
    const items = getVisibleItems();

    const subtotal = items.reduce(
      (sum, i) => sum + calculateLineTotal(i.rawPrice, i.quantity),
      0,
    );
    subtotalEl.textContent = formatPrice(subtotal, currency);

    // Validation
    const errors: string[] = [];

    for (const item of items) {
      if (!validateQuantity(item.quantity, item.moq)) {
        errors.push(`${item.name}: minimum order quantity is ${item.moq}`);
      }
    }

    if (minCartSizeRaw !== null && subtotal < minCartSizeRaw) {
      errors.push('Minimum order total not met');
    }

    if (errors.length > 0) {
      errorsEl.replaceChildren();
      const ul = document.createElement('ul');
      for (const msg of errors) {
        const li = document.createElement('li');
        li.textContent = msg;
        ul.appendChild(li);
      }
      errorsEl.appendChild(ul);
      errorsEl.hidden = false;
    } else {
      errorsEl.replaceChildren();
      errorsEl.hidden = true;
    }

    // Separate gating path: unavailable items block checkout regardless of
    // quantity/minimum validation. The notice lives in its own slot so it
    // doesn't collide with the quantity/minimum error list.
    const hasUnavailable = unavailableSkus.length > 0;
    if (unavailableNotice) {
      if (hasUnavailable) {
        unavailableNotice.textContent = 'Remove unavailable items to continue';
        unavailableNotice.hidden = false;
      } else {
        unavailableNotice.textContent = '';
        unavailableNotice.hidden = true;
      }
    }

    submitBtn.disabled = errors.length > 0 || hasUnavailable;
    updateCartSummary(subtotal);
  }

  function updateCartSummary(subtotal: number) {
    if (!cartSummary) return;

    let hasContent = false;

    if (shippingFlatRaw != null && shippingStatus) {
      if (shippingFreeThresholdRaw != null && subtotal >= shippingFreeThresholdRaw) {
        shippingStatus.textContent = 'Free shipping';
      } else if (shippingFreeThresholdRaw != null) {
        const remaining = shippingFreeThresholdRaw - subtotal;
        shippingStatus.textContent = `${formatPrice(remaining, currency)} more for free shipping`;
      } else {
        shippingStatus.textContent = `${formatPrice(shippingFlatRaw, currency)} shipping`;
      }
      shippingStatus.hidden = false;
      hasContent = true;
    } else if (shippingStatus) {
      shippingStatus.hidden = true;
    }

    if (minCartSizeRaw != null && minimumStatus) {
      const remaining = minCartSizeRaw - subtotal;
      if (remaining > 0) {
        minimumStatus.textContent = `${formatPrice(remaining, currency)} away from minimum order`;
        minimumStatus.hidden = false;
        hasContent = true;
      } else {
        minimumStatus.hidden = true;
      }
    } else if (minimumStatus) {
      minimumStatus.hidden = true;
    }

    cartSummary.hidden = !hasContent;
  }

  // --- Clear unavailable items ---

  // Wired once at mount. Submit is disabled while unavailableSkus.length > 0
  // (see updateTotals), so the only way to move forward is via this button.
  if (clearUnavailableBtn) {
    clearUnavailableBtn.addEventListener('click', () => {
      // Snapshot the list before mutating. Each removeItem call fires
      // CART_EVENT, which re-runs hydrateFromCart and rewrites
      // unavailableSkus in place.
      const skus = unavailableSkus.slice();
      for (const sku of skus) {
        removeItem(sku, 'wholesale');
      }
    });
  }

  // --- Clear entire cart ---
  //
  // Inline confirm pattern: "Clear cart" button toggles to a "Clear entire
  // cart? Yes, clear | Cancel" prompt. Confirm calls store.clear() which wipes
  // localStorage and fires CART_EVENT. The CART_EVENT listener re-runs
  // hydrateFromCart, which hides .cs-cart-content (empty state) and thereby
  // hides the clear-cart row. No manual reset needed on success.
  //
  // Edge case: if another action mutates the cart while the prompt is open
  // (e.g. user removes a different row), we leave the prompt visible as long
  // as the cart still has items. resetClearCartConfirm() is only called on
  // Cancel and on mount.

  function resetClearCartConfirm() {
    if (clearCartBtn) clearCartBtn.hidden = false;
    if (clearCartConfirm) clearCartConfirm.hidden = true;
  }

  resetClearCartConfirm();

  if (clearCartBtn && clearCartConfirm) {
    clearCartBtn.addEventListener('click', () => {
      clearCartBtn.hidden = true;
      clearCartConfirm.hidden = false;
      clearCartYesBtn?.focus();
    });
  }

  if (clearCartCancelBtn) {
    clearCartCancelBtn.addEventListener('click', () => {
      resetClearCartConfirm();
      clearCartBtn?.focus();
    });
  }

  if (clearCartYesBtn) {
    clearCartYesBtn.addEventListener('click', () => {
      // Reset the confirm UI BEFORE clearing so that if the user later re-adds
      // items and hydrateFromCart unhides .cs-cart-content, they see the
      // initial "Clear cart" button rather than the stale Yes/Cancel prompt.
      resetClearCartConfirm();
      clear();
    });
  }

  // --- Submit ---

  submitBtn.addEventListener('click', async () => {
    if (checkoutEnabled) {
      await attemptCheckout();
    } else {
      await generatePdf();
    }
  });

  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      checkoutFallback.hidden = true;
      checkoutError.hidden = true;
      await attemptCheckout();
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => generatePdf());
  }

  async function attemptCheckout() {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    checkoutError.hidden = true;
    checkoutFallback.hidden = true;

    const items = getVisibleItems()
      .filter((i) => i.quantity > 0)
      .map((i) => ({ sku: i.sku, quantity: i.quantity }));

    try {
      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Checkout failed' }));
        throw new Error(data.error ?? 'Checkout failed');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      checkoutError.textContent = `Checkout unavailable: ${message}`;
      checkoutError.hidden = false;
      checkoutFallback.hidden = false;

      submitBtn.textContent = checkoutEnabled ? 'Checkout' : 'Submit Order';
      submitBtn.disabled = false;
    }
  }

  async function generatePdf() {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating PDF...';

    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const pdfContent = contentEl.cloneNode(true) as HTMLElement;

      pdfContent.querySelectorAll(
        '.cs-order-actions, .cs-clear-cart-row, .cs-mailto-section, .cs-order-errors, .cs-unavailable-notice, .cs-cart-unavailable-banner, .cs-col-remove, .cs-remove-btn, .cs-qty-btn, .cs-min-cart-notice, .cs-checkout-error, .cs-checkout-fallback, .cs-cart-summary, .cs-continue-shopping',
      ).forEach((el) => el.remove());

      pdfContent.querySelectorAll('.cs-cart-row[hidden]').forEach((row) => row.remove());

      pdfContent.querySelectorAll('.cs-qty-input').forEach((input) => {
        const val = (input as HTMLInputElement).value;
        const span = document.createElement('span');
        span.textContent = val;
        span.style.textAlign = 'right';
        input.replaceWith(span);
      });

      const date = new Date().toISOString().slice(0, 10);
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `order-${slug}-${date}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pdfContent)
        .save();

      const subject = encodeURIComponent(`Order - ${storeName}`);
      const body = encodeURIComponent(
        `Hi,\n\nPlease find my order attached.\n\nThank you`,
      );
      mailtoLink.href = `mailto:${contact}?subject=${subject}&body=${body}`;
      mailtoLink.textContent = `Email your order to ${contact}`;
      mailtoSection.hidden = false;

      submitBtn.textContent = checkoutEnabled ? 'Checkout' : 'Submit Order';
      submitBtn.disabled = false;
    } catch (err) {
      console.error('[Cart] PDF generation failed:', err);
      submitBtn.textContent = checkoutEnabled ? 'Checkout' : 'Submit Order';
      submitBtn.disabled = false;
    }
  }

  // --- React to cart changes ---

  window.addEventListener(CART_EVENT, hydrateFromCart);
  window.addEventListener('storage', (e) => {
    if (e.key === CART_STORAGE_KEY) hydrateFromCart();
  });

  hydrateFromCart();
}
