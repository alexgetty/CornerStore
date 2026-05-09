# Playwright / Browser-Layout Test Harness

## Status

Open. No browser-level test infrastructure exists in the repo today. Source-level (vitest) tests cover logic, markup contracts, and CSS rule presence, but cannot verify anything that depends on real CSS layout, real font metrics, real paint, or real user interaction across multiple frames.

## Problem

The repo's test stack is vitest with a node environment by default. The deferred DOM-fixture work (`docs/todo/cart-listings-test-coverage.md`) adds `happy-dom` for selector and event coverage, but neither `happy-dom` nor `jsdom` implements CSS layout. `getBoundingClientRect()` returns zero on every element in both. Anything that asks "does this look right when the browser actually renders it" cannot be answered by the current stack.

That gap is currently filled by manual eyeball checks, which means regressions ship.

## Motivating examples

Concrete assertions that exist only as source-level proxies today and would benefit from a real-browser check:

- **ListingTable column stability under cart-state transitions.** The recent `table-layout: fixed` plus per-column width hooks plus `tabular-nums` work pins the CSS contract at the source level, but the assertion the user actually cares about is "every `<th>` and first-row `<td>` width is byte-identical across empty cart, qty 1, qty 10, qty 100, line total $0.00, line total $1,234.56, and remove-last-item." That is a `getBoundingClientRect` snapshot under real layout.
- **Catalog responsive breakpoints.** The card/table view toggle and the mobile listing table layout (`docs/todo/listing-table-mobile.md`) have visual contracts that only manifest at specific viewport widths. Source tests cannot check that nothing reflows past its breakpoint.
- **Cart banner and unavailable-notice visibility.** The interaction between `.cs-cart-unavailable-banner`, `.cs-unavailable-notice`, the submit-disabled state, and the clear-unavailable button is a multi-step user flow with paint between each step.
- **PDF rendering (print mode).** The PDF generation path strips interactive controls and unavailable-banner markup. Verifying the cloned content actually paints correctly requires a real browser with `window.print` or html2pdf or whichever path is used.
- **Init-parity smoke tests** (`docs/todo/init-parity-manual-smoke.md`). Steps 6 and 7 of the init DoD currently require a human running a dev server. Playwright would let those run unattended.
- **Focus rings, tab order, keyboard activation.** Accessibility contracts that depend on real focus management.
- **Animation / transition correctness.** Anything that lives in `@keyframes` or transition timing (e.g. cart row enter/exit if added later) cannot be checked without a real frame loop.

## Why this is its own work item

Adding a browser test tier touches dependencies, CI config, fixture conventions, and screenshot/baseline storage. It is not a small bolt-on, and it has zero overlap with the deferred DOM-fixture work. The two tiers are complementary:

- **Vitest + happy-dom**: logic, selectors, events, markup contracts, CSS rule presence. Fast, runs on every commit.
- **Playwright**: real layout, real paint, real input. Slower, runs on a smaller cadence.

This todo is the placeholder for standing up the second tier. It should not be merged into the cart/listings DOM-coverage todo.

## Prerequisites

1. Decide whether Playwright runs as `@playwright/test` (its own runner) or as a vitest browser-mode adapter. Default recommendation: standalone `@playwright/test`. Vitest browser-mode is still maturing and the two test surfaces are different enough that conflating them adds friction.
2. Decide on browser matrix. Default: chromium only at first. Add firefox and webkit when a real cross-browser bug surfaces.
3. Decide on baseline screenshot strategy. Options: commit baselines to the repo (large, noisy diffs but self-contained), or store them in CI artifact storage (clean repo but adds infra). Default: commit, with a `.gitattributes` rule that marks them binary so diffs don't explode.
4. Decide where tests live. Default: `tests/e2e/` to keep the source tree separate from `tests/unit/`. Existing `tests/unit/` patterns do not transfer.
5. Decide how Playwright tests get a built site to point at. Default: tests start the Astro dev server (or a preview server against `dist/`) via Playwright's `webServer` config.

None of these are one-way doors. Land defaults and revise once the first few tests exist.

## Initial scope

Bring up the harness with one test that closes the most concrete known gap: ListingTable column-width byte-stability across cart-state transitions. That single test exercises every piece of the harness (server boot, fixture seeding, layout snapshots, assertion helpers). Once it passes, port the rest of the motivating examples one at a time as separate work items.

## Acceptance criteria for the harness itself

- `npm run test:e2e` boots a server, runs Playwright against it, and reports pass/fail.
- A documented helper for seeding cart state in localStorage before navigation, mirroring the existing cart store API.
- A documented helper for snapshotting `getBoundingClientRect` on a set of elements and comparing against a previous snapshot with byte-equality.
- One real test (column-width stability) that exercises the helpers end-to-end.
- CI config decision made: either `npm run ci` runs e2e, or e2e is its own job. Default: separate job, optional on PRs, required on main. Browser tests are slow; keeping them out of the unit-test loop preserves the existing fast feedback.
- README or `docs/principles.md` updated to describe the two test tiers and when to use each.

## Out of scope

- Visual regression screenshots beyond layout-coordinate snapshots. Pixel-diff screenshot testing is its own rabbit hole (anti-aliasing, font rendering, OS differences). Defer until a concrete need.
- Cross-browser matrix beyond chromium. Add when a real bug surfaces.
- Replacing any existing vitest tests. The two tiers are additive.
- Running e2e on every commit. CI cadence is a separate decision; the default above is "main only".

## Files you'll touch

- New: `playwright.config.ts`
- New: `tests/e2e/helpers/cart.ts` (seed cart state)
- New: `tests/e2e/helpers/layout.ts` (rect snapshots, equality assertions)
- New: `tests/e2e/listing-table-column-stability.spec.ts` (the first real test)
- Edit: `package.json` (add `@playwright/test` devDep, `test:e2e` script)
- Edit: `.gitignore` and `.gitattributes` for test artifacts
- Edit: `README.md` or `docs/principles.md` (test-tier documentation)

## Don't touch

- `vitest.config.ts` or any unit tests. This work is purely additive.
- Library source. The first Playwright test verifies existing behavior; if it fails, that is a finding for a separate todo, not an in-line fix.

## Source

Spawned from the ListingTable column-shift fix on 2026-05-04. The fix landed source-level CSS-rule tests but explicitly deferred the runtime layout assertion because no browser harness exists. This todo is that harness.

When the harness lands, port the column-stability assertion as the first real test and link back to this todo from the resolution.
