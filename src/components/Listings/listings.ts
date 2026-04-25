import {
  validateQuantity,
  calculateLineTotal,
} from '../../lib/validation/index.js';
import { formatPrice } from '../../lib/storefront/pricing.js';
import {
  classifyCartControlTarget,
  nextQuantity,
  type CartControlAction,
} from '../CartControl/cart-control-actions.js';

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

    const badge = card.querySelector('.cs-listing-badge') as HTMLElement | null;
    const control = card.querySelector('.cs-cart-control') as HTMLElement | null;
    if (!badge || !control) return;

    hydrateCartControl(control, qty);

    if (qty > 0) {
      badge.textContent = String(qty);
      badge.hidden = false;
      card.classList.add('cs-in-cart');
    } else {
      badge.hidden = true;
      card.classList.remove('cs-in-cart');
    }
  });

  // Hydrate table view rows (if active)
  root.querySelectorAll<HTMLElement>('.cs-order-row').forEach((row) => {
    const sku = row.dataset.sku ?? '';
    const item = cart.items.find((i) => i.sku === sku);
    const qty = item?.quantity ?? 0;
    const control = row.querySelector('.cs-cart-control') as HTMLElement | null;
    if (!control) return;
    hydrateCartControl(control, qty);
    updateTableRow(row);
  });
}

function hydrateCartControl(control: HTMLElement, qty: number) {
  const addBtn = control.querySelector<HTMLButtonElement>('.cs-cart-control-add');
  const qtyWrap = control.querySelector<HTMLElement>('.cs-cart-control-qty');
  const qtyInput = control.querySelector<HTMLInputElement>('.cs-cart-control-input');

  // Disabled (status/unavailable) controls only have the disabled add button.
  if (addBtn?.disabled) return;
  if (!qtyWrap || !qtyInput) return;

  qtyInput.value = String(qty);
  if (qty > 0) {
    qtyWrap.hidden = false;
    if (addBtn) addBtn.hidden = true;
  } else {
    qtyWrap.hidden = true;
    if (addBtn) addBtn.hidden = false;
  }
}

function syncToCart(sku: string, quantity: number) {
  if (!cartModule) return;
  if (quantity === 0) {
    cartModule.removeItem(sku, 'wholesale');
  } else {
    cartModule.setItem(sku, quantity, 'wholesale');
  }
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

      // Re-hydrate cart state on the newly active view. The unified cart-control
      // wiring is attached once at root-level via delegation, so no re-wiring is
      // needed across view swaps.
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
  const input = row.querySelector('.cs-cart-control-input') as HTMLInputElement | null;
  const lineTotalEl = row.querySelector('.cs-line-total') as HTMLElement | null;
  const removeBtn = row.querySelector('.cs-remove-btn') as HTMLButtonElement | null;
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
// Unified CartControl wiring via event delegation
// ---------------------------------------------------------------------------

function wireCartControls(root: HTMLElement) {
  if (root.dataset.wired === 'true') return;
  root.dataset.wired = 'true';

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Table-row remove button: set qty to 0.
    const removeBtn = target.closest<HTMLElement>('.cs-remove-btn');
    if (removeBtn) {
      const row = removeBtn.closest<HTMLElement>('.cs-order-row');
      if (row) {
        const control = row.querySelector<HTMLElement>('.cs-cart-control');
        if (control) {
          handleAction(control, 'input', 0);
          return;
        }
      }
    }

    const actionEl = target.closest<HTMLElement>(
      '.cs-cart-control-add, .cs-cart-control-down, .cs-cart-control-up',
    );
    if (!actionEl) return;
    // Skip disabled controls (e.g. sold-out status buttons).
    if (actionEl instanceof HTMLButtonElement && actionEl.disabled) return;
    const control = actionEl.closest<HTMLElement>('.cs-cart-control');
    if (!control) return;
    const action = classifyCartControlTarget(Array.from(actionEl.classList));
    if (!action || action === 'input') return;

    handleAction(control, action);
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('cs-cart-control-input')) return;
    const control = target.closest<HTMLElement>('.cs-cart-control');
    if (!control) return;

    handleAction(control, 'input', target.valueAsNumber);
  });
}

function handleAction(control: HTMLElement, action: CartControlAction, inputValue?: number) {
  const sku = control.dataset.sku ?? '';
  if (!sku) return;

  const moq = control.dataset.moq ? Number(control.dataset.moq) : null;
  const input = control.querySelector<HTMLInputElement>('.cs-cart-control-input');
  const current = input ? parseInt(input.value) || 0 : 0;

  const next = nextQuantity(action, current, moq, inputValue);

  if (input) {
    input.value = String(next);
  }

  // Table-specific row-level recomputation (line total, remove-btn visibility).
  const row = control.closest<HTMLElement>('.cs-order-row');
  if (row) updateTableRow(row);

  syncToCart(sku, next);
}

// ---------------------------------------------------------------------------
// Table lightbox + broken image fallback
// ---------------------------------------------------------------------------

function wireTableExtras(root: HTMLElement) {
  const lightbox = root.querySelector('.cs-lightbox') as HTMLElement | null;
  const lightboxImg = root.querySelector('.cs-lightbox-img') as HTMLImageElement | null;
  const lightboxBackdrop = root.querySelector('.cs-lightbox-backdrop') as HTMLElement | null;

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
  wireCartControls(root);
  wireTableExtras(root);
  initCart(root);
}
