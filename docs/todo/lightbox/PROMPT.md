# Add a Lightbox primitive to corner-store

The package already emits `<button class="cs-listing-image-btn" data-images>` from `ListingCards.astro` and `ListingTable.astro`, with a button reset on the class. The button currently has no behavior wired up. This work adds the dialog behind it: a global, lazily-built overlay that opens when the trigger is clicked, with keyboard support, focus management, image navigation, and dot indicators.

The `reference/` directory contains a working implementation you should adapt rather than re-derive from scratch. See **Reference material** at the bottom for adaptation notes.

## Goals

- Listings ship a working lightbox out of the box. No layout edits, extra components, or additional script imports required from consumers.
- Theme customization is CSS-only: a small token surface for the most common adjustments, plus class-selector overrides for the rest.
- The lightbox is wired exclusively via the declarative `.cs-listing-image-btn` + `data-images` trigger pattern. No public programmatic API.

## Non-goals

- No public exported functions (`openLightbox`, etc.). The script is side-effect-only.
- No `Lightbox.astro` component for consumers to drop in.
- No icon-shape customization API. Inline SVG defaults using `currentColor`; theme overrides color and size via tokens / CSS.
- No mobile-specific media query.

## File layout

```
src/components/Lightbox/
  Lightbox.css      Package-layer baseline styles, token-driven
  lightbox.ts       Side-effect script: builds overlay, wires delegated handler
```

No `Lightbox.astro`. The lightbox does not render markup at SSR; the overlay DOM is built lazily on first trigger click.

## Auto-load wiring

`ListingCards.astro` and `ListingTable.astro` each declare:

```astro
<script>
  import "../Lightbox/lightbox.ts";
</script>
```

Astro's script bundler dedupes across both components.

## Initialization

On first run, the script:

1. Sets `window.__csLightboxInit = true` and bails on re-execution (HMR / double imports).
2. Registers a single delegated `click` listener on `document` for `.cs-listing-image-btn`.
3. Does **not** build the overlay DOM at init. Overlay construction is deferred to the first matching click.

## Trigger flow

When a click on `.cs-listing-image-btn` is intercepted:

1. Read the `data-images` attribute on the button.
2. `JSON.parse` the value. On parse failure, malformed JSON, non-array, or empty array, return silently.
3. If the overlay DOM has not yet been built, build and append it to `<body>`.
4. Open the overlay with `(images, startIndex = 0, trigger = clickedButton)`.

## Overlay structure

```html
<div class="cs-lightbox" role="dialog" aria-modal="true"
     aria-label="Product image viewer" tabindex="-1" hidden>
  <button class="cs-lightbox-close" aria-label="Close">[close SVG]</button>
  <button class="cs-lightbox-prev"  aria-label="Previous image">[prev SVG]</button>
  <img    class="cs-lightbox-image" alt="">
  <button class="cs-lightbox-next"  aria-label="Next image">[next SVG]</button>
  <ol class="cs-lightbox-dots" role="tablist">
    <li><button class="cs-lightbox-dot" aria-label="Go to image N of M"></button></li>
    ...
  </ol>
</div>
```

Inline SVGs use `stroke="currentColor"` so theme color overrides via CSS work without touching markup.

## Behavior contract

- **Open**: shows current image, builds dots if `images.length > 1`, sets `data-single="true"` on overlay if exactly one image, prefetches non-current images via `new Image()`, locks page scroll, focuses close button on next animation frame, remembers the trigger element for focus return.
- **Close**: hides overlay, clears image src to free memory, unlocks scroll, returns focus to the original trigger.
- **Navigate**: prev/next buttons + dot clicks update the current index; dots' `aria-current` reflects state. Wraps modulo `images.length`. No-op when only one image.
- **Keyboard** (overlay-scoped, does not leak):
  - `Escape` → close
  - `ArrowLeft` → previous (only if more than one image)
  - `ArrowRight` → next (only if more than one image)
  - `Tab` / `Shift+Tab` → focus trap cycling through visible focusables in the overlay
- **Backdrop click** → close (only when `event.target` is the overlay container, not its children).
- **Single-image mode**: prev/next/dots are hidden via CSS (`[data-single]` selector); focus trap excludes them automatically since `display: none` makes them un-focusable.

## Scroll lock

The package's `defaults.css` defines `body { overflow: hidden }` with `.cs-page-scroll` as the actual scroll container. The lightbox script adds `cs-lightbox-open` to `<body>`; `Lightbox.css` carries:

```css
body.cs-lightbox-open .cs-page-scroll { overflow: hidden; }
```

## Token surface

| Token                              | Default                | Purpose                                  |
|------------------------------------|------------------------|------------------------------------------|
| `--cs-lightbox-backdrop`           | `rgba(0, 0, 0, 0.85)`  | Overlay backdrop fill                    |
| `--cs-lightbox-control-size`       | `3rem`                 | width/height of close, prev, next        |
| `--cs-lightbox-control-icon-size`  | `1.25rem`              | width/height of inner SVGs               |

Z-index is hardcoded (`1000`) — a lightbox by definition is on top. Image dimensions are not tokenized: image fills the viewport up to its natural dimensions via `max-width: 100vw; max-height: 100vh; width: auto; height: auto;` (no upscaling, no cropping).

A single set of control sizes (3rem) is used at all viewport sizes — 3rem at the default 16px base is 48px, clearing the 44px touch-target minimum. No mobile media query in the package.

## Class structure

| Class                            | Element                                          |
|----------------------------------|--------------------------------------------------|
| `.cs-lightbox`                   | overlay container (the `<div role="dialog">`)    |
| `.cs-lightbox-image`             | the `<img>`                                      |
| `.cs-lightbox-close`             | close button                                     |
| `.cs-lightbox-prev`              | previous-image button                            |
| `.cs-lightbox-next`              | next-image button                                |
| `.cs-lightbox-dots`              | the `<ol>` of indicators                         |
| `.cs-lightbox-dot`               | a single dot button                              |
| `body.cs-lightbox-open`          | applied to `<body>` while open, locks scroll     |
| `.cs-lightbox[data-single]`      | overlay state attribute when only one image      |

## Trigger affordance — update ListingCards.css and ListingTable.css

The `.cs-listing-image-btn` reset already exists in both `ListingCards.css` and `ListingTable.css`. Add the lightbox affordance to **both** rules:

```css
.cs-listing-image-btn {
  /* ...existing reset rules... */
  cursor: zoom-in;
}

.cs-listing-image-btn:focus-visible {
  outline: 2px solid var(--cs-focus-color, currentColor);
  outline-offset: 2px;
}
```

The button class is package-owned and the only thing the trigger ever does is open a lightbox; the affordance belongs with the class.

## Testing

Source-contract style, matching the existing pattern in `tests/unit/components/` (read source files, regex/parse, assert clauses; no jsdom):

- `lightbox-css.test.ts` — assert `Lightbox.css` contains:
  - `.cs-lightbox` rule with `position: fixed` and the `--cs-lightbox-backdrop` var.
  - `.cs-lightbox-image` rule with `max-width: 100vw`, `max-height: 100vh`, `width: auto`, `height: auto`.
  - `.cs-lightbox[data-single]` rule hiding prev/next/dots via `display: none`.
  - `body.cs-lightbox-open .cs-page-scroll { overflow: hidden }` scroll-lock.
- `lightbox-script.test.ts` — assert `lightbox.ts` source contains:
  - A delegated `click` listener registered on `document` matching `.cs-listing-image-btn` via `closest`.
  - Keyboard switch with cases for `Escape`, `ArrowLeft`, `ArrowRight`, `Tab`.
  - `__csLightboxInit` idempotency guard.
  - `JSON.parse` wrapped in try/catch with array-and-non-empty validation.
- `lightbox-auto-load.test.ts` — assert `ListingCards.astro` and `ListingTable.astro` each contain `import "../Lightbox/lightbox.ts"` inside a `<script>` block.
- Update `listing-cards-image-btn-reset.test.ts` (and the table equivalent) to assert the `.cs-listing-image-btn` rule includes `cursor: zoom-in` and a focus-visible outline — the trigger affordance contract that moved into the package.

## Reference material

The `reference/` directory contains a working implementation of the lightbox behavior and styling. Adapt these to fit the package's conventions; do not paste them verbatim.

### `reference/lightbox.js`

Overlay build, keyboard handling, focus trap, navigation (prev/next/dots), image prefetch, scroll lock, delegated click handler. The behavior contract is correct as written; you can lift the function bodies (overlay construction, `onKeydown`, `getFocusables`, `trapFocus`, `renderDots`, `updateDots`, `showCurrent`, `navigate`, `goTo`, `prefetchOthers`, `open`, `close`, `onTriggerClick`, `init`) and adapt:

- Convert from JS to TS. Add types for the `state` object, the image shape (`{ url: string; alt?: string }`), and function signatures.
- Rename overlay classes from `df-lightbox-*` → `cs-lightbox-*`. The body class becomes `cs-lightbox-open`.
- The `cs-listing-image-btn` selector in the click handler is correct as-is.
- The `__dfLightboxInit` flag becomes `__csLightboxInit`.
- The current implementation builds the overlay at `init()`. Switch to lazy: `init()` only registers the click listener; the click handler builds the overlay on first invocation if it has not been built.
- Inline SVG icon strings stay; verify `stroke="currentColor"` is present.

### `reference/_lightbox.scss`

Overlay styling: backdrop, image sizing, control button reset and positioning, dot indicators, single-image hide, scroll lock. Adapt as `Lightbox.css` (plain CSS) at the package layer:

- Wrap rules in `@layer package { ... }` to match the rest of the package's CSS.
- Rename selectors from `.df-lightbox-*` → `.cs-lightbox-*`.
- Replace theme-side color values with the three tokens defined above and sensible default colors. Do **not** carry forward the `--df-*` token references — they are not part of the package.
- Update the image rule from `max-width: 95vw; max-height: 90vh` to `max-width: 100vw; max-height: 100vh; width: auto; height: auto` (no fixed margins; image fills viewport up to natural size).
- The `body.df-lightbox-open .cs-page-scroll { overflow: hidden }` rule becomes `body.cs-lightbox-open .cs-page-scroll { overflow: hidden }` and stays — `.cs-page-scroll` is package-owned.
- **Drop** the `@media (max-width: 480px)` block entirely. Package ships a single set of control sizes that work at all viewport sizes.
- The `.cs-listing-image-trigger` rules are obsolete — the trigger is `.cs-listing-image-btn`, package-owned, and the affordance moves into `ListingCards.css` / `ListingTable.css` per the section above.
