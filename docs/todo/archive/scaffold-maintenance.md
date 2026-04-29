# Scaffold Maintenance — Small Cleanups

## Closed 2026-04-29 — won't do

Reviewed on 2026-04-29; remaining items declined.

- Item 1 (quoting style drift in `buildConfigFile`): low value, legible at current size, no live consumer pain. Revisit if a new key actually tips it.
- Item 2 (duplicated `'pdf'` default): hypothetical brittleness. Three call sites, all in one repo, all caught immediately by tests if they drift.
- Item 3 (brittle error-message substring assertions): the tests pass and document intended messages. Refactoring to typed errors is its own design change, not maintenance.
- Item 4 (dead variable in `bin/init.mjs`): already shipped (`84a392e`).
- Item 5 (validation asymmetry in `parseConfig`): the asymmetry is intentional and documented inline at `src/lib/storefront/config.ts:14`. Not a defect.

## Status

Open. Non-blocking. Surfaced by Task 1 / Task 2 code reviews for the `checkout` mode config work (commits `2b904b3` through `9b6f330`).

## Why this exists

Individual cleanup items that don't justify their own tracking docs. Pick off opportunistically or in a dedicated cleanup pass.

## Items

### 1. `buildConfigFile` quoting style is fraying

**File:** `bin/scaffold.mjs:30-71`.

**Problem:** Mixes four quoting idioms in one function:
- Array-pushed lines
- `JSON.stringify` for objects (double quotes)
- `'${x}'` template literals for string values (single quotes)
- Number literal interpolation

**Example of the drift:** `contact` gets double-quoted (`"..."` via `JSON.stringify`), `checkout` gets single-quoted (`'...'` via template literal). A consumer running a formatter will see a one-line change on first edit.

**Fix direction:** Introduce a small `emitKey(k, v)` helper that picks the right quoter based on value type. Or commit to a single format throughout.

**Priority:** Low. Legible at current size. Adding one more key will tip it.

### 2. Duplicated `'pdf'` default across three files

**Files:**
- `bin/scaffold.mjs:6` (parse)
- `bin/scaffold.mjs:13` (derive from existing config)
- `src/lib/storefront/config.ts:12` (parseConfig default)

**Problem:** Three places hardcode the default `checkout: 'pdf'`. Changing the default requires three edits and risks missing one.

**Fix direction:** Extract `DEFAULT_CHECKOUT` constant. `bin/scaffold.mjs` is ESM and can import from the built library, or define its own local constant with a doc note that it must match the library. Both options have tradeoffs — discuss before implementing.

**Priority:** Low. Not shipping soon.

### 3. Brittle error-message substring assertions

**Files:**
- `tests/unit/storefront/config.test.ts` — multiple assertions use regex patterns like `/checkout.*must be.*'pdf'.*'stripe'/i`. Rewording the error message breaks five tests at once.
- `tests/unit/bin/init.test.ts:87` — pins the exact placeholder URL (`https://your-server.example.com/api/checkout`). Brittle to cosmetic copy changes.

**Fix direction:**
- For config validator errors: introduce typed errors (e.g. `InvalidConfigError`) and assert on the error type rather than message substrings. Keep one canary test per message for documentation.
- For the init test: relax to a pattern like `/\/\/\s*checkoutUrl:\s*'https?:\/\/.+\/api\/checkout'/`.

**Priority:** Low. Current tests work; refactor opportunistically.

### 4. ~~Dead variable in `bin/init.mjs`~~ ✅ Done

**Resolved in:** `84a392e`. `let linked = false` and its assignment removed. Surrounding `try/catch` kept (independent purpose: tolerate missing global link so subsequent `npm install` can fetch from registry).

### 5. Validation asymmetry in `parseConfig`

**File:** `src/lib/storefront/config.ts`.

**Problem:** `checkout` throws on invalid input; every other optional field (`contact`, `logo`, `minCartSize`, `wholesaleMargin`, `shippingFlat`, `shippingFreeThreshold`, `checkoutUrl`) silently falls back or omits on invalid input. A one-line comment on `checkout` documents why the asymmetry exists, but the other fields may deserve the same strict treatment (silent defaulting of a malformed `wholesaleMargin` is also a potential footgun).

**Fix direction:** Either graduate other fields to throwing (breaking behavior change for any consumers currently sending malformed values), or document the current asymmetry more broadly. Leave for a larger review of config-parser philosophy.

**Priority:** Medium. Gets louder the more fields the config grows.

## Definition of done

Each item can be closed independently. No single end-state for the whole file — items may be picked off one at a time or deferred indefinitely.
