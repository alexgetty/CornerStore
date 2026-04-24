import { getCart, CART_STORAGE_KEY, CART_EVENT } from '../../lib/cart/store.js';
import { computeCartVisibility } from '../../lib/cart/visibility.js';
import { formatPrice } from '../../lib/storefront/pricing.js';

const widget = document.querySelector<HTMLAnchorElement>('.cs-cart-widget');
if (widget) initWidget(widget);

function initWidget(el: HTMLAnchorElement) {
  const currency = el.dataset.currency ?? 'usd';
  const priceMap: Record<string, number> = JSON.parse(el.dataset.prices ?? '{}');
  const disabledSkus = new Set<string>(JSON.parse(el.dataset.disabledSkus ?? '[]'));
  const countEl = el.querySelector('.cs-cart-count') as HTMLElement;
  const subtotalEl = el.querySelector('.cs-cart-subtotal') as HTMLElement;

  function update() {
    const cart = getCart('wholesale');
    const { itemCount, subtotal } = computeCartVisibility({
      items: cart.items,
      priceMap,
      disabledSkus,
    });

    if (itemCount === 0) {
      countEl.hidden = true;
      subtotalEl.hidden = true;
      return;
    }

    countEl.textContent = String(itemCount);
    countEl.hidden = false;
    subtotalEl.textContent = formatPrice(subtotal, currency);
    subtotalEl.hidden = false;
  }

  update();
  window.addEventListener(CART_EVENT, update);
  window.addEventListener('storage', (e) => {
    if (e.key === CART_STORAGE_KEY) update();
  });
}
