# Test-Driven Development

Strict TDD. No exceptions. No implementation code exists without a failing test that demanded it.

## Why

Agents write plausible code that looks correct but introduces entropy — untested paths, edge cases that "should work," defensive code that may or may not do anything. Strict TDD inverts this. The test defines the contract before implementation. 100% coverage means nothing sneaks past.

## The Rule

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

## Workflow

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

## Test Scope

| Level | What it tests | Mocks? | When |
|-------|---------------|--------|------|
| Unit | Single function/method in isolation | Yes | Before implementation |
| Integration | Multiple real components together | Minimal | Before implementation |
| Contract | Implementations against interfaces | No | Before implementation |
| End-to-end | Full user journey through system | No | After implementation |

## Coverage Standards

- **100% lines. 100% branches. No exceptions.** CI fails if coverage drops.
- Exhaustive coverage for type guards: N conditions = N tests.
- Parameterized tests for method validation: cover all methods systematically.
- No spot-checking. Test all paths.

**Genuinely untestable lines:** Exhaust all options first (mock it, inject a dependency, restructure). If truly untestable, use a coverage ignore comment with mandatory explanation. Every ignore comment is a flag for future review.

## No Flaky Tests

A flaky test is worse than no test. Flaky tests erode trust and train people to ignore failures.

- Never use `setTimeout` as synchronization. Use deterministic signals.
- Async resources must expose readiness (promises, events, callbacks).
- Use `waitFor` with assertions, not delays.
- Isolate external dependencies. No shared state between tests.
- Make assertions deterministic.

If you find a flaky test: treat it as a critical bug, identify the race condition, fix the API not the test, run multiple times to verify.

## Anti-Patterns

- **Never loosen tests to make code pass.** Fix the code or fix a genuinely broken test.
- **Never skip tests.** A skipped test is a lie about coverage.
- **Never write implementation without a failing test.**
