/* =============================================================
 * Lightbox: product image preview
 *
 * One shared overlay appended to <body>, reused across cards
 * and table rows. Both views ship the same trigger primitive
 * (<button class="cs-listing-image-btn" data-images>) from the
 * package, so a single delegated click handler covers both.
 *
 * Idempotent. Survives Astro view transitions and the listings
 * view-toggle DOM swap because the handler is bound on document.
 * ============================================================= */

const BODY_OPEN_CLASS = 'df-lightbox-open';

/* Inline SVG icons. Match the site's existing iconography: stroke-only,
 * 20x20 viewBox, stroke-width 1.5, round caps + joins, currentColor.
 * (See node_modules/corner-store/src/components/CartWidget/CartWidget.astro
 * line 21 for the canonical reference.) aria-hidden because each parent
 * button already has an aria-label. */
const ICON_ATTRS =
  'width="20" height="20" viewBox="0 0 20 20" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"';

const ICON_CLOSE =
  `<svg ${ICON_ATTRS}><path d="M5 5l10 10M15 5L5 15"/></svg>`;
const ICON_PREV =
  `<svg ${ICON_ATTRS}><path d="M12.5 4l-6 6 6 6"/></svg>`;
const ICON_NEXT =
  `<svg ${ICON_ATTRS}><path d="M7.5 4l6 6-6 6"/></svg>`;

const state = {
  overlay: null,
  imgEl: null,
  closeBtn: null,
  prevBtn: null,
  nextBtn: null,
  dotsList: null,
  images: [],
  index: 0,
  trigger: null,
  prevFocus: null,
};

function buildOverlay() {
  if (state.overlay) return state.overlay;

  const overlay = document.createElement('div');
  overlay.className = 'df-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Product image viewer');
  overlay.tabIndex = -1;
  overlay.hidden = true;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'df-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = ICON_CLOSE;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'df-lightbox-prev';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.innerHTML = ICON_PREV;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'df-lightbox-next';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.innerHTML = ICON_NEXT;

  const imgEl = document.createElement('img');
  imgEl.className = 'df-lightbox-image';
  imgEl.alt = '';

  const dotsList = document.createElement('ol');
  dotsList.className = 'df-lightbox-dots';
  dotsList.setAttribute('role', 'tablist');

  overlay.appendChild(closeBtn);
  overlay.appendChild(prevBtn);
  overlay.appendChild(imgEl);
  overlay.appendChild(nextBtn);
  overlay.appendChild(dotsList);
  document.body.appendChild(overlay);

  /* Wire interactions */
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));

  /* Backdrop click closes (only when target IS the overlay container,
   * not its children: image / buttons / dots). */
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  /* Keyboard: scoped to the overlay so Esc / arrows do not leak out. */
  overlay.addEventListener('keydown', onKeydown);

  state.overlay = overlay;
  state.imgEl = imgEl;
  state.closeBtn = closeBtn;
  state.prevBtn = prevBtn;
  state.nextBtn = nextBtn;
  state.dotsList = dotsList;

  return overlay;
}

function onKeydown(event) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      close();
      return;
    case 'ArrowLeft':
      if (state.images.length > 1) {
        event.preventDefault();
        navigate(-1);
      }
      return;
    case 'ArrowRight':
      if (state.images.length > 1) {
        event.preventDefault();
        navigate(1);
      }
      return;
    case 'Tab':
      trapFocus(event);
      return;
    default:
      return;
  }
}

function getFocusables() {
  if (!state.overlay) return [];
  const all = state.overlay.querySelectorAll(
    'button, [href], input, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(all).filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    /* Skip elements inside hidden subtrees. Single-image mode hides
     * prev / next / dots via CSS display:none, which excludes them
     * from offsetParent computation. */
    if (el.offsetParent === null && el !== state.overlay) return false;
    return true;
  });
}

function trapFocus(event) {
  const focusables = getFocusables();
  if (focusables.length === 0) {
    event.preventDefault();
    state.overlay.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !state.overlay.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function renderDots() {
  state.dotsList.replaceChildren();
  if (state.images.length <= 1) return;

  const total = state.images.length;
  for (let i = 0; i < total; i++) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'df-lightbox-dot';
    btn.setAttribute('aria-label', `Go to image ${i + 1} of ${total}`);
    if (i === state.index) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', () => goTo(i));
    li.appendChild(btn);
    state.dotsList.appendChild(li);
  }
}

function updateDots() {
  if (!state.dotsList) return;
  const dots = state.dotsList.querySelectorAll('.df-lightbox-dot');
  dots.forEach((dot, i) => {
    if (i === state.index) {
      dot.setAttribute('aria-current', 'true');
    } else {
      dot.removeAttribute('aria-current');
    }
  });
}

function showCurrent() {
  const current = state.images[state.index];
  if (!current) return;
  state.imgEl.src = current.url;
  state.imgEl.alt = current.alt ?? '';
}

function navigate(delta) {
  const total = state.images.length;
  if (total <= 1) return;
  state.index = (state.index + delta + total) % total;
  showCurrent();
  updateDots();
}

function goTo(index) {
  if (index < 0 || index >= state.images.length) return;
  state.index = index;
  showCurrent();
  updateDots();
}

function prefetchOthers() {
  for (let i = 0; i < state.images.length; i++) {
    if (i === state.index) continue;
    const url = state.images[i]?.url;
    if (!url) continue;
    const img = new Image();
    img.src = url;
  }
}

function open(images, startIndex, trigger) {
  if (!Array.isArray(images) || images.length === 0) return;
  buildOverlay();

  state.images = images;
  state.index = Math.max(0, Math.min(startIndex || 0, images.length - 1));
  state.trigger = trigger ?? null;
  state.prevFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  if (images.length <= 1) {
    state.overlay.setAttribute('data-single', 'true');
  } else {
    state.overlay.removeAttribute('data-single');
  }

  renderDots();
  showCurrent();
  prefetchOthers();

  state.overlay.hidden = false;
  document.body.classList.add(BODY_OPEN_CLASS);

  /* Focus the close button so the first Tab cycles forward through
   * the controls. Falls back to the overlay container itself. */
  requestAnimationFrame(() => {
    if (state.closeBtn) {
      state.closeBtn.focus();
    } else {
      state.overlay.focus();
    }
  });
}

function close() {
  if (!state.overlay || state.overlay.hidden) return;
  state.overlay.hidden = true;
  document.body.classList.remove(BODY_OPEN_CLASS);

  /* Clear src so we do not keep a giant image in memory between opens. */
  if (state.imgEl) {
    state.imgEl.removeAttribute('src');
    state.imgEl.alt = '';
  }
  state.images = [];
  state.index = 0;

  const target = state.trigger ?? state.prevFocus;
  state.trigger = null;
  state.prevFocus = null;
  if (target && typeof target.focus === 'function') {
    target.focus();
  }
}

function onTriggerClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('.cs-listing-image-btn');
  if (!btn) return;
  event.preventDefault();
  const raw = btn.getAttribute('data-images');
  if (!raw) return;
  let images;
  try {
    images = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(images) || images.length === 0) return;
  open(images, 0, btn);
}

function init() {
  if (window.__dfLightboxInit) return;
  window.__dfLightboxInit = true;
  buildOverlay();
  document.addEventListener('click', onTriggerClick);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
