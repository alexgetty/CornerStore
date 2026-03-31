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

## Design & Development Principles

**Read [`docs/principles.md`](docs/principles.md) before making design or implementation decisions.** Covers product strategy, product rules, content architecture, CSS architecture, theming, and usability.

## Test-Driven Development

**Read [`docs/tdd.md`](docs/tdd.md) before writing any implementation code.** Strict TDD, no exceptions. Red -> Green -> Refactor. 100% coverage. No implementation without a failing test.

## Documentation

Code and docs stay in sync. Any change to behavior requires updating the corresponding documentation in the same unit of work. Tests, implementation, and docs ship together — never separately.

- If a function's behavior changes, its SETUP.md reference gets updated in the same commit.
- If an error message changes, the troubleshooting section gets updated in the same commit.
- If a feature is added or removed, the relevant docs reflect it before the work is considered done.

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
