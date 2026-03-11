# Corner Store — Storefront

## What This Is

Storefront infrastructure for indie makers who want to sell direct — wholesale, DTC, or both — without paying marketplace commissions. Static site + Stripe pipeline. The platform is agnostic to the seller's business model; the same infrastructure powers a wholesale catalog for shop owners and a consumer-facing product page.

Part of the Little BigSmall product family.

## Mission

Makers deserve cheap infrastructure to power their value-add businesses. Every dollar saved on platform fees is a dollar that stays with the person who made the thing.

## Product Rules

These are non-negotiable. They don't change with scope, timeline, or priorities.

- **No feature gating. Ever.** Self-hosted gets every feature for free, forever. Hosted gets every base feature for free. You only pay commission when you're making money.
- **Stripe is the single source of truth.** Pricing, SKUs, descriptions, images — all live in Stripe. No separate storage layer.
- **The architecture IS the pricing model.** Client-side generated URLs can only contain one product at a time. Multi-product cart requires exactly one serverless function. This technical constraint maps to product tiers.
- **Commission-based, not subscription.** Paid features are priced as incremental commission percentages, not flat monthly fees. Cost scales with revenue. Feels fair at every scale.
- **Open source is distribution, not charity.** Every self-hosted storefront is a billboard and proof of concept. The code being open is the growth strategy.
- **Compete on experience, not lock-in.** If someone forks the code and serves makers well, that's a win.

## Architecture Principles

- Static site + Stripe Checkout for single-product transactions (no backend needed)
- Serverless function for multi-product cart checkout (the one backend requirement)
- Stripe API for all product data — no database, no CMS
- Storefront components will be built on BigSmall Blocks (shared component library, currently "The Construct"). Not integrated yet — will be introduced when moving from prototype to launch-ready.
- Catalog management is handled by Back Office (separate product, not part of this repo)

## Product Tiers

| Tier | Infrastructure | Cart | Cost |
|------|---------------|------|------|
| Self-Hosted Simple | User hosts static site | Single product per checkout | Free forever |
| Self-Hosted Full | User hosts static site + serverless function | Multi-product cart | Free forever |
| Hosted Free | We host everything | Multi-product cart | Free up to $1K/mo revenue |
| Hosted Paid | We host everything | Multi-product cart | Commission-based above threshold |

## Test-Driven Development

Strict TDD. No exceptions. No implementation code exists without a failing test that demanded it.

### Why

Agents write plausible code that looks correct but introduces entropy — untested paths, edge cases that "should work," defensive code that may or may not do anything. Strict TDD inverts this. The test defines the contract before implementation. 100% coverage means nothing sneaks past.

### The Rule

**Red -> Green -> Refactor.** No shortcuts.

1. **Red**: Write a failing test that defines expected behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping tests green

If there's no failing test, there's no reason to write code.

> **STOP. Before you edit any implementation file, ask yourself:**
> 1. Have I written or modified a test for this change?
> 2. Did I run that test and watch it fail?
>
> If the answer to either is "no", you are violating TDD. Step back. Write the test first. This is not optional.

**When adding tests for existing code**, temporarily break the implementation to verify the test fails. A test that can't catch a regression is worthless.

### Workflow

**Before writing any code:**
1. Identify the behavior to implement
2. Write a test that exercises that behavior
3. Run the test — confirm it fails
4. Only then write implementation

**During implementation:**
- Write only enough code to pass the current failing test
- Resist the urge to "finish" the implementation
- Each new behavior requires a new failing test first

**After tests pass:**
- Refactor if needed (tests stay green)
- No new functionality during refactor

**After feature complete:**
- Write E2E tests that verify the full user journey
- E2E tests come after implementation because you need a working system to test
- These catch composition bugs that unit tests miss

### Test Scope

| Level | What it tests | Mocks? | When |
|-------|---------------|--------|------|
| Unit | Single function/method in isolation | Yes | Before implementation |
| Integration | Multiple real components together | Minimal | Before implementation |
| Contract | Implementations against interfaces | No | Before implementation |
| End-to-end | Full user journey through system | No | After implementation |

### Coverage Standards

- **100% lines. 100% branches. No exceptions.** CI fails if coverage drops.
- Exhaustive coverage for type guards: N conditions = N tests.
- Parameterized tests for method validation: cover all methods systematically.
- No spot-checking. Test all paths.

**Genuinely untestable lines:** Exhaust all options first (mock it, inject a dependency, restructure). If truly untestable, use a coverage ignore comment with mandatory explanation. Every ignore comment is a flag for future review.

### No Flaky Tests

A flaky test is worse than no test. Flaky tests erode trust and train people to ignore failures.

- Never use `setTimeout` as synchronization. Use deterministic signals.
- Async resources must expose readiness (promises, events, callbacks).
- Use `waitFor` with assertions, not delays.
- Isolate external dependencies. No shared state between tests.
- Make assertions deterministic.

If you find a flaky test: treat it as a critical bug, identify the race condition, fix the API not the test, run multiple times to verify.

### Anti-Patterns

- **Never loosen tests to make code pass.** Fix the code or fix a genuinely broken test.
- **Never skip tests.** A skipped test is a lie about coverage.
- **Never write implementation without a failing test.**

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
