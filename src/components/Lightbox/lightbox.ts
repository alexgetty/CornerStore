/* =============================================================
 * Lightbox: product image preview.
 *
 * One shared overlay appended to <body>, reused across cards,
 * the table view, and the cart. All three views ship the same
 * trigger primitive (<button class="cs-listing-image-btn"
 * data-images>) from the package, so a single delegated click
 * handler covers every surface.
 *
 * Idempotent. Survives Astro view transitions and the listings
 * view-toggle DOM swap because the handler is bound on document.
 *
 * Lazy: the overlay DOM is built on the first matching click,
 * not at init(). Pages without an opened lightbox pay nothing
 * past the click listener registration.
 * ============================================================= */

/* `export {}` flips the file to module scope so the `declare global`
 * block below augments the lib types instead of being treated as a
 * script-scope no-op. The file otherwise has no exports — it's a
 * side-effect-only script imported via `import "../Lightbox/lightbox.ts"`. */
export {};

declare global {
  interface Window {
    __csLightboxInit?: boolean;
  }
}

interface LightboxImage {
  url: string;
  alt?: string;
}

interface LightboxState {
  overlay: HTMLDivElement | null;
  imgEl: HTMLImageElement | null;
  closeBtn: HTMLButtonElement | null;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
  dotsList: HTMLOListElement | null;
  images: LightboxImage[];
  index: number;
  trigger: HTMLElement | null;
  prevFocus: HTMLElement | null;
}

const BODY_OPEN_CLASS = 'cs-lightbox-open';

/* currentColor lets theme overrides retint the stroke via CSS without
 * touching markup. aria-hidden because each parent button has aria-label. */
const ICON_ATTRS =
  'width="20" height="20" viewBox="0 0 20 20" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"';

const ICON_CLOSE = `<svg ${ICON_ATTRS}><path d="M5 5l10 10M15 5L5 15"/></svg>`;
const ICON_PREV = `<svg ${ICON_ATTRS}><path d="M12.5 4l-6 6 6 6"/></svg>`;
const ICON_NEXT = `<svg ${ICON_ATTRS}><path d="M7.5 4l6 6-6 6"/></svg>`;

const state: LightboxState = {
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

function buildOverlay(): HTMLDivElement {
  if (state.overlay) return state.overlay;

  const overlay = document.createElement('div');
  overlay.className = 'cs-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Product image viewer');
  overlay.tabIndex = -1;
  overlay.hidden = true;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cs-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = ICON_CLOSE;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'cs-lightbox-prev';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.innerHTML = ICON_PREV;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'cs-lightbox-next';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.innerHTML = ICON_NEXT;

  const imgEl = document.createElement('img');
  imgEl.className = 'cs-lightbox-image';
  imgEl.alt = '';

  const dotsList = document.createElement('ol');
  dotsList.className = 'cs-lightbox-dots';
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

function onKeydown(event: KeyboardEvent): void {
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

function getFocusables(): HTMLElement[] {
  if (!state.overlay) return [];
  const all = state.overlay.querySelectorAll<HTMLElement>(
    'button, [href], input, [tabindex]:not([tabindex="-1"])',
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

function trapFocus(event: KeyboardEvent): void {
  if (!state.overlay) return;
  const focusables = getFocusables();
  if (focusables.length === 0) {
    event.preventDefault();
    state.overlay.focus();
    return;
  }
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
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

function renderDots(): void {
  if (!state.dotsList) return;
  state.dotsList.replaceChildren();
  if (state.images.length <= 1) return;

  const total = state.images.length;
  for (let i = 0; i < total; i++) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-lightbox-dot';
    btn.setAttribute('aria-label', `Go to image ${i + 1} of ${total}`);
    if (i === state.index) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', () => goTo(i));
    li.appendChild(btn);
    state.dotsList.appendChild(li);
  }
}

function updateDots(): void {
  if (!state.dotsList) return;
  const dots = state.dotsList.querySelectorAll<HTMLButtonElement>('.cs-lightbox-dot');
  dots.forEach((dot, i) => {
    if (i === state.index) {
      dot.setAttribute('aria-current', 'true');
    } else {
      dot.removeAttribute('aria-current');
    }
  });
}

function showCurrent(): void {
  if (!state.imgEl) return;
  const current = state.images[state.index];
  if (!current) return;
  state.imgEl.src = current.url;
  state.imgEl.alt = current.alt ?? '';
}

function navigate(delta: number): void {
  const total = state.images.length;
  if (total <= 1) return;
  state.index = (state.index + delta + total) % total;
  showCurrent();
  updateDots();
}

function goTo(index: number): void {
  if (index < 0 || index >= state.images.length) return;
  state.index = index;
  showCurrent();
  updateDots();
}

function prefetchOthers(): void {
  for (let i = 0; i < state.images.length; i++) {
    if (i === state.index) continue;
    const url = state.images[i]?.url;
    if (!url) continue;
    const img = new Image();
    img.src = url;
  }
}

function open(images: LightboxImage[], startIndex: number, trigger: HTMLElement | null): void {
  if (!Array.isArray(images) || images.length === 0) return;
  const overlay = state.overlay;
  if (!overlay) return;

  state.images = images;
  state.index = Math.max(0, Math.min(startIndex || 0, images.length - 1));
  state.trigger = trigger;
  state.prevFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  if (images.length <= 1) {
    overlay.setAttribute('data-single', 'true');
  } else {
    overlay.removeAttribute('data-single');
  }

  renderDots();
  showCurrent();
  prefetchOthers();

  overlay.hidden = false;
  document.body.classList.add(BODY_OPEN_CLASS);

  /* Focus the close button so the first Tab cycles forward through
   * the controls. Falls back to the overlay container itself. */
  requestAnimationFrame(() => {
    if (state.closeBtn) {
      state.closeBtn.focus();
    } else {
      overlay.focus();
    }
  });
}

function close(): void {
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

function onTriggerClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest<HTMLElement>('.cs-listing-image-btn');
  if (!btn) return;
  event.preventDefault();
  const raw = btn.getAttribute('data-images');
  if (!raw) return;
  let images: unknown;
  try {
    images = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(images) || images.length === 0) return;
  /* Build the overlay on first matching click. buildOverlay() is
   * idempotent, so calling it on every subsequent click is cheap. */
  buildOverlay();
  open(images as LightboxImage[], 0, btn);
}

function init(): void {
  if (window.__csLightboxInit) return;
  window.__csLightboxInit = true;
  document.addEventListener('click', onTriggerClick);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
