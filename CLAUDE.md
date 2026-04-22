# Corner Store — Storefront

## What This Is

Storefront infrastructure for indie makers who want to sell direct — wholesale, DTC, or both — without paying marketplace commissions. Static site + Stripe pipeline. The platform is agnostic to the seller's business model; the same infrastructure powers a wholesale catalog for shop owners and a consumer-facing product page.

Part of the Little BigSmall product family.

## Mission

Makers deserve cheap infrastructure to power their value-add businesses. Every dollar saved on platform fees is a dollar that stays with the person who made the thing.

## Distribution

**Primary:** NPM package with a CLI init command (`cornerstore init`) that scaffolds the user's project — bundle directory, theme template, config. This is the documented, supported path. All guides, onboarding, and educational resources target this model.

**Secondary:** The repo is open source. Anyone can clone or fork it. This is allowed but not actively supported with documentation or onboarding resources. Tinkerers can figure it out.

Every barrel export is a public API contract — treat exports deliberately. See `docs/todo/export-audit.md`.

## Init Parity — MANDATORY

**The primary distribution path is `cornerstore init`. A feature that works in this repo but doesn't work in a freshly scaffolded consumer project is NOT SHIPPED.**

The repo itself is the library. Consumers do not inherit `src/pages/`, they get a scaffolded copy from `bin/init.mjs`. Library components are imported from the npm package. Anything outside that contract (pages, routes, config keys, env vars, CSV columns, Astro output mode, adapters) must be produced by `bin/init.mjs` in the same commit as the feature.

### Before claiming any feature is done, verify each item:

1. **New file under `src/pages/`?** (including `.json.ts` endpoints, API routes, `[slug]` routes) → `bin/init.mjs` must emit an equivalent file in the consumer's `src/pages/`. If the page is generic, a thin scaffold that imports a factory from the library is preferred over duplicating logic.
2. **New key in `StoreConfig`?** → the scaffolded `cornerstore.config.js` must offer it, or the feature must document the default. Either prompt for it at init time or include it in the scaffold with a comment.
3. **New component consumers instantiate?** → `bin/init.mjs` must wire it into the scaffolded page that uses it.
4. **New CSV column, env var, or runtime requirement?** → `bin/init.mjs` must produce a valid example (correct column count in sample rows, placeholder env var with instructions, etc.).
5. **Feature requires a server runtime (API route, SSR, adapter)?** → `bin/init.mjs` must configure `output: 'server'` or `'hybrid'` and install + configure the Astro adapter. Static-mode scaffolds **cannot host server endpoints.**
6. **Library factory that consumers mount (like `createCheckoutHandler`)?** → `bin/init.mjs` must scaffold the thin route file that imports and mounts it.

### Definition of done test

After your changes, run `cornerstore init` into a fresh empty directory. Install deps. Run the build. Exercise the feature end-to-end in the scaffolded project. If you can't, init is out of sync and the feature is not done.

### Violation history (active gaps tracked in `docs/todo/init-parity-audit.md`)

- Cart + checkout exported `createCheckoutHandler` but never scaffolded `src/pages/api/checkout.ts`. Scaffold is also stuck on `output: 'static'` which can't run the route. Every consumer project has a broken checkout button.
- `/product-names.json` endpoint for H4 was added to this repo's `src/pages/` without updating init. Consumers don't get it.
- `wholesaleMargin`, `shippingFlat`, `shippingFreeThreshold`, `checkoutUrl` config keys exist in types, work in the library, never surface in init.

**If you notice you are about to add a feature without updating init, STOP and write the init change first.**

## Design & Development Principles

**Read [`docs/principles.md`](docs/principles.md) before making design or implementation decisions.** Covers product strategy, product rules, content architecture, CSS architecture, theming, and usability.

## Test-Driven Development

**Read [`docs/tdd.md`](docs/tdd.md) before writing any implementation code.** Strict TDD, no exceptions. Red -> Green -> Refactor. 100% coverage. No implementation without a failing test.

## Documentation

Code and docs stay in sync. Any change to behavior requires updating the corresponding documentation in the same unit of work. Tests, implementation, and docs ship together — never separately.

- If a function's behavior changes, any doc that references it gets updated in the same commit.
- If an error message changes, any referenced troubleshooting content gets updated in the same commit.
- If a feature is added or removed, the relevant docs reflect it before the work is considered done.

Note: `docs/SETUP.md` was deleted (the whole setup/onboarding doc needs a rewrite once the product stabilizes). Do NOT re-add SETUP.md-style deep links in error messages or code comments until the replacement is written.

Stale docs are bugs.

## Green / Red Team

Two adversarial modes for rigorous development.

**Green Team** — Build mode. Plan features, write code, ship solutions. Assumes the path forward exists.

**Red Team** — Break mode. Adversarial review. Finds holes in plans before Green builds. Finds bugs in code before Green ships. Assumes everything is broken until proven otherwise.

**Workflow:**
1. Green plans -> Red tears apart -> Green rebuilds stronger
2. Green implements -> Red attacks -> Green hardens

**Rules:**
- Red never implements, only directs
- Green never reviews its own work
- Red findings feed directly back to Green as actionable items

### Red Team Code Review

Review tests BEFORE implementation. Tests are the spec.

**Phase 1 — Test Scrutiny:**
- Missing boundaries (0, 1, MAX, negative, empty)
- Untested error paths
- Implementation coupling (testing behavior or internals?)
- False confidence (always-true assertions, over-mocked)
- Missing integration coverage

**Phase 2 — Implementation Review:**
- Untested code paths
- Unvalidated assumptions about inputs
- Silent failures (caught and swallowed errors)
- Resource leaks
- Security issues (injection, auth bypass, data exposure)
- Race conditions

### Red Team Plan Review

Attack the thinking, not the implementation.

- **Logic**: Do the pieces fit together? Does solving A make B impossible?
- **Assumptions**: What's taken for granted that might be wrong?
- **Completeness**: What happens when things fail?
- **Scope**: Is complexity proportional to the problem?
- **Feasibility**: Can this actually be built with stated constraints?
