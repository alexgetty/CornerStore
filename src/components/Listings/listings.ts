import { snapToMoq } from '../../lib/validation/quantity.js';
import {
  validateQuantity,
  calculateLineTotal,
} from '../../lib/validation/index.js';
import { formatPrice } from '../../lib/storefront/pricing.js';

// ---------------------------------------------------------------------------
// Cart integration (lazy-loaded, progressive enhancement)
// ---------------------------------------------------------------------------

let cartModule: typeof import('../../lib/cart/index.js') | null = null;

async function initCart(root: HTMLElement) {
  try {
    cartModule = await import('../../lib/cart/index.js');
    hydrateFromCart(root);
    window.addEventListener('storage', (e) => {
      if (cartModule && e.key === cartModule.CART_STORAGE_KEY) hydrateFromCart(root);
    });
    window.addEventListener(cartModule.CART_EVENT, () => hydrateFromCart(root));
  } catch {
    // Cart unavailable
  }
}

function hydrateFromCart(root: HTMLElement) {
  if (!cartModule) return;
  const cart = cartModule.getCart('wholesale');

  // Hydrate card view items (if active)
  root.querySelectorAll<HTMLElement>('.cs-listing').forEach((card) => {
    const sku = card.dataset.sku ?? '';
    const item = cart.items.find((i) => i.sku === sku);
    const qty = item?.quantity ?? 0;

    const badge = card.querySelector('.cs-listing-badge') as HTMLElement;
    const addBtn = card.querySelector('.cs-listing-add') as HTMLButtonElement;
    const qtyControl = card.querySelector('.cs-listing-qty') as HTMLElement;
    const qtyInput = card.querySelector('.cs-listing-qty-input') as HTMLInputElement;

    if (!badge || !addBtn || !qtyControl || !qtyInput) return;
    if (addBtn.disabled) return;

    if (qty > 0) {
      badge.textContent = String(qty);
      badge.hidden = false;
      addBtn.hidden = true;
      qtyControl.hidden = false;
      qtyInput.value = String(qty);
      card.classList.add('cs-in-cart');
    } else {
      badge.hidden = true;
      addBtn.hidden = false;
      qtyControl.hidden = true;
      qtyInput.value = '0';
      card.classList.remove('cs-in-cart');
    }
  });

  // Hydrate table view rows (if active)
  root.querySelectorAll<HTMLElement>('.cs-order-row').forEach((row) => {
    const sku = row.dataset.sku ?? '';
    const item = cart.items.find((i) => i.sku === sku);
    const qty = item?.quantity ?? 0;
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    if (!input) return;
    input.value = String(qty);
    updateTableRow(row);
  });
}

function syncToCart(sku: string, quantity: number) {
  if (!cartModule) return;
  cartModule.setItem(sku, quantity, 'wholesale');
}

// ---------------------------------------------------------------------------
// Toggle swap (card <-> table view)
// ---------------------------------------------------------------------------

function initToggle(root: HTMLElement) {
  const toggleBtns = root.querySelectorAll<HTMLButtonElement>('.cs-view-toggle-btn');
  if (toggleBtns.length === 0) return;

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      if (!targetView || targetView === root.dataset.view) return;

      const template = root.querySelector<HTMLTemplateElement>('#cs-listings-alt');
      if (!template) return;

      // Find current active content (the section element: .cs-listing-cards or .cs-listing-table)
      const activeSection = root.querySelector('.cs-listing-cards, .cs-listing-table');
      if (!activeSection) return;

      // Extract template content
      const altContent = template.content.firstElementChild;
      if (!altContent) return;

      // Move active content into a new template
      const newTemplate = document.createElement('template');
      newTemplate.id = 'cs-listings-alt';
      newTemplate.content.appendChild(activeSection);

      // Insert alt content into the live DOM (before the old template)
      template.parentNode!.insertBefore(altContent, template);

      // Replace old template with new template
      template.replaceWith(newTemplate);

      // Update data-view attribute
      root.dataset.view = targetView;

      // Update aria-pressed on buttons
      toggleBtns.forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.view === targetView ? 'true' : 'false');
      });

      // Re-wire quantity controls on the newly active view
      wireQuantityControls(root);

      // Re-hydrate cart state on the newly active view
      hydrateFromCart(root);

      // Persist preference
      try {
        localStorage.setItem('cs-view-preference', targetView);
      } catch {
        // localStorage unavailable
      }
    });
  });

  // Restore preference on load
  try {
    const saved = localStorage.getItem('cs-view-preference');
    if ((saved === 'card' || saved === 'table') && saved !== root.dataset.view) {
      const matchingBtn = root.querySelector<HTMLButtonElement>(
        `.cs-view-toggle-btn[data-view="${saved}"]`,
      );
      if (matchingBtn) matchingBtn.click();
    }
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Table row helper
// ---------------------------------------------------------------------------

function updateTableRow(row: HTMLElement) {
  const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
  const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement;
  const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;
  if (!input || !lineTotalEl || !removeBtn) return;

  const rawPrice = Number(row.dataset.rawPrice);
  const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
  const qty = parseInt(input.value) || 0;
  const currency = row.closest<HTMLElement>('.cs-listing-table')?.dataset.currency ?? 'usd';

  lineTotalEl.textContent = formatPrice(calculateLineTotal(rawPrice, qty), currency);
  removeBtn.hidden = qty === 0;
  input.classList.toggle('cs-invalid', !validateQuantity(qty, moq));
}

// ---------------------------------------------------------------------------
// Quantity controls wiring
// ---------------------------------------------------------------------------

function wireQuantityControls(root: HTMLElement) {
  // Card view controls
  root.querySelectorAll<HTMLElement>('.cs-listing').forEach((card) => {
    if (card.dataset.wired) return; // prevent double-binding
    card.dataset.wired = 'true';

    const sku = card.dataset.sku ?? '';
    const moq = card.dataset.moq ? Number(card.dataset.moq) : null;
    const addBtn = card.querySelector('.cs-listing-add') as HTMLButtonElement;
    const qtyInput = card.querySelector('.cs-listing-qty-input') as HTMLInputElement;
    const downBtn = card.querySelector('.cs-listing-qty-down') as HTMLButtonElement;
    const upBtn = card.querySelector('.cs-listing-qty-up') as HTMLButtonElement;

    if (!addBtn || !qtyInput || !downBtn || !upBtn) return;
    if (addBtn.disabled) return;

    addBtn.addEventListener('click', () => {
      syncToCart(sku, moq ?? 1);
    });

    downBtn.addEventListener('click', () => {
      const current = parseInt(qtyInput.value) || 0;
      syncToCart(sku, snapToMoq(current, moq, 'down'));
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(qtyInput.value) || 0;
      syncToCart(sku, snapToMoq(current, moq, 'up'));
    });

    qtyInput.addEventListener('change', () => {
      const val = Math.max(0, parseInt(qtyInput.value) || 0);
      syncToCart(sku, val);
    });
  });

  // Table view controls
  root.querySelectorAll<HTMLElement>('.cs-order-row').forEach((row) => {
    if (row.dataset.wired) return; // prevent double-binding
    row.dataset.wired = 'true';

    const sku = row.dataset.sku ?? '';
    const moq = row.dataset.moq ? Number(row.dataset.moq) : null;
    const input = row.querySelector('.cs-qty-input') as HTMLInputElement;
    const downBtn = row.querySelector('.cs-qty-down') as HTMLButtonElement;
    const upBtn = row.querySelector('.cs-qty-up') as HTMLButtonElement;
    const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement;

    if (!input || !downBtn || !upBtn || !removeBtn) return;

    downBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'down');
      input.value = String(next);
      updateTableRow(row);
      syncToCart(sku, next);
    });

    upBtn.addEventListener('click', () => {
      const current = parseInt(input.value) || 0;
      const next = snapToMoq(current, moq, 'up');
      input.value = String(next);
      updateTableRow(row);
      syncToCart(sku, next);
    });

    input.addEventListener('change', () => {
      const val = Math.max(0, parseInt(input.value) || 0);
      input.value = String(val);
      updateTableRow(row);
      syncToCart(sku, val);
    });

    removeBtn.addEventListener('click', () => {
      input.value = '0';
      updateTableRow(row);
      syncToCart(sku, 0);
    });
  });

  // Table lightbox
  const lightbox = root.querySelector('.cs-lightbox') as HTMLElement;
  const lightboxImg = root.querySelector('.cs-lightbox-img') as HTMLImageElement;
  const lightboxBackdrop = root.querySelector('.cs-lightbox-backdrop') as HTMLElement;

  if (lightbox && lightboxImg && lightboxBackdrop) {
    root.querySelectorAll<HTMLButtonElement>('.cs-thumb-btn').forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = 'true';
      btn.addEventListener('click', () => {
        lightboxImg.src = btn.dataset.fullSrc ?? '';
        lightboxImg.alt = btn.dataset.alt ?? '';
        lightbox.hidden = false;
      });
    });

    if (!lightboxBackdrop.dataset.wired) {
      lightboxBackdrop.dataset.wired = 'true';
      lightboxBackdrop.addEventListener('click', () => { lightbox.hidden = true; });
      lightboxImg.addEventListener('click', (e) => { e.stopPropagation(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !lightbox.hidden) lightbox.hidden = true;
      });
    }
  }

  // Table broken image fallback
  root.querySelectorAll<HTMLImageElement>('.cs-thumb').forEach((img) => {
    if (img.dataset.wired) return;
    img.dataset.wired = 'true';
    img.addEventListener('error', () => {
      const placeholder = document.createElement('span');
      placeholder.className = 'cs-no-image';
      placeholder.setAttribute('aria-hidden', 'true');
      img.closest('.cs-thumb-btn')?.replaceWith(placeholder);
    });
  });
}

// ---------------------------------------------------------------------------
// Main initialization
// ---------------------------------------------------------------------------

const root = document.querySelector<HTMLElement>('.cs-listings');
if (root) {
  initToggle(root);
  wireQuantityControls(root);
  initCart(root);
}
