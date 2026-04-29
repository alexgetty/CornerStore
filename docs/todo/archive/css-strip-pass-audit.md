# CSS Strip Pass Audit

Audit driving Phase 2 implementation: extract light-mode opinion from auto-loaded package CSS into a public starter theme, force every package-side `var(--cs-*)` to carry an explicit structural-neutral fallback at the rule site, tokenize remaining hardcoded structural values, and update `bin/init.mjs` to keep init parity.

**Read-only audit. No production edits in this pass.**

## Section index

1. Settled architecture (recap)
2. Per-file rule-level findings
   - `src/styles/defaults.css`
   - `src/styles/palette.css`
   - `src/styles/reset.css`
   - `src/layouts/ContentPage.css`
   - `src/components/Cart/Cart.css`
   - `src/components/CartControl/CartControl.css`
   - `src/components/CartWidget/*.css`
   - `src/components/Listings/Listings.css`
   - `src/components/Listings/ListingTable.css`
   - `src/components/Nav/*.css`
   - `src/components/StatusPage/*.css`
3. Bare token references inventory (drives approach (a) fallback pass)
4. Starter theme path proposal + `package.json` exports shape
5. Init parity changes (`bin/init.mjs`)
6. Test impact
7. Findings missed by prior pass

---

(Sections will be filled in incrementally.)
