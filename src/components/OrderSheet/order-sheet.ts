import {
  validateQuantity,
  snapToMoq,
  calculateLineTotal,
  calculateSubtotal,
  validateOrder,
} from '../../lib/order-sheet/validation.js';
import type { OrderSheetItem } from '../../lib/order-sheet/types.js';
import { formatPrice } from '../../lib/storefront/pricing.js';

const root = document.querySelector('.cs-order-sheet') as HTMLElement;
if (root) init(root);

function init(root: HTMLElement) {
  const currency = root.dataset.currency ?? 'usd';
  const minCartSizeRaw = root.dataset.minCartSizeRaw ? Number(root.dataset.minCartSizeRaw) : null;
  const contact = root.dataset.contact ?? '';
  const storeName = root.dataset.storeName ?? '';

  const rows = root.querySelectorAll<HTMLElement>('.cs-order-row');
  const subtotalEl = root.querySelector('.cs-subtotal-value') as HTMLElement;
  const submitBtn = root.querySelector('.cs-submit-btn') as HTMLButtonElement;
  const errorsEl = root.querySelector('.cs-order-errors') as HTMLElement;
  const mailtoSection = root.querySelector('.cs-mailto-section') as HTMLElement;
  const mailtoLink = root.querySelector('.cs-mailto-link') as HTMLAnchorElement;
  const nameInput = root.querySelector('.cs-buyer-name') as HTMLInputElement;
  const emailInput = root.querySelector('.cs-buyer-email') as HTMLInputElement;
  const lightbox = root.querySelector('.cs-lightbox') as HTMLElement;
  const lightboxImg = root.querySelector('.cs-lightbox-img') as HTMLImageElement;
  const lightboxBackdrop = root.querySelector('.cs-lightbox-backdrop') as HTMLElement;

  // --- Quantity controls ---
  rows.forEach((row) => {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const downBtn = row.querySelector('.cs-qty-down') as HTMLButtonElement;
    const upBtn = row.querySelector('.cs-qty-up') as HTMLButtonElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;

    downBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      input.value = String(snapToMoq(current, moq, 'down'));
      updateRow(row, currency);
      updateTotals();
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      input.value = String(snapToMoq(current, moq, 'up'));
      updateRow(row, currency);
      updateTotals();
    });

    input.addEventListener('change', () => {
      const val = parseInt(input.value) || 0;
      input.value = String(Math.max(0, val));
      updateRow(row, currency);
      updateTotals();
    });

    removeBtn.addEventListener('click', () => {
      input.value = '0';
      updateRow(row, currency);
      updateTotals();
    });
  });

  // --- Lightbox ---
  root.querySelectorAll<HTMLButtonElement>('.cs-thumb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightboxImg.src = btn.dataset.fullSrc ?? '';
      lightboxImg.alt = btn.dataset.alt ?? '';
      lightbox.hidden = false;
    });
  });

  lightboxBackdrop.addEventListener('click', () => { lightbox.hidden = true; });
  lightboxImg.addEventListener('click', (e) => { e.stopPropagation(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) lightbox.hidden = true;
  });

  // --- Validation on input ---
  nameInput.addEventListener('input', updateTotals);
  emailInput.addEventListener('input', updateTotals);

  function updateRow(row: HTMLElement, currency: string) {
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
    const rawPrice = Number(row.dataset.rawPrice);
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const qty = parseInt(input.value) || 0;

    lineTotalEl.textContent = formatPrice(calculateLineTotal(rawPrice, qty), currency);
    removeBtn.hidden = qty === 0;

    const isValid = validateQuantity(qty, moq);
    input.classList.toggle('cs-invalid', !isValid);
  }

  function getItems(): OrderSheetItem[] {
    return Array.from(rows).map((row) => {
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
    const items = getItems();
    const subtotal = calculateSubtotal(items);
    subtotalEl.textContent = formatPrice(subtotal, currency);

    const result = validateOrder(items, minCartSizeRaw, nameInput.value, emailInput.value);

    if (result.errors.length > 0) {
      errorsEl.replaceChildren();
      const ul = document.createElement('ul');
      for (const e of result.errors) {
        const li = document.createElement('li');
        li.textContent = e.message;
        ul.appendChild(li);
      }
      errorsEl.appendChild(ul);
      errorsEl.hidden = false;
    } else {
      errorsEl.replaceChildren();
      errorsEl.hidden = true;
    }

    submitBtn.disabled = !result.valid;
  }

  // --- Submit: PDF generation + mailto ---
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating PDF...';

    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const pdfContent = root.cloneNode(true) as HTMLElement;

      // Remove elements not needed in PDF
      pdfContent.querySelectorAll(
        '.cs-order-actions, .cs-mailto-section, .cs-lightbox, .cs-order-errors, .cs-col-image, .cs-col-remove, .cs-qty-btn, .cs-remove-btn, .cs-min-cart-notice'
      ).forEach((el) => el.remove());

      // Remove zero-quantity rows
      pdfContent.querySelectorAll('.cs-order-row').forEach((row) => {
        const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
        if (parseInt(input.value) === 0) row.remove();
      });

      // Replace inputs with plain text spans
      pdfContent.querySelectorAll('.cs-qty-input').forEach((input) => {
        const val = (input as HTMLInputElement).value;
        const span = document.createElement('span');
        span.textContent = val;
        span.style.textAlign = 'right';
        input.replaceWith(span);
      });

      pdfContent.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
        const span = document.createElement('span');
        span.textContent = el.value;
        el.replaceWith(span);
      });

      // Remove empty category rows
      pdfContent.querySelectorAll('.cs-category-row').forEach((catRow) => {
        const next = catRow.nextElementSibling;
        if (!next || next.classList.contains('cs-category-row') || next.tagName === 'TFOOT') {
          catRow.remove();
        }
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

      // Show mailto link
      const buyerName = nameInput.value.trim();
      const buyerEmail = emailInput.value.trim();
      const subject = encodeURIComponent(`Order from ${buyerName} - ${storeName}`);
      const body = encodeURIComponent(
        `Hi,\n\nPlease find my order attached.\n\nName: ${buyerName}\nEmail: ${buyerEmail}\n\nThank you`
      );
      mailtoLink.href = `mailto:${contact}?subject=${subject}&body=${body}`;
      mailtoLink.textContent = `Email your order to ${contact}`;
      mailtoSection.hidden = false;

      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    } catch (err) {
      console.error('[OrderSheet] PDF generation failed:', err);
      submitBtn.textContent = 'Submit Order';
      submitBtn.disabled = false;
    }
  });
}
